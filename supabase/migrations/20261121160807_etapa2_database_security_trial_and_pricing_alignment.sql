
BEGIN;

-- Comercial: plano único de R$ 49,90; desativar o plano gratuito.
UPDATE public.plans
SET amount_cents = 4990
WHERE code = 'mgw_mensal_49';

UPDATE public.plans
SET active = false
WHERE code = 'free';

ALTER TABLE public.subscriptions
  ALTER COLUMN plan_amount_cents SET DEFAULT 4990;

UPDATE public.subscriptions
SET plan_amount_cents = 4990, updated_at = now()
WHERE plan_code = 'mgw_mensal_49'
  AND status <> 'exempt';

-- Corrige o acesso: trial precisa ter prazo explícito e ainda válido; free não libera acesso.
CREATE OR REPLACE FUNCTION public.has_active_tenant_access(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
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
        OR s.status IN ('authorized', 'exempt')
        OR (
          s.status = 'trialing'
          AND s.trial_ends_at IS NOT NULL
          AND s.trial_ends_at > now()
        )
        OR (
          s.status = 'paused'
          AND s.grace_until IS NOT NULL
          AND s.grace_until > now()
        )
      )
  );
$function$;

-- Novos cadastros: 3 dias. Os períodos dos estabelecimentos já existentes não são alterados.
DO $migration$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.provision_new_mgw_owner()'::regprocedure);
  IF position('v_trial_days integer := 14;' in v_def) = 0 THEN
    RAISE EXCEPTION 'Não foi possível validar a versão atual de provision_new_mgw_owner.';
  END IF;
  v_def := replace(v_def, 'v_trial_days integer := 14;', 'v_trial_days integer := 3;');
  EXECUTE v_def;

  v_def := pg_get_functiondef('public.create_tenant_with_owner(text,text,text)'::regprocedure);
  IF position('IF v_plan_code NOT IN (''free'', ''trial'', ''mgw_mensal_49'') THEN' in v_def) = 0
     OR position('v_trial_end := now() + interval ''14 days'';' in v_def) = 0 THEN
    RAISE EXCEPTION 'Não foi possível validar a versão atual de create_tenant_with_owner.';
  END IF;
  v_def := replace(
    v_def,
    'IF v_plan_code NOT IN (''free'', ''trial'', ''mgw_mensal_49'') THEN',
    'IF v_plan_code NOT IN (''trial'', ''mgw_mensal_49'') THEN'
  );
  v_def := replace(v_def, 'v_trial_end := now() + interval ''14 days'';', 'v_trial_end := now() + interval ''3 days'';');
  EXECUTE v_def;

  -- Pedido público: exigir assinatura existente e válida; plano free não pode abrir o cardápio.
  v_def := pg_get_functiondef('public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb)'::regprocedure);
  IF position('v_sub.status IN (''authorized'',''exempt'',''free'')' in v_def) = 0 THEN
    RAISE EXCEPTION 'Não foi possível validar a regra de cobrança de create_public_online_order.';
  END IF;
  v_def := replace(
    v_def,
    $old$IF NOT (v_tenant.billing_exempt OR v_sub.status IN ('authorized','exempt','free') OR
          (v_sub.status = 'trialing' AND v_sub.trial_ends_at > now()) OR
          (v_sub.status = 'paused' AND v_sub.grace_until > now())) THEN$old$,
    $new$IF NOT (
    v_tenant.billing_exempt
    OR (
      v_sub.id IS NOT NULL
      AND (
        v_sub.status IN ('authorized','exempt')
        OR (v_sub.status = 'trialing' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at > now())
        OR (v_sub.status = 'paused' AND v_sub.grace_until IS NOT NULL AND v_sub.grace_until > now())
      )
    )
  ) THEN$new$
  );
  IF position('v_sub.status IN (''authorized'',''exempt'',''free'')' in v_def) > 0 THEN
    RAISE EXCEPTION 'A regra antiga de plano free permaneceu em create_public_online_order.';
  END IF;
  EXECUTE v_def;

  -- Operações internas de pedidos exigem vínculo ativo e papel autorizado.
  v_def := pg_get_functiondef('public.mark_online_order_viewed(uuid)'::regprocedure);
  IF position('NOT public.has_active_tenant_access(v_tenant)' in v_def) = 0 THEN
    RAISE EXCEPTION 'Não foi possível validar mark_online_order_viewed.';
  END IF;
  v_def := replace(
    v_def,
    'NOT public.has_active_tenant_access(v_tenant)',
    'NOT public.has_tenant_role(v_tenant, ARRAY[''owner'',''admin'',''manager'',''staff''])'
  );
  EXECUTE v_def;

  v_def := pg_get_functiondef('public.transition_online_order_status(uuid,text,text)'::regprocedure);
  IF position('NOT public.has_active_tenant_access(v_order.tenant_id)' in v_def) = 0 THEN
    RAISE EXCEPTION 'Não foi possível validar transition_online_order_status.';
  END IF;
  v_def := replace(
    v_def,
    'NOT public.has_active_tenant_access(v_order.tenant_id)',
    'NOT public.has_tenant_role(v_order.tenant_id, ARRAY[''owner'',''admin'',''manager'',''staff''])'
  );
  EXECUTE v_def;
END
$migration$;

-- RLS: leitura operacional somente para membros com assinatura/acesso vigente.
DROP POLICY IF EXISTS products_select_member ON public.products;
CREATE POLICY products_select_member ON public.products
  FOR SELECT TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS combos_select_member ON public.combos;
CREATE POLICY combos_select_member ON public.combos
  FOR SELECT TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS sales_select_member ON public.sales;
CREATE POLICY sales_select_member ON public.sales
  FOR SELECT TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS shop_settings_select_member ON public.shop_settings;
CREATE POLICY shop_settings_select_member ON public.shop_settings
  FOR SELECT TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS digital_menu_settings_member_select ON public.digital_menu_settings;
CREATE POLICY digital_menu_settings_member_select ON public.digital_menu_settings
  FOR SELECT TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS online_orders_member_select ON public.online_orders;
CREATE POLICY online_orders_member_select ON public.online_orders
  FOR SELECT TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS online_order_items_member_select ON public.online_order_items;
CREATE POLICY online_order_items_member_select ON public.online_order_items
  FOR SELECT TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS online_order_history_member_select ON public.online_order_status_history;
CREATE POLICY online_order_history_member_select ON public.online_order_status_history
  FOR SELECT TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Members manage own push subscriptions" ON public.tenant_push_subscriptions;
CREATE POLICY "Members manage own push subscriptions"
  ON public.tenant_push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()) AND public.has_active_tenant_access(tenant_id))
  WITH CHECK (user_id = (select auth.uid()) AND public.has_active_tenant_access(tenant_id));

-- Impede que registros operacionais sejam transferidos entre estabelecimentos.
DROP TRIGGER IF EXISTS trg_prevent_tenant_id_change ON public.digital_menu_settings;
CREATE TRIGGER trg_prevent_tenant_id_change
  BEFORE UPDATE OF tenant_id ON public.digital_menu_settings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_prevent_tenant_id_change ON public.online_orders;
CREATE TRIGGER trg_prevent_tenant_id_change
  BEFORE UPDATE OF tenant_id ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

COMMIT;
