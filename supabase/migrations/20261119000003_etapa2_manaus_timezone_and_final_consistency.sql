-- ============================================================================
-- MGW GESTAO — ETAPA 2 (FINAL): FUSO HORARIO AMERICA/MANAUS & CONSISTENCIA FINAL
-- Migration: 20261119000003_etapa2_manaus_timezone_and_final_consistency.sql
--
-- Regras:
--   * Migration 100% ADITIVA, IDEMPOTENTE e segura para registros existentes.
--   * Restaura 'America/Manaus' como fuso horario padrao em shop_settings,
--     funcoes de onboarding/cadastro e conversao de pedido concluido -> venda.
--   * Atualiza registros existentes que herdaram 'America/Sao_Paulo' apenas do
--     DEFAULT anterior, preservando explicitamente outras configuracoes.
--   * Endurece RLS de tenant_push_subscriptions para owner, admin e manager.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. DEFAULT E BACKFILL SEGURO DE TIMEZONE PARA AMERICA/MANAUS
-- ----------------------------------------------------------------------------

ALTER TABLE public.shop_settings
  ALTER COLUMN timezone SET DEFAULT 'America/Manaus';

UPDATE public.shop_settings
SET
  timezone = 'America/Manaus',
  updated_at = now()
WHERE timezone = 'America/Sao_Paulo';

CREATE OR REPLACE FUNCTION public.validate_shop_settings_timezone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tz text := btrim(coalesce(NEW.timezone, ''));
BEGIN
  IF v_tz = '' THEN
    NEW.timezone := 'America/Manaus';
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_tz
  ) THEN
    RAISE EXCEPTION 'Fuso horario invalido: %', v_tz;
  END IF;

  NEW.timezone := v_tz;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_shop_settings_timezone() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. PROVISIONAMENTO E ONBOARDING COM TIMEZONE AMERICA/MANAUS E TRIAL DE 3 DIAS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_new_mgw_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_provided_name text;
  v_name text;
  v_onboarding_completed boolean;
  v_slug_base text;
  v_slug text;
  v_tenant_id uuid;
  v_trial_days integer := 3;
  v_trial_amount integer;
  v_email text;
  v_start_date date := (now() AT TIME ZONE 'America/Manaus')::date;
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  v_email := lower(btrim(NEW.email));

  IF EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = NEW.id
      AND tm.active = true
  ) THEN
    RETURN NEW;
  END IF;

  v_provided_name := left(btrim(coalesce(NEW.raw_user_meta_data ->> 'shop_name', '')), 80);
  v_onboarding_completed := (v_provided_name <> '');
  v_name := CASE
    WHEN v_onboarding_completed THEN v_provided_name
    ELSE 'Meu Estabelecimento'
  END;

  SELECT amount_cents INTO v_trial_amount
  FROM public.plans
  WHERE code = 'trial' AND active = true;

  IF v_trial_amount IS NULL THEN
    RAISE EXCEPTION 'Plano trial nao esta configurado.';
  END IF;

  v_slug_base := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);
  IF char_length(v_slug_base) < 2 THEN
    v_slug_base := 'loja';
  END IF;
  v_slug := left(v_slug_base, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.tenants (slug, name, status, billing_exempt, onboarding_completed)
  VALUES (v_slug, v_name, 'active', false, v_onboarding_completed)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, email, role, active)
  VALUES (v_tenant_id, NEW.id, v_email, 'owner', true);

  INSERT INTO public.subscriptions (
    tenant_id, plan_code, plan_amount_cents, currency, status,
    trial_ends_at, current_period_start, current_period_end, retention_status
  )
  VALUES (
    v_tenant_id, 'trial', v_trial_amount, 'BRL', 'trialing',
    now() + make_interval(days => v_trial_days),
    now(),
    now() + make_interval(days => v_trial_days),
    'none'
  );

  INSERT INTO public.shop_settings (tenant_id, owner_email, establishment_name, start_date, timezone)
  VALUES (v_tenant_id, v_email, v_name, v_start_date, 'America/Manaus');

  INSERT INTO public.digital_menu_settings (
    tenant_id, slug, is_active, is_open, store_name, description,
    phone_whatsapp, address, opening_hours, pix_key, delivery_fee,
    minimum_order_amount, accepts_delivery, accepts_pickup
  ) VALUES (
    v_tenant_id, v_slug, false, true, v_name,
    'Confira nosso cardápio e faça seu pedido online.',
    '', '', 'Consulte nosso horário de funcionamento', '', 5, 15, true, true
  );

  INSERT INTO public.user_profiles (user_id, email, full_name, default_tenant_id)
  VALUES (
    NEW.id,
    v_email,
    left(btrim(coalesce(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', '')), 120),
    v_tenant_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    default_tenant_id = COALESCE(public.user_profiles.default_tenant_id, EXCLUDED.default_tenant_id),
    updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_new_mgw_owner() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(
  p_name text,
  p_slug text DEFAULT NULL,
  p_plan_code text DEFAULT 'trial'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_confirmed_at timestamptz;
  v_clean_name text;
  v_base_slug text;
  v_final_slug text;
  v_plan_code text;
  v_sub_status text;
  v_trial_end timestamptz;
  v_tenant_id uuid;
  v_suffix integer := 0;
  v_start_date date := (now() AT TIME ZONE 'America/Manaus')::date;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.';
  END IF;

  SELECT lower(btrim(u.email)), u.email_confirmed_at
  INTO v_email, v_confirmed_at
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'E-mail precisa estar verificado para criar estabelecimento.';
  END IF;

  v_clean_name := left(btrim(coalesce(p_name, '')), 80);
  IF char_length(v_clean_name) = 0 THEN
    RAISE EXCEPTION 'Informe o nome do estabelecimento.';
  END IF;

  v_plan_code := coalesce(nullif(btrim(p_plan_code), ''), 'trial');
  IF v_plan_code NOT IN ('trial', 'mgw_mensal_49') THEN
    RAISE EXCEPTION 'Plano inicial nao permitido no cadastro comercial.';
  END IF;

  IF v_plan_code = 'trial' THEN
    v_sub_status := 'trialing';
    v_trial_end := now() + interval '3 days';
  ELSE
    v_sub_status := 'pending';
    v_trial_end := NULL;
  END IF;

  v_base_slug := lower(regexp_replace(coalesce(nullif(btrim(p_slug), ''), v_clean_name), '[^a-zA-Z0-9_-]+', '-', 'g'));
  v_base_slug := trim(both '-_' FROM v_base_slug);
  IF char_length(v_base_slug) < 2 THEN
    v_base_slug := 'lanche';
  END IF;
  v_base_slug := left(v_base_slug, 54);
  v_final_slug := v_base_slug;

  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_final_slug) LOOP
    v_suffix := v_suffix + 1;
    v_final_slug := left(v_base_slug, 48) || '-' || v_suffix::text;
    IF v_suffix > 50 THEN
      v_final_slug := left(v_base_slug, 42) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.tenants (slug, name, is_founder_account, billing_exempt, status, onboarding_completed)
  VALUES (v_final_slug, v_clean_name, false, false, 'active', true)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.subscriptions (
    tenant_id,
    plan_code,
    plan_amount_cents,
    currency,
    status,
    trial_ends_at,
    current_period_start,
    current_period_end,
    retention_status
  )
  SELECT
    v_tenant_id,
    p.code,
    p.amount_cents,
    p.currency,
    v_sub_status,
    v_trial_end,
    CASE WHEN v_sub_status = 'trialing' THEN now() ELSE NULL END,
    v_trial_end,
    'none'
  FROM public.plans p
  WHERE p.code = v_plan_code;

  INSERT INTO public.tenant_members (
    tenant_id,
    user_id,
    email,
    role,
    is_founder,
    active,
    invited_by,
    claimed_at
  )
  VALUES (
    v_tenant_id,
    v_uid,
    v_email,
    'owner',
    false,
    true,
    v_uid,
    now()
  );

  INSERT INTO public.shop_settings (
    tenant_id,
    owner_email,
    establishment_name,
    x_salada_price,
    daily_goal,
    monthly_goal,
    start_date,
    timezone
  )
  VALUES (
    v_tenant_id,
    v_email,
    v_clean_name,
    22.00,
    800.00,
    18000.00,
    v_start_date,
    'America/Manaus'
  );

  INSERT INTO public.user_profiles (user_id, email, default_tenant_id)
  VALUES (v_uid, v_email, v_tenant_id)
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    default_tenant_id = COALESCE(public.user_profiles.default_tenant_id, EXCLUDED.default_tenant_id),
    updated_at = now();

  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_with_owner(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_tenant_onboarding(
  p_tenant_id uuid,
  p_store_name text,
  p_owner_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_confirmed_at timestamptz;
  v_clean_name text;
  v_owner_name text;
  v_tenant public.tenants%ROWTYPE;
  v_slug_base text;
  v_final_slug text;
  v_suffix integer := 0;
  v_start_date date := (now() AT TIME ZONE 'America/Manaus')::date;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.';
  END IF;

  SELECT lower(btrim(u.email)), u.email_confirmed_at
  INTO v_email, v_confirmed_at
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'E-mail precisa estar verificado para concluir o onboarding.';
  END IF;

  IF NOT public.is_tenant_owner(p_tenant_id) OR NOT public.has_active_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado para configurar este estabelecimento.';
  END IF;

  v_clean_name := left(btrim(coalesce(p_store_name, '')), 80);
  IF char_length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Informe o nome do estabelecimento (minimo 2 caracteres).';
  END IF;
  v_owner_name := left(btrim(coalesce(p_owner_name, '')), 120);

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento nao encontrado.';
  END IF;

  v_final_slug := v_tenant.slug;
  IF NOT v_tenant.onboarding_completed THEN
    v_slug_base := lower(regexp_replace(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug_base := trim(both '-' from v_slug_base);
    IF char_length(v_slug_base) < 2 THEN
      v_slug_base := 'loja';
    END IF;
    v_slug_base := left(v_slug_base, 48);
    v_final_slug := v_slug_base;

    WHILE EXISTS (
      SELECT 1 FROM public.tenants WHERE slug = v_final_slug AND id <> p_tenant_id
    ) OR EXISTS (
      SELECT 1 FROM public.digital_menu_settings WHERE slug = v_final_slug AND tenant_id <> p_tenant_id
    ) LOOP
      v_suffix := v_suffix + 1;
      v_final_slug := left(v_slug_base, 44) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      IF v_suffix > 10 THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.tenants
  SET
    name = v_clean_name,
    slug = v_final_slug,
    onboarding_completed = true,
    updated_at = now()
  WHERE id = p_tenant_id;

  INSERT INTO public.shop_settings (tenant_id, owner_email, establishment_name, start_date, timezone)
  VALUES (p_tenant_id, v_email, v_clean_name, v_start_date, 'America/Manaus')
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    establishment_name = v_clean_name,
    updated_at = now();

  UPDATE public.digital_menu_settings
  SET
    store_name = v_clean_name,
    slug = CASE WHEN v_tenant.onboarding_completed = false THEN v_final_slug ELSE slug END,
    updated_at = now()
  WHERE tenant_id = p_tenant_id;

  IF v_owner_name <> '' THEN
    INSERT INTO public.user_profiles (user_id, email, full_name, default_tenant_id)
    VALUES (v_uid, v_email, v_owner_name, p_tenant_id)
    ON CONFLICT (user_id) DO UPDATE
    SET
      full_name = v_owner_name,
      default_tenant_id = COALESCE(public.user_profiles.default_tenant_id, EXCLUDED.default_tenant_id),
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'tenantId', p_tenant_id,
    'slug', v_final_slug,
    'name', v_clean_name,
    'onboardingCompleted', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_tenant_onboarding(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_tenant_onboarding(uuid, text, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. CONVERSAO DE PEDIDO CONCLUIDO -> VENDA (TAXA DE ENTREGA + AMERICA/MANAUS)
-- ----------------------------------------------------------------------------

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
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
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
  v_configured_tz text;
  v_tz text := 'America/Manaus';
  v_sale_date date;
  v_delivery_fee numeric(12,2);
  v_sale_total numeric(12,2);
  v_actor_email text;
BEGIN
  SELECT * INTO v_order FROM public.online_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_tenant_role(v_order.tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Pedido nao encontrado ou acesso negado.';
  END IF;
  IF v_order.status IN ('completed', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Pedido ja finalizado nao permite alteracao.';
  END IF;
  IF p_next_status IN ('rejected', 'cancelled') AND length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo (minimo 3 caracteres).';
  END IF;
  IF NOT (
    (v_order.status = 'received' AND p_next_status IN ('accepted', 'rejected', 'cancelled')) OR
    (v_order.status = 'accepted' AND p_next_status IN ('preparing', 'cancelled')) OR
    (v_order.status = 'preparing' AND p_next_status IN ('ready', 'cancelled')) OR
    (v_order.status = 'ready' AND p_next_status IN (CASE WHEN v_order.fulfillment_type = 'delivery' THEN 'out_for_delivery' ELSE 'ready_for_pickup' END, 'cancelled')) OR
    (v_order.status IN ('out_for_delivery', 'ready_for_pickup') AND p_next_status IN ('completed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Transicao de status invalida.';
  END IF;

  UPDATE public.online_orders SET
    status = p_next_status,
    viewed_at = coalesce(viewed_at, v_now),
    accepted_at = CASE WHEN p_next_status = 'accepted' THEN coalesce(accepted_at, v_now) ELSE accepted_at END,
    preparing_at = CASE WHEN p_next_status = 'preparing' THEN coalesce(preparing_at, v_now) ELSE preparing_at END,
    ready_at = CASE WHEN p_next_status = 'ready' THEN coalesce(ready_at, v_now) ELSE ready_at END,
    dispatched_at = CASE WHEN p_next_status IN ('out_for_delivery', 'ready_for_pickup') THEN coalesce(dispatched_at, v_now) ELSE dispatched_at END,
    completed_at = CASE WHEN p_next_status = 'completed' THEN coalesce(completed_at, v_now) ELSE completed_at END,
    cancelled_at = CASE WHEN p_next_status IN ('rejected', 'cancelled') THEN coalesce(cancelled_at, v_now) ELSE cancelled_at END,
    rejection_reason = CASE WHEN p_next_status IN ('rejected', 'cancelled') THEN v_reason ELSE rejection_reason END,
    updated_at = v_now
  WHERE id = p_order_id;

  INSERT INTO public.online_order_status_history(order_id, tenant_id, from_status, to_status, reason, actor_type)
  VALUES (
    p_order_id,
    v_order.tenant_id,
    v_order.status,
    p_next_status,
    CASE WHEN p_next_status IN ('rejected', 'cancelled') THEN v_reason ELSE p_next_status END,
    'admin'
  );

  IF p_next_status = 'completed' AND v_order.sale_id IS NULL THEN
    SELECT ss.timezone INTO v_configured_tz
    FROM public.shop_settings ss
    WHERE ss.tenant_id = v_order.tenant_id;

    IF v_configured_tz IS NOT NULL AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = btrim(v_configured_tz)
    ) THEN
      v_tz := btrim(v_configured_tz);
    END IF;
    v_sale_date := (v_now AT TIME ZONE v_tz)::date;

    SELECT
      coalesce(sum(i.x_saladas_per_unit * i.quantity), 0)::integer,
      coalesce(sum(i.quantity), 0)::integer,
      bool_or(i.item_kind = 'combo'),
      bool_or(i.item_kind = 'product'),
      coalesce(jsonb_agg(jsonb_build_object(
        'kind', i.item_kind, 'refId', i.ref_id, 'name', i.item_name,
        'quantity', i.quantity, 'unitPrice', i.unit_price, 'lineTotal', i.line_total,
        'estimatedUnitCost', i.estimated_unit_cost, 'xSaladasPerUnit', i.x_saladas_per_unit,
        'components', i.components
      ) ORDER BY i.created_at), '[]'::jsonb)
    INTO v_xsalada_count, v_total_units, v_has_combo, v_has_product, v_sale_items
    FROM public.online_order_items i
    WHERE i.order_id = p_order_id;

    v_quantity := greatest(1, CASE WHEN v_xsalada_count > 0 THEN v_xsalada_count ELSE v_total_units END);
    v_sale_mode := CASE
      WHEN coalesce(v_has_combo, false) AND coalesce(v_has_product, false) THEN 'mixed'
      WHEN coalesce(v_has_combo, false) THEN 'combo'
      ELSE 'individual'
    END;
    v_payment := CASE WHEN v_order.payment_method = 'Cartão' THEN 'Cartão de crédito' ELSE v_order.payment_method END;
    v_note := left(
      v_order.order_code || ' · ' || v_order.customer_name ||
      CASE WHEN v_order.customer_note <> '' THEN ' · ' || v_order.customer_note ELSE '' END,
      240
    );
    v_delivery_fee := greatest(0, coalesce(v_order.delivery_fee, 0));
    v_sale_total := greatest(
      0,
      round(
        greatest(
          coalesce(v_order.total_amount, 0),
          coalesce(v_order.subtotal_amount, 0) + v_delivery_fee
        ),
        2
      )
    );

    SELECT tm.email INTO v_actor_email
    FROM public.tenant_members tm
    WHERE tm.tenant_id = v_order.tenant_id
      AND tm.user_id = auth.uid()
      AND tm.active = true
    LIMIT 1;

    INSERT INTO public.sales (
      tenant_id, owner_email, date, quantity, unit_price, total_amount, payment_method, note,
      sale_mode, x_salada_count, combos_count, items, sale_origin, online_order_id, delivery_fee
    ) VALUES (
      v_order.tenant_id,
      coalesce(v_actor_email, ''),
      v_sale_date,
      v_quantity,
      round(v_sale_total / nullif(v_quantity, 0), 2),
      v_sale_total,
      v_payment,
      v_note,
      v_sale_mode,
      v_xsalada_count,
      (SELECT coalesce(sum(quantity), 0)::integer FROM public.online_order_items WHERE order_id = p_order_id AND item_kind = 'combo'),
      v_sale_items,
      'online',
      p_order_id,
      v_delivery_fee
    )
    RETURNING id INTO v_sale_id;

    UPDATE public.online_orders SET sale_id = v_sale_id WHERE id = p_order_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_online_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_online_order_status(uuid, text, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. REFORCO DE RBAC EM TENANT_PUSH_SUBSCRIPTIONS (SOMENTE OWNER/ADMIN/MANAGER)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS tenant_push_subscriptions_manage_own_active ON public.tenant_push_subscriptions;
DROP POLICY IF EXISTS tenant_push_subscriptions_manage_own_by_role ON public.tenant_push_subscriptions;
CREATE POLICY tenant_push_subscriptions_manage_own_by_role
  ON public.tenant_push_subscriptions
  FOR ALL
  TO authenticated
  USING (
    user_id = (select auth.uid())
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

COMMIT;
