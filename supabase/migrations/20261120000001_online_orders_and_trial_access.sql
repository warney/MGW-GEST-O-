-- MGW Gestao: pedidos online, rastreamento seguro e permissao de trial.
-- Esta migration depende das migrations inicial, Storage e signup/cardapio.
BEGIN;

-- Assinatura em trial deve permitir escrita ate a data de expiracao.
CREATE OR REPLACE FUNCTION public.has_active_tenant_access(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.active = true
      AND t.status = 'active'
      AND (
        t.billing_exempt = true
        OR s.status IN ('authorized', 'exempt', 'free')
        OR (s.status = 'trialing' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at > now())
        OR (s.status = 'paused' AND s.grace_until IS NOT NULL AND s.grace_until > now())
      )
  );
$$;
REVOKE ALL ON FUNCTION public.has_active_tenant_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_tenant_access(uuid) TO authenticated, service_role;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS online_order_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sales_origin;
ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_origin CHECK (sale_origin IN ('manual', 'online'));
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sales_delivery_fee;
ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_delivery_fee CHECK (delivery_fee >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_online_order
  ON public.sales (tenant_id, online_order_id)
  WHERE online_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.online_order_counters (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);
ALTER TABLE public.online_order_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.online_order_counters FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.online_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number bigint NOT NULL,
  order_code text NOT NULL,
  tracking_token_hash text NOT NULL UNIQUE,
  menu_slug text NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','accepted','preparing','ready','out_for_delivery','ready_for_pickup','completed','rejected','cancelled')),
  fulfillment_type text NOT NULL CHECK (fulfillment_type IN ('delivery','pickup')),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  delivery_address text NOT NULL DEFAULT '',
  delivery_reference text NOT NULL DEFAULT '',
  payment_method text NOT NULL CHECK (payment_method IN ('Pix','Dinheiro','Cartão')),
  change_for numeric(12,2),
  customer_note text NOT NULL DEFAULT '',
  subtotal_amount numeric(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  delivery_fee numeric(12,2) NOT NULL CHECK (delivery_fee >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  rejection_reason text NOT NULL DEFAULT '',
  viewed_at timestamptz,
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_online_orders_tenant_created
  ON public.online_orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_orders_tenant_status
  ON public.online_orders (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.online_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_kind text NOT NULL CHECK (item_kind IN ('product','combo')),
  ref_id uuid NOT NULL,
  item_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  estimated_unit_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (estimated_unit_cost >= 0),
  x_saladas_per_unit integer NOT NULL DEFAULT 0 CHECK (x_saladas_per_unit >= 0),
  components jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(components) = 'array'),
  item_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_online_order_items_order
  ON public.online_order_items (tenant_id, order_id);

CREATE TABLE IF NOT EXISTS public.online_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('customer','admin','system')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_online_order_history_order
  ON public.online_order_status_history (tenant_id, order_id, created_at);

-- Apenas hashes de rastreamento, sem dados pessoais. O hash nao permite consultar o pedido:
-- o RPC exige o token original e calcula SHA-256 novamente.
CREATE TABLE IF NOT EXISTS public.online_order_realtime_pings (
  token_hash text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.online_order_realtime_pings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS online_order_pings_public_read ON public.online_order_realtime_pings;
CREATE POLICY online_order_pings_public_read
  ON public.online_order_realtime_pings FOR SELECT TO anon, authenticated
  USING (true);
GRANT SELECT ON public.online_order_realtime_pings TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.online_order_realtime_pings FROM anon, authenticated;

ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS online_orders_member_select ON public.online_orders;
CREATE POLICY online_orders_member_select ON public.online_orders
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS online_order_items_member_select ON public.online_order_items;
CREATE POLICY online_order_items_member_select ON public.online_order_items
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS online_order_history_member_select ON public.online_order_status_history;
CREATE POLICY online_order_history_member_select ON public.online_order_status_history
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

GRANT SELECT ON public.online_orders, public.online_order_items, public.online_order_status_history TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.online_orders, public.online_order_items, public.online_order_status_history FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_public_online_order(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment_type text,
  p_delivery_address text,
  p_delivery_reference text,
  p_payment_method text,
  p_change_for numeric,
  p_customer_note text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_menu public.digital_menu_settings%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_order_id uuid := gen_random_uuid();
  v_order_number bigint;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_token_hash text;
  v_order_code text;
  v_item jsonb;
  v_kind text;
  v_ref uuid;
  v_qty integer;
  v_note text;
  v_name text;
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2) := 0;
  v_xsaladas integer;
  v_components jsonb;
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_total numeric(12,2);
  v_item_count integer := 0;
  v_has_combo boolean := false;
  v_has_product boolean := false;
  v_order_item_id uuid;
  v_change_for numeric(12,2);
BEGIN
  IF p_slug IS NULL OR length(btrim(p_slug)) < 2 OR length(p_slug) > 63 THEN
    RAISE EXCEPTION 'Cardapio digital invalido.';
  END IF;
  SELECT * INTO v_menu FROM public.digital_menu_settings WHERE slug = lower(btrim(p_slug)) AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cardapio digital nao encontrado ou indisponivel.'; END IF;
  SELECT * INTO v_tenant FROM public.tenants WHERE id = v_menu.tenant_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Estabelecimento indisponivel.'; END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE tenant_id = v_menu.tenant_id;
  IF NOT (v_tenant.billing_exempt OR v_sub.status IN ('authorized','exempt','free') OR
          (v_sub.status = 'trialing' AND v_sub.trial_ends_at > now()) OR
          (v_sub.status = 'paused' AND v_sub.grace_until > now())) THEN
    RAISE EXCEPTION 'Estabelecimento temporariamente indisponivel.';
  END IF;
  IF NOT v_menu.is_open THEN RAISE EXCEPTION 'A loja esta fechada para novos pedidos.'; END IF;
  IF p_fulfillment_type NOT IN ('delivery','pickup') THEN RAISE EXCEPTION 'Escolha entrega ou retirada.'; END IF;
  IF p_fulfillment_type = 'delivery' AND NOT v_menu.accepts_delivery THEN RAISE EXCEPTION 'Esta loja nao aceita pedidos para entrega.'; END IF;
  IF p_fulfillment_type = 'pickup' AND NOT v_menu.accepts_pickup THEN RAISE EXCEPTION 'Esta loja nao aceita retirada.'; END IF;
  IF p_payment_method NOT IN ('Pix','Dinheiro','Cartao') THEN RAISE EXCEPTION 'Forma de pagamento invalida.'; END IF;
  IF length(btrim(coalesce(p_customer_name,''))) < 2 OR length(p_customer_name) > 120 THEN RAISE EXCEPTION 'Informe seu nome.'; END IF;
  IF length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g')) < 10 THEN RAISE EXCEPTION 'Informe um telefone valido.'; END IF;
  IF p_fulfillment_type = 'delivery' AND length(btrim(coalesce(p_delivery_address,''))) < 5 THEN RAISE EXCEPTION 'Informe o endereco de entrega.'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 40 THEN
    RAISE EXCEPTION 'O carrinho esta vazio ou possui itens demais.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_kind := coalesce(v_item->>'kind','');
    v_qty := greatest(0, least(30, coalesce((v_item->>'quantity')::integer,0)));
    v_note := left(btrim(coalesce(v_item->>'note','')),160);
    IF v_qty < 1 THEN RAISE EXCEPTION 'Quantidade de item invalida.'; END IF;
    BEGIN v_ref := (v_item->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Item do carrinho invalido.'; END;

    IF v_kind = 'product' THEN
      SELECT name, unit_price, counts_as_x_salada
      INTO v_name, v_unit_price, v_xsaladas
      FROM public.products
      WHERE id = v_ref AND tenant_id = v_menu.tenant_id AND active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Um produto do carrinho nao esta mais disponivel.'; END IF;
      v_xsaladas := CASE WHEN v_xsaladas::boolean THEN 1 ELSE 0 END;
      v_components := jsonb_build_array(jsonb_build_object(
        'productId',v_ref::text,'productName',v_name,'quantityPerUnit',1,
        'totalQuantity',v_qty,'countsAsXSalada',(v_xsaladas > 0)
      ));
      v_has_product := true;
    ELSIF v_kind = 'combo' THEN
      SELECT name, sale_price, estimated_cost, items
      INTO v_name, v_unit_price, v_unit_cost, v_components
      FROM public.combos
      WHERE id = v_ref AND tenant_id = v_menu.tenant_id AND active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Um combo do carrinho nao esta mais disponivel.'; END IF;
      SELECT coalesce(sum(CASE WHEN coalesce((comp->>'countsAsXSalada')::boolean,false)
                               THEN greatest(0,(comp->>'quantity')::integer) ELSE 0 END),0)::integer
      INTO v_xsaladas
      FROM jsonb_array_elements(v_components) comp;
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'productId',comp->>'productId',
        'productName',comp->>'productName',
        'quantityPerUnit',greatest(1,(comp->>'quantity')::integer),
        'totalQuantity',greatest(1,(comp->>'quantity')::integer)*v_qty,
        'countsAsXSalada',coalesce((comp->>'countsAsXSalada')::boolean,false)
      )), '[]'::jsonb)
      INTO v_components
      FROM jsonb_array_elements(v_components) comp;
      v_has_combo := true;
    ELSE
      RAISE EXCEPTION 'Tipo de item invalido.';
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
    v_item_count := v_item_count + v_qty;
    v_order_item_id := gen_random_uuid();
    INSERT INTO public.online_order_items (
      id, order_id, tenant_id, item_kind, ref_id, item_name, quantity,
      unit_price, line_total, estimated_unit_cost, x_saladas_per_unit, components, item_note
    ) VALUES (
      v_order_item_id, v_order_id, v_menu.tenant_id, v_kind, v_ref, v_name, v_qty,
      v_unit_price, v_unit_price*v_qty, v_unit_cost, v_xsaladas, v_components, v_note
    );
  END LOOP;

  v_delivery_fee := CASE WHEN p_fulfillment_type = 'delivery' THEN v_menu.delivery_fee ELSE 0 END;
  IF v_subtotal < v_menu.minimum_order_amount THEN
    RAISE EXCEPTION 'Pedido minimo de R$ % nao atingido.', to_char(v_menu.minimum_order_amount,'FM999999990D00');
  END IF;
  v_total := v_subtotal + v_delivery_fee;
  v_change_for := CASE WHEN p_payment_method = 'Dinheiro' AND coalesce(p_change_for,0) > 0 THEN p_change_for ELSE NULL END;
  IF v_change_for IS NOT NULL AND v_change_for < v_total THEN RAISE EXCEPTION 'O troco precisa ser maior ou igual ao total do pedido.'; END IF;

  INSERT INTO public.online_order_counters(tenant_id,last_number)
  VALUES (v_menu.tenant_id,1)
  ON CONFLICT (tenant_id) DO UPDATE SET last_number = public.online_order_counters.last_number + 1
  RETURNING last_number INTO v_order_number;

  v_order_code := lpad((v_order_number % 100000)::text,5,'0');
  v_token_hash := encode(digest(v_token,'sha256'),'hex');

  INSERT INTO public.online_orders (
    id,tenant_id,order_number,order_code,tracking_token_hash,menu_slug,status,
    fulfillment_type,customer_name,customer_phone,delivery_address,delivery_reference,
    payment_method,change_for,customer_note,subtotal_amount,delivery_fee,total_amount
  ) VALUES (
    v_order_id,v_menu.tenant_id,v_order_number,v_order_code,v_token_hash,v_menu.slug,'received',
    p_fulfillment_type,left(btrim(p_customer_name),120),
    left(regexp_replace(p_customer_phone,'[^0-9+]','','g'),32),
    CASE WHEN p_fulfillment_type='delivery' THEN left(btrim(p_delivery_address),280) ELSE '' END,
    CASE WHEN p_fulfillment_type='delivery' THEN left(btrim(coalesce(p_delivery_reference,'')),160) ELSE '' END,
    p_payment_method,v_change_for,left(btrim(coalesce(p_customer_note,'')),300),
    v_subtotal,v_delivery_fee,v_total
  );

  INSERT INTO public.online_order_status_history(order_id,tenant_id,from_status,to_status,reason,actor_type)
  VALUES (v_order_id,v_menu.tenant_id,NULL,'received','Pedido enviado pelo cardapio digital.','customer');
  INSERT INTO public.online_order_realtime_pings(token_hash) VALUES (v_token_hash)
  ON CONFLICT (token_hash) DO UPDATE SET updated_at = now();

  RETURN jsonb_build_object(
    'orderId',v_order_id,'orderNumber',v_order_number,'orderCode',v_order_code,
    'trackingToken',v_token,'tokenHash',v_token_hash,'status','received',
    'subtotalAmount',v_subtotal,'deliveryFee',v_delivery_fee,'totalAmount',v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_order_by_token(p_tracking_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT jsonb_build_object(
    'found',true,
    'order',jsonb_build_object(
      'orderId',o.id,'tokenHash',o.tracking_token_hash,'orderNumber',o.order_number,
      'orderCode',o.order_code,'status',o.status,'fulfillmentType',o.fulfillment_type,
      'customerName',o.customer_name,'deliveryAddress',o.delivery_address,
      'deliveryReference',o.delivery_reference,'paymentMethod',o.payment_method,
      'changeFor',o.change_for,'customerNote',o.customer_note,
      'subtotalAmount',o.subtotal_amount,'deliveryFee',o.delivery_fee,
      'totalAmount',o.total_amount,'rejectionReason',o.rejection_reason,
      'storeName',d.store_name,'storeSlug',d.slug,'storeWhatsapp',d.phone_whatsapp,
      'storeAddress',d.address,'storePixKey',d.pix_key,
      'createdAt',o.created_at,'updatedAt',o.updated_at,
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',i.id,'itemKind',i.item_kind,'refId',i.ref_id,'itemName',i.item_name,
        'quantity',i.quantity,'unitPrice',i.unit_price,'lineTotal',i.line_total,'itemNote',i.item_note
      ) ORDER BY i.created_at) FROM public.online_order_items i WHERE i.order_id=o.id),'[]'::jsonb),
      'statusHistory',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',h.id,'fromStatus',h.from_status,'toStatus',h.to_status,'reason',h.reason,'createdAt',h.created_at
      ) ORDER BY h.created_at) FROM public.online_order_status_history h WHERE h.order_id=o.id),'[]'::jsonb)
    )
  )
  FROM public.online_orders o
  JOIN public.digital_menu_settings d ON d.tenant_id=o.tenant_id
  WHERE o.tracking_token_hash = encode(digest(coalesce(p_tracking_token,''),'sha256'),'hex')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mark_online_order_viewed(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.online_orders WHERE id=p_order_id;
  IF v_tenant IS NULL OR NOT public.has_active_tenant_access(v_tenant) THEN
    RAISE EXCEPTION 'Pedido nao encontrado ou acesso negado.';
  END IF;
  UPDATE public.online_orders SET viewed_at=coalesce(viewed_at,now()),updated_at=now()
  WHERE id=p_order_id AND tenant_id=v_tenant;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_online_order_status(
  p_order_id uuid,
  p_next_status text,
  p_reason text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.online_orders%ROWTYPE;
  v_reason text := left(btrim(coalesce(p_reason,'')),300);
  v_now timestamptz := now();
  v_sale_id uuid;
  v_xsalada_count integer;
  v_total_units integer;
  v_quantity integer;
  v_has_combo boolean;
  v_has_product boolean;
  v_sale_items jsonb;
  v_sale_mode text;
  v_payment text;
  v_note text;
BEGIN
  SELECT * INTO v_order FROM public.online_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_active_tenant_access(v_order.tenant_id) THEN
    RAISE EXCEPTION 'Pedido nao encontrado ou acesso negado.';
  END IF;
  IF v_order.status IN ('completed','rejected','cancelled') THEN RAISE EXCEPTION 'Pedido ja finalizado nao permite alteracao.'; END IF;
  IF p_next_status IN ('rejected','cancelled') AND length(v_reason)<3 THEN RAISE EXCEPTION 'Informe o motivo (minimo 3 caracteres).'; END IF;
  IF NOT (
    (v_order.status='received' AND p_next_status IN ('accepted','rejected','cancelled')) OR
    (v_order.status='accepted' AND p_next_status IN ('preparing','cancelled')) OR
    (v_order.status='preparing' AND p_next_status IN ('ready','cancelled')) OR
    (v_order.status='ready' AND p_next_status IN (CASE WHEN v_order.fulfillment_type='delivery' THEN 'out_for_delivery' ELSE 'ready_for_pickup' END,'cancelled')) OR
    (v_order.status IN ('out_for_delivery','ready_for_pickup') AND p_next_status IN ('completed','cancelled'))
  ) THEN RAISE EXCEPTION 'Transicao de status invalida.'; END IF;

  UPDATE public.online_orders SET
    status=p_next_status,
    viewed_at=coalesce(viewed_at,v_now),
    accepted_at=CASE WHEN p_next_status='accepted' THEN coalesce(accepted_at,v_now) ELSE accepted_at END,
    preparing_at=CASE WHEN p_next_status='preparing' THEN coalesce(preparing_at,v_now) ELSE preparing_at END,
    ready_at=CASE WHEN p_next_status='ready' THEN coalesce(ready_at,v_now) ELSE ready_at END,
    dispatched_at=CASE WHEN p_next_status IN ('out_for_delivery','ready_for_pickup') THEN coalesce(dispatched_at,v_now) ELSE dispatched_at END,
    completed_at=CASE WHEN p_next_status='completed' THEN coalesce(completed_at,v_now) ELSE completed_at END,
    cancelled_at=CASE WHEN p_next_status IN ('rejected','cancelled') THEN coalesce(cancelled_at,v_now) ELSE cancelled_at END,
    rejection_reason=CASE WHEN p_next_status IN ('rejected','cancelled') THEN v_reason ELSE rejection_reason END,
    updated_at=v_now
  WHERE id=p_order_id;

  INSERT INTO public.online_order_status_history(order_id,tenant_id,from_status,to_status,reason,actor_type)
  VALUES (p_order_id,v_order.tenant_id,v_order.status,p_next_status,
    CASE WHEN p_next_status IN ('rejected','cancelled') THEN v_reason ELSE p_next_status END,'admin');

  IF p_next_status='completed' AND v_order.sale_id IS NULL THEN
    SELECT
      coalesce(sum(i.x_saladas_per_unit*i.quantity),0)::integer,
      coalesce(sum(i.quantity),0)::integer,
      bool_or(i.item_kind='combo'),
      bool_or(i.item_kind='product'),
      coalesce(jsonb_agg(jsonb_build_object(
        'kind',i.item_kind,'refId',i.ref_id,'name',i.item_name,
        'quantity',i.quantity,'unitPrice',i.unit_price,'lineTotal',i.line_total,
        'estimatedUnitCost',i.estimated_unit_cost,'xSaladasPerUnit',i.x_saladas_per_unit,
        'components',i.components
      ) ORDER BY i.created_at),'[]'::jsonb)
    INTO v_xsalada_count,v_total_units,v_has_combo,v_has_product,v_sale_items
    FROM public.online_order_items i WHERE i.order_id=p_order_id;

    v_quantity := greatest(1,CASE WHEN v_xsalada_count>0 THEN v_xsalada_count ELSE v_total_units END);
    v_sale_mode := CASE WHEN coalesce(v_has_combo,false) AND coalesce(v_has_product,false) THEN 'mixed'
                        WHEN coalesce(v_has_combo,false) THEN 'combo' ELSE 'individual' END;
    v_payment := CASE WHEN v_order.payment_method='Cartao' THEN 'Cartão de crédito' ELSE v_order.payment_method END;
    v_note := left(v_order.order_code || ' · ' || v_order.customer_name || CASE WHEN v_order.customer_note<>'' THEN ' · '||v_order.customer_note ELSE '' END,240);
    INSERT INTO public.sales(
      tenant_id,owner_email,date,quantity,unit_price,total_amount,payment_method,note,
      sale_mode,x_salada_count,combos_count,items,sale_origin,online_order_id,delivery_fee
    ) VALUES (
      v_order.tenant_id,
      (SELECT email FROM public.tenant_members WHERE tenant_id=v_order.tenant_id AND user_id=auth.uid() AND active=true LIMIT 1),
      (v_now AT TIME ZONE 'America/Manaus')::date,
      v_quantity,
      round(v_order.total_amount/nullif(v_quantity,0),2),
      v_order.total_amount,v_payment,v_note,v_sale_mode,v_xsalada_count,
      (SELECT coalesce(sum(quantity),0)::integer FROM public.online_order_items WHERE order_id=p_order_id AND item_kind='combo'),
      v_sale_items,'online',p_order_id,v_order.delivery_fee
    ) RETURNING id INTO v_sale_id;
    UPDATE public.online_orders SET sale_id=v_sale_id WHERE id=p_order_id;
  END IF;

  INSERT INTO public.online_order_realtime_pings(token_hash)
  VALUES (v_order.tracking_token_hash)
  ON CONFLICT (token_hash) DO UPDATE SET updated_at=now();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_order_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_by_token(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_online_order_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_online_order_viewed(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.transition_online_order_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_online_order_status(uuid,text,text) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='online_order_realtime_pings'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.online_order_realtime_pings;
  END IF;
END $$;

COMMIT;
