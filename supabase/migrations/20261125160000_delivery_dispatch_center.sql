-- MGW DELIVERY — ETAPA 4: CENTRAL DE DESPACHO E DISTRIBUIÇÃO DE ENTREGAS
-- Adds courier_type ('own' | 'outsourced') to delivery_couriers,
-- creates delivery_dispatches and delivery_dispatch_history tables,
-- prevents duplicate active assignments per order, enforces strict multi-tenant RLS,
-- and provides atomic SECURITY DEFINER RPCs synchronized with online_orders.

-- 1) Estende delivery_couriers com o tipo de entregador (Próprio vs Terceirizado)
ALTER TABLE public.delivery_couriers
  ADD COLUMN IF NOT EXISTS courier_type text NOT NULL DEFAULT 'own';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'delivery_couriers_courier_type_check'
      AND conrelid = 'public.delivery_couriers'::regclass
  ) THEN
    ALTER TABLE public.delivery_couriers
      ADD CONSTRAINT delivery_couriers_courier_type_check
      CHECK (courier_type IN ('own', 'outsourced'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_delivery_courier_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.name := left(btrim(coalesce(NEW.name, '')), 120);
  NEW.phone := left(btrim(coalesce(NEW.phone, '')), 32);
  NEW.normalized_phone := public.normalize_br_phone(NEW.phone);
  NEW.whatsapp := left(btrim(coalesce(NEW.whatsapp, '')), 32);
  NEW.normalized_whatsapp := CASE
    WHEN length(btrim(NEW.whatsapp)) >= 8 THEN public.normalize_br_phone(NEW.whatsapp)
    ELSE ''
  END;
  NEW.cpf := left(regexp_replace(coalesce(NEW.cpf, ''), '[^0-9]', '', 'g'), 14);
  NEW.email := left(lower(btrim(coalesce(NEW.email, ''))), 160);
  NEW.motorcycle_brand := left(btrim(coalesce(NEW.motorcycle_brand, '')), 60);
  NEW.motorcycle_model := left(btrim(coalesce(NEW.motorcycle_model, '')), 80);
  NEW.motorcycle_color := left(btrim(coalesce(NEW.motorcycle_color, '')), 40);
  NEW.motorcycle_plate := left(upper(regexp_replace(btrim(coalesce(NEW.motorcycle_plate, '')), '[^A-Za-z0-9-]', '', 'g')), 16);
  NEW.courier_type := CASE
    WHEN NEW.courier_type = 'outsourced' THEN 'outsourced'
    ELSE 'own'
  END;
  NEW.status := CASE
    WHEN NEW.status = 'inactive' THEN 'inactive'
    ELSE 'active'
  END;
  NEW.availability_status := CASE
    WHEN NEW.status = 'inactive' THEN 'unavailable'
    WHEN NEW.availability_status = 'unavailable' THEN 'unavailable'
    ELSE 'available'
  END;
  NEW.notes := left(btrim(coalesce(NEW.notes, '')), 1000);
  RETURN NEW;
END;
$$;

-- 2) Tabela principal de despachos por pedido de entrega
CREATE TABLE IF NOT EXISTS public.delivery_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.delivery_couriers(id) ON DELETE RESTRICT,
  dispatch_status text NOT NULL DEFAULT 'awaiting_acceptance'
    CHECK (dispatch_status IN (
      'awaiting_dispatch',
      'courier_assigned',
      'awaiting_acceptance',
      'delivery_accepted',
      'preparing',
      'ready_for_dispatch',
      'out_for_delivery',
      'delivered',
      'delivery_rejected',
      'delivery_cancelled'
    )),
  courier_name_snapshot text NOT NULL DEFAULT '' CHECK (length(courier_name_snapshot) <= 120),
  courier_phone_snapshot text NOT NULL DEFAULT '' CHECK (length(courier_phone_snapshot) <= 32),
  courier_type_snapshot text NOT NULL DEFAULT 'own' CHECK (courier_type_snapshot IN ('own', 'outsourced')),
  assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by_email text NOT NULL DEFAULT '' CHECK (length(assigned_by_email) <= 160),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  rejection_reason text NOT NULL DEFAULT '' CHECK (length(rejection_reason) <= 300),
  cancellation_reason text NOT NULL DEFAULT '' CHECK (length(cancellation_reason) <= 300),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para isolamento por tenant, fila de despacho e prevenção de duplicidade ativa
CREATE INDEX IF NOT EXISTS idx_delivery_dispatches_tenant_status
  ON public.delivery_dispatches (tenant_id, dispatch_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_dispatches_tenant_courier
  ON public.delivery_dispatches (tenant_id, courier_id, dispatch_status);

CREATE INDEX IF NOT EXISTS idx_delivery_dispatches_order_created
  ON public.delivery_dispatches (order_id, created_at DESC);

-- Impede estritamente duas atribuições ativas simultâneas para o mesmo pedido
CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery_dispatches_active_order
  ON public.delivery_dispatches (order_id)
  WHERE dispatch_status NOT IN ('delivered', 'delivery_rejected', 'delivery_cancelled');

-- 3) Histórico operacional completo das atribuições e mudanças de estado
CREATE TABLE IF NOT EXISTS public.delivery_dispatch_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dispatch_id uuid NOT NULL REFERENCES public.delivery_dispatches(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  courier_id uuid REFERENCES public.delivery_couriers(id) ON DELETE SET NULL,
  courier_name text NOT NULL DEFAULT '' CHECK (length(courier_name) <= 120),
  from_status text
    CHECK (from_status IS NULL OR from_status IN (
      'awaiting_dispatch',
      'courier_assigned',
      'awaiting_acceptance',
      'delivery_accepted',
      'preparing',
      'ready_for_dispatch',
      'out_for_delivery',
      'delivered',
      'delivery_rejected',
      'delivery_cancelled'
    )),
  to_status text NOT NULL
    CHECK (to_status IN (
      'awaiting_dispatch',
      'courier_assigned',
      'awaiting_acceptance',
      'delivery_accepted',
      'preparing',
      'ready_for_dispatch',
      'out_for_delivery',
      'delivered',
      'delivery_rejected',
      'delivery_cancelled'
    )),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text NOT NULL DEFAULT '' CHECK (length(actor_email) <= 160),
  actor_type text NOT NULL DEFAULT 'admin' CHECK (actor_type IN ('admin', 'courier', 'system')),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_dispatch_history_tenant_order
  ON public.delivery_dispatch_history (tenant_id, order_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_delivery_dispatch_history_dispatch
  ON public.delivery_dispatch_history (dispatch_id, created_at ASC);

-- Triggers de integridade temporal e proteção contra troca de tenant_id
DROP TRIGGER IF EXISTS trg_delivery_dispatches_updated_at ON public.delivery_dispatches;
CREATE TRIGGER trg_delivery_dispatches_updated_at
  BEFORE UPDATE ON public.delivery_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_prevent_tenant_id_change_delivery_dispatches ON public.delivery_dispatches;
CREATE TRIGGER trg_prevent_tenant_id_change_delivery_dispatches
  BEFORE UPDATE ON public.delivery_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_prevent_tenant_id_change_delivery_dispatch_history ON public.delivery_dispatch_history;
CREATE TRIGGER trg_prevent_tenant_id_change_delivery_dispatch_history
  BEFORE UPDATE ON public.delivery_dispatch_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_id_change();

-- 4) Segurança Multi-Tenant (RLS estrito; escrita exclusivamente via RPCs validadas)
ALTER TABLE public.delivery_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_dispatch_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_dispatches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.delivery_dispatches TO authenticated;

REVOKE ALL ON TABLE public.delivery_dispatch_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.delivery_dispatch_history TO authenticated;

DROP POLICY IF EXISTS delivery_dispatches_select_tenant ON public.delivery_dispatches;
CREATE POLICY delivery_dispatches_select_tenant
  ON public.delivery_dispatches
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_dispatch_history_select_tenant ON public.delivery_dispatch_history;
CREATE POLICY delivery_dispatch_history_select_tenant
  ON public.delivery_dispatch_history
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

-- 5) RPC: Atribuir entregador a um pedido de entrega
CREATE OR REPLACE FUNCTION public.assign_delivery_courier(
  p_order_id uuid,
  p_courier_id uuid,
  p_notes text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.online_orders%ROWTYPE;
  v_courier public.delivery_couriers%ROWTYPE;
  v_actor_uid uuid := auth.uid();
  v_actor_email text := '';
  v_now timestamptz := now();
  v_notes text := left(btrim(coalesce(p_notes, '')), 500);
  v_dispatch_id uuid;
BEGIN
  IF v_actor_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada ou usuário não autenticado.';
  END IF;

  SELECT * INTO v_order
  FROM public.online_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF NOT public.has_active_tenant_access(v_order.tenant_id)
     OR NOT public.has_tenant_role(v_order.tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Acesso negado para despachar entregas deste estabelecimento.';
  END IF;

  IF v_order.fulfillment_type <> 'delivery' THEN
    RAISE EXCEPTION 'Pedidos de retirada no balcão não podem ser enviados para entrega.';
  END IF;

  IF v_order.status IN ('completed', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Pedido já finalizado não pode receber entregador.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.delivery_dispatches d
    WHERE d.order_id = p_order_id
      AND d.dispatch_status NOT IN ('delivered', 'delivery_rejected', 'delivery_cancelled')
  ) THEN
    RAISE EXCEPTION 'Este pedido já possui um entregador ativo atribuído.';
  END IF;

  SELECT * INTO v_courier
  FROM public.delivery_couriers
  WHERE id = p_courier_id
    AND tenant_id = v_order.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entregador não encontrado neste estabelecimento.';
  END IF;

  IF v_courier.status <> 'active' THEN
    RAISE EXCEPTION 'Entregador inativo não pode ser atribuído a uma entrega.';
  END IF;

  IF v_courier.availability_status <> 'available' THEN
    RAISE EXCEPTION 'Entregador indisponível no momento não pode receber entregas.';
  END IF;

  SELECT coalesce(tm.email, '') INTO v_actor_email
  FROM public.tenant_members tm
  WHERE tm.tenant_id = v_order.tenant_id
    AND tm.user_id = v_actor_uid
    AND tm.active = true
  LIMIT 1;

  IF v_order.status = 'received' THEN
    PERFORM public.transition_online_order_status(v_order.id, 'accepted', '');
  END IF;

  INSERT INTO public.delivery_dispatches (
    tenant_id,
    order_id,
    courier_id,
    dispatch_status,
    courier_name_snapshot,
    courier_phone_snapshot,
    courier_type_snapshot,
    assigned_by_user_id,
    assigned_by_email,
    assigned_at,
    notes
  ) VALUES (
    v_order.tenant_id,
    v_order.id,
    v_courier.id,
    'awaiting_acceptance',
    v_courier.name,
    v_courier.phone,
    v_courier.courier_type,
    v_actor_uid,
    v_actor_email,
    v_now,
    v_notes
  )
  RETURNING id INTO v_dispatch_id;

  INSERT INTO public.delivery_dispatch_history (
    tenant_id, dispatch_id, order_id, courier_id, courier_name,
    from_status, to_status, actor_user_id, actor_email, actor_type, reason, created_at
  ) VALUES
  (
    v_order.tenant_id, v_dispatch_id, v_order.id, v_courier.id, v_courier.name,
    'awaiting_dispatch', 'courier_assigned', v_actor_uid, v_actor_email, 'admin',
    CASE WHEN v_notes <> '' THEN v_notes ELSE 'Entregador atribuído pela central de despacho.' END,
    v_now
  ),
  (
    v_order.tenant_id, v_dispatch_id, v_order.id, v_courier.id, v_courier.name,
    'courier_assigned', 'awaiting_acceptance', v_actor_uid, v_actor_email, 'system',
    'Entrega enviada para aceite do entregador.',
    v_now + interval '1 millisecond'
  );

  RETURN v_dispatch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_delivery_courier(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_delivery_courier(uuid, uuid, text) TO authenticated, service_role;

-- 6) RPC: Reatribuir entregador (cancela atribuição atual e cria nova)
CREATE OR REPLACE FUNCTION public.reassign_delivery_courier(
  p_dispatch_id uuid,
  p_new_courier_id uuid,
  p_reason text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dispatch public.delivery_dispatches%ROWTYPE;
  v_order public.online_orders%ROWTYPE;
  v_courier public.delivery_couriers%ROWTYPE;
  v_actor_uid uuid := auth.uid();
  v_actor_email text := '';
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_now timestamptz := now();
  v_new_dispatch_id uuid;
BEGIN
  IF v_actor_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada ou usuário não autenticado.';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.delivery_dispatches
  WHERE id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despacho não encontrado.';
  END IF;

  IF NOT public.has_active_tenant_access(v_dispatch.tenant_id)
     OR NOT public.has_tenant_role(v_dispatch.tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Acesso negado para reatribuir entregador.';
  END IF;

  IF v_dispatch.dispatch_status IN ('delivered', 'delivery_rejected', 'delivery_cancelled') THEN
    RAISE EXCEPTION 'Este despacho já foi encerrado e não pode ser reatribuído diretamente.';
  END IF;

  IF v_dispatch.dispatch_status = 'out_for_delivery' THEN
    RAISE EXCEPTION 'Entrega já saiu em rota. Cancele o despacho antes de realizar nova atribuição.';
  END IF;

  IF v_dispatch.courier_id = p_new_courier_id THEN
    RAISE EXCEPTION 'Selecione um entregador diferente do atual para reatribuir.';
  END IF;

  SELECT * INTO v_order
  FROM public.online_orders
  WHERE id = v_dispatch.order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.status IN ('completed', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Pedido finalizado não permite reatribuição.';
  END IF;

  SELECT * INTO v_courier
  FROM public.delivery_couriers
  WHERE id = p_new_courier_id
    AND tenant_id = v_dispatch.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Novo entregador não encontrado neste estabelecimento.';
  END IF;

  IF v_courier.status <> 'active' OR v_courier.availability_status <> 'available' THEN
    RAISE EXCEPTION 'Selecione um entregador ativo e disponível para reatribuir.';
  END IF;

  SELECT coalesce(tm.email, '') INTO v_actor_email
  FROM public.tenant_members tm
  WHERE tm.tenant_id = v_dispatch.tenant_id
    AND tm.user_id = v_actor_uid
    AND tm.active = true
  LIMIT 1;

  IF length(v_reason) < 3 THEN
    v_reason := 'Reatribuição realizada pela central de despacho.';
  END IF;

  UPDATE public.delivery_dispatches SET
    dispatch_status = 'delivery_cancelled',
    cancelled_at = v_now,
    cancellation_reason = v_reason,
    updated_at = v_now
  WHERE id = v_dispatch.id;

  INSERT INTO public.delivery_dispatch_history (
    tenant_id, dispatch_id, order_id, courier_id, courier_name,
    from_status, to_status, actor_user_id, actor_email, actor_type, reason, created_at
  ) VALUES (
    v_dispatch.tenant_id, v_dispatch.id, v_dispatch.order_id, v_dispatch.courier_id, v_dispatch.courier_name_snapshot,
    v_dispatch.dispatch_status, 'delivery_cancelled', v_actor_uid, v_actor_email, 'admin', v_reason, v_now
  );

  INSERT INTO public.delivery_dispatches (
    tenant_id,
    order_id,
    courier_id,
    dispatch_status,
    courier_name_snapshot,
    courier_phone_snapshot,
    courier_type_snapshot,
    assigned_by_user_id,
    assigned_by_email,
    assigned_at,
    notes
  ) VALUES (
    v_dispatch.tenant_id,
    v_dispatch.order_id,
    v_courier.id,
    'awaiting_acceptance',
    v_courier.name,
    v_courier.phone,
    v_courier.courier_type,
    v_actor_uid,
    v_actor_email,
    v_now + interval '1 millisecond',
    v_dispatch.notes
  )
  RETURNING id INTO v_new_dispatch_id;

  INSERT INTO public.delivery_dispatch_history (
    tenant_id, dispatch_id, order_id, courier_id, courier_name,
    from_status, to_status, actor_user_id, actor_email, actor_type, reason, created_at
  ) VALUES
  (
    v_dispatch.tenant_id, v_new_dispatch_id, v_dispatch.order_id, v_courier.id, v_courier.name,
    'awaiting_dispatch', 'courier_assigned', v_actor_uid, v_actor_email, 'admin',
    'Reatribuído: ' || v_reason,
    v_now + interval '2 milliseconds'
  ),
  (
    v_dispatch.tenant_id, v_new_dispatch_id, v_dispatch.order_id, v_courier.id, v_courier.name,
    'courier_assigned', 'awaiting_acceptance', v_actor_uid, v_actor_email, 'system',
    'Entrega enviada para aceite do novo entregador.',
    v_now + interval '3 milliseconds'
  );

  RETURN v_new_dispatch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_delivery_courier(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_delivery_courier(uuid, uuid, text) TO authenticated, service_role;

-- 7) RPC: Cancelar atribuição de entrega e devolver pedido à fila de despacho
CREATE OR REPLACE FUNCTION public.cancel_delivery_dispatch(
  p_dispatch_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dispatch public.delivery_dispatches%ROWTYPE;
  v_actor_uid uuid := auth.uid();
  v_actor_email text := '';
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_now timestamptz := now();
BEGIN
  IF v_actor_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada ou usuário não autenticado.';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.delivery_dispatches
  WHERE id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atribuição de entrega não encontrada.';
  END IF;

  IF NOT public.has_active_tenant_access(v_dispatch.tenant_id)
     OR NOT public.has_tenant_role(v_dispatch.tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Acesso negado para cancelar atribuição.';
  END IF;

  IF v_dispatch.dispatch_status IN ('delivered', 'delivery_rejected', 'delivery_cancelled') THEN
    RAISE EXCEPTION 'Esta entrega já foi finalizada ou encerrada.';
  END IF;

  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento (mínimo 3 caracteres).';
  END IF;

  SELECT coalesce(tm.email, '') INTO v_actor_email
  FROM public.tenant_members tm
  WHERE tm.tenant_id = v_dispatch.tenant_id
    AND tm.user_id = v_actor_uid
    AND tm.active = true
  LIMIT 1;

  UPDATE public.delivery_dispatches SET
    dispatch_status = 'delivery_cancelled',
    cancelled_at = v_now,
    cancellation_reason = v_reason,
    updated_at = v_now
  WHERE id = v_dispatch.id;

  INSERT INTO public.delivery_dispatch_history (
    tenant_id, dispatch_id, order_id, courier_id, courier_name,
    from_status, to_status, actor_user_id, actor_email, actor_type, reason, created_at
  ) VALUES (
    v_dispatch.tenant_id, v_dispatch.id, v_dispatch.order_id, v_dispatch.courier_id, v_dispatch.courier_name_snapshot,
    v_dispatch.dispatch_status, 'delivery_cancelled', v_actor_uid, v_actor_email, 'admin', v_reason, v_now
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_delivery_dispatch(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_delivery_dispatch(uuid, text) TO authenticated, service_role;

-- 8) RPC: Registrar aceite ou recusa da entrega pelo entregador
CREATE OR REPLACE FUNCTION public.respond_delivery_dispatch(
  p_dispatch_id uuid,
  p_decision text,
  p_reason text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dispatch public.delivery_dispatches%ROWTYPE;
  v_order public.online_orders%ROWTYPE;
  v_actor_uid uuid := auth.uid();
  v_actor_email text := '';
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_now timestamptz := now();
BEGIN
  IF v_actor_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada ou usuário não autenticado.';
  END IF;

  IF v_decision NOT IN ('accept', 'reject') THEN
    RAISE EXCEPTION 'Decisão inválida. Utilize accept ou reject.';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.delivery_dispatches
  WHERE id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despacho não encontrado.';
  END IF;

  IF NOT public.has_active_tenant_access(v_dispatch.tenant_id)
     OR NOT public.has_tenant_role(v_dispatch.tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Acesso negado para registrar resposta do entregador.';
  END IF;

  IF v_dispatch.dispatch_status <> 'awaiting_acceptance' THEN
    RAISE EXCEPTION 'Este despacho não está mais aguardando aceite.';
  END IF;

  SELECT * INTO v_order
  FROM public.online_orders
  WHERE id = v_dispatch.order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.status IN ('completed', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'O pedido vinculado já foi finalizado ou cancelado.';
  END IF;

  SELECT coalesce(tm.email, '') INTO v_actor_email
  FROM public.tenant_members tm
  WHERE tm.tenant_id = v_dispatch.tenant_id
    AND tm.user_id = v_actor_uid
    AND tm.active = true
  LIMIT 1;

  IF v_decision = 'accept' THEN
    UPDATE public.delivery_dispatches SET
      dispatch_status = 'delivery_accepted',
      accepted_at = coalesce(accepted_at, v_now),
      updated_at = v_now
    WHERE id = v_dispatch.id;

    INSERT INTO public.delivery_dispatch_history (
      tenant_id, dispatch_id, order_id, courier_id, courier_name,
      from_status, to_status, actor_user_id, actor_email, actor_type, reason, created_at
    ) VALUES (
      v_dispatch.tenant_id, v_dispatch.id, v_dispatch.order_id, v_dispatch.courier_id, v_dispatch.courier_name_snapshot,
      v_dispatch.dispatch_status, 'delivery_accepted', v_actor_uid, v_actor_email, 'courier',
      'Entrega aceita pelo entregador.', v_now
    );
  ELSE
    IF length(v_reason) < 3 THEN
      RAISE EXCEPTION 'Informe o motivo da recusa (mínimo 3 caracteres).';
    END IF;

    UPDATE public.delivery_dispatches SET
      dispatch_status = 'delivery_rejected',
      rejected_at = v_now,
      rejection_reason = v_reason,
      updated_at = v_now
    WHERE id = v_dispatch.id;

    INSERT INTO public.delivery_dispatch_history (
      tenant_id, dispatch_id, order_id, courier_id, courier_name,
      from_status, to_status, actor_user_id, actor_email, actor_type, reason, created_at
    ) VALUES (
      v_dispatch.tenant_id, v_dispatch.id, v_dispatch.order_id, v_dispatch.courier_id, v_dispatch.courier_name_snapshot,
      v_dispatch.dispatch_status, 'delivery_rejected', v_actor_uid, v_actor_email, 'courier',
      v_reason, v_now
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_delivery_dispatch(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_delivery_dispatch(uuid, text, text) TO authenticated, service_role;

-- 9) RPC: Avançar status operacional da entrega sincronizando com online_orders e vendas
CREATE OR REPLACE FUNCTION public.advance_delivery_dispatch_status(
  p_dispatch_id uuid,
  p_next_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dispatch public.delivery_dispatches%ROWTYPE;
  v_order public.online_orders%ROWTYPE;
  v_actor_uid uuid := auth.uid();
  v_actor_email text := '';
  v_now timestamptz := now();
  v_valid boolean := false;
BEGIN
  IF v_actor_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada ou usuário não autenticado.';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.delivery_dispatches
  WHERE id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despacho não encontrado.';
  END IF;

  IF NOT public.has_active_tenant_access(v_dispatch.tenant_id)
     OR NOT public.has_tenant_role(v_dispatch.tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Acesso negado para atualizar o andamento desta entrega.';
  END IF;

  IF p_next_status NOT IN ('preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered') THEN
    RAISE EXCEPTION 'Estado de destino inválido para avanço operacional da entrega.';
  END IF;

  SELECT * INTO v_order
  FROM public.online_orders
  WHERE id = v_dispatch.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido vinculado não encontrado.';
  END IF;

  IF v_order.status IN ('completed', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Pedido já finalizado não permite alteração.';
  END IF;

  v_valid := CASE
    WHEN v_dispatch.dispatch_status = 'delivery_accepted' AND p_next_status IN ('preparing', 'ready_for_dispatch', 'out_for_delivery') THEN true
    WHEN v_dispatch.dispatch_status = 'preparing' AND p_next_status IN ('ready_for_dispatch', 'out_for_delivery') THEN true
    WHEN v_dispatch.dispatch_status = 'ready_for_dispatch' AND p_next_status = 'out_for_delivery' THEN true
    WHEN v_dispatch.dispatch_status = 'out_for_delivery' AND p_next_status = 'delivered' THEN true
    ELSE false
  END;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Transição operacional inválida de % para %.', v_dispatch.dispatch_status, p_next_status;
  END IF;

  SELECT coalesce(tm.email, '') INTO v_actor_email
  FROM public.tenant_members tm
  WHERE tm.tenant_id = v_dispatch.tenant_id
    AND tm.user_id = v_actor_uid
    AND tm.active = true
  LIMIT 1;

  UPDATE public.delivery_dispatches SET
    dispatch_status = p_next_status,
    dispatched_at = CASE WHEN p_next_status = 'out_for_delivery' THEN coalesce(dispatched_at, v_now) ELSE dispatched_at END,
    delivered_at = CASE WHEN p_next_status = 'delivered' THEN coalesce(delivered_at, v_now) ELSE delivered_at END,
    updated_at = v_now
  WHERE id = v_dispatch.id;

  INSERT INTO public.delivery_dispatch_history (
    tenant_id, dispatch_id, order_id, courier_id, courier_name,
    from_status, to_status, actor_user_id, actor_email, actor_type, reason, created_at
  ) VALUES (
    v_dispatch.tenant_id, v_dispatch.id, v_dispatch.order_id, v_dispatch.courier_id, v_dispatch.courier_name_snapshot,
    v_dispatch.dispatch_status, p_next_status, v_actor_uid, v_actor_email, 'admin', p_next_status, v_now
  );

  -- Sincroniza o pedido online passo a passo preservando todas as regras de vendas e histórico
  IF v_order.status = 'received' THEN
    PERFORM public.transition_online_order_status(v_order.id, 'accepted', '');
    v_order.status := 'accepted';
  END IF;

  IF p_next_status IN ('preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered')
     AND v_order.status = 'accepted' THEN
    PERFORM public.transition_online_order_status(v_order.id, 'preparing', '');
    v_order.status := 'preparing';
  END IF;

  IF p_next_status IN ('ready_for_dispatch', 'out_for_delivery', 'delivered')
     AND v_order.status = 'preparing' THEN
    PERFORM public.transition_online_order_status(v_order.id, 'ready', '');
    v_order.status := 'ready';
  END IF;

  IF p_next_status IN ('out_for_delivery', 'delivered')
     AND v_order.status = 'ready' THEN
    PERFORM public.transition_online_order_status(v_order.id, 'out_for_delivery', '');
    v_order.status := 'out_for_delivery';
  END IF;

  IF p_next_status = 'delivered'
     AND v_order.status = 'out_for_delivery' THEN
    PERFORM public.transition_online_order_status(v_order.id, 'completed', '');
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_delivery_dispatch_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_delivery_dispatch_status(uuid, text) TO authenticated, service_role;

-- 10) Trigger reverso: mantém despacho sincronizado se o pedido for atualizado pela Central de Pedidos
CREATE OR REPLACE FUNCTION public.sync_delivery_dispatch_from_online_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dispatch public.delivery_dispatches%ROWTYPE;
  v_target_dispatch_status text := null;
  v_now timestamptz := now();
  v_actor_uid uuid := auth.uid();
  v_actor_email text := '';
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.fulfillment_type <> 'delivery' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_dispatch
  FROM public.delivery_dispatches
  WHERE order_id = NEW.id
    AND dispatch_status NOT IN ('delivered', 'delivery_rejected', 'delivery_cancelled')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_actor_uid IS NOT NULL THEN
    SELECT coalesce(tm.email, '') INTO v_actor_email
    FROM public.tenant_members tm
    WHERE tm.tenant_id = NEW.tenant_id
      AND tm.user_id = v_actor_uid
      AND tm.active = true
    LIMIT 1;
  END IF;

  IF NEW.status IN ('rejected', 'cancelled') THEN
    UPDATE public.delivery_dispatches SET
      dispatch_status = 'delivery_cancelled',
      cancelled_at = v_now,
      cancellation_reason = CASE
        WHEN length(btrim(coalesce(NEW.rejection_reason, ''))) >= 3 THEN btrim(NEW.rejection_reason)
        ELSE 'Pedido cancelado ou recusado na Central de Pedidos.'
      END,
      updated_at = v_now
    WHERE id = v_dispatch.id;

    INSERT INTO public.delivery_dispatch_history (
      tenant_id, dispatch_id, order_id, courier_id, courier_name,
      from_status, to_status, actor_user_id, actor_email, actor_type, reason, created_at
    ) VALUES (
      v_dispatch.tenant_id, v_dispatch.id, v_dispatch.order_id, v_dispatch.courier_id, v_dispatch.courier_name_snapshot,
      v_dispatch.dispatch_status, 'delivery_cancelled', v_actor_uid, v_actor_email, 'system',
      CASE
        WHEN length(btrim(coalesce(NEW.rejection_reason, ''))) >= 3 THEN btrim(NEW.rejection_reason)
        ELSE 'Pedido cancelado na Central de Pedidos.'
      END,
      v_now
    );
    RETURN NEW;
  END IF;

  v_target_dispatch_status := CASE
    WHEN NEW.status = 'preparing' AND v_dispatch.dispatch_status = 'delivery_accepted' THEN 'preparing'
    WHEN NEW.status = 'ready' AND v_dispatch.dispatch_status IN ('delivery_accepted', 'preparing') THEN 'ready_for_dispatch'
    WHEN NEW.status = 'out_for_delivery' AND v_dispatch.dispatch_status IN ('delivery_accepted', 'preparing', 'ready_for_dispatch') THEN 'out_for_delivery'
    WHEN NEW.status = 'completed' AND v_dispatch.dispatch_status <> 'delivered' THEN 'delivered'
    ELSE null
  END;

  IF v_target_dispatch_status IS NOT NULL THEN
    UPDATE public.delivery_dispatches SET
      dispatch_status = v_target_dispatch_status,
      dispatched_at = CASE WHEN v_target_dispatch_status = 'out_for_delivery' THEN coalesce(dispatched_at, v_now) ELSE dispatched_at END,
      delivered_at = CASE WHEN v_target_dispatch_status = 'delivered' THEN coalesce(delivered_at, v_now) ELSE delivered_at END,
      updated_at = v_now
    WHERE id = v_dispatch.id;

    INSERT INTO public.delivery_dispatch_history (
      tenant_id, dispatch_id, order_id, courier_id, courier_name,
      from_status, to_status, actor_user_id, actor_email, actor_type, reason, created_at
    ) VALUES (
      v_dispatch.tenant_id, v_dispatch.id, v_dispatch.order_id, v_dispatch.courier_id, v_dispatch.courier_name_snapshot,
      v_dispatch.dispatch_status, v_target_dispatch_status, v_actor_uid, v_actor_email, 'system',
      'Sincronizado automaticamente com o status do pedido.',
      v_now
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_delivery_dispatch_from_online_order ON public.online_orders;
CREATE TRIGGER trg_sync_delivery_dispatch_from_online_order
  AFTER UPDATE OF status ON public.online_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_delivery_dispatch_from_online_order();

-- 11) Publicação Realtime para atualizações em tempo real na Central de Despacho
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_dispatches'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_dispatches;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_dispatch_history'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_dispatch_history;
    END IF;
  END IF;
END $$;
