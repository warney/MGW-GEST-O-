-- ============================================================================
-- MGW GESTAO — ETAPA 2: HARDENING MULTI-TENANT, SEGURANCA E ALINHAMENTO SAAS
-- Migration: 20261119000001_etapa2_multi_tenant_hardening_and_saas_alignment.sql
--
-- Regras:
--   * Migration 100% ADITIVA e segura para dados existentes.
--   * Alinha plano comercial unico (R$ 49,90/mes = 4990 centavos) e trial de 3 dias.
--   * Prepara colunas de encerramento e retencao de 6 meses na tabela subscriptions.
--   * Suporta onboarding de estabelecimento para novos cadastros via Google OAuth
--     sem duplicar tenants.
--   * Endurece politicas RLS (sales, shop_settings, products, combos,
--     digital_menu_settings, online_orders, tenant_push_subscriptions) e fecha
--     exposicao global de online_order_realtime_pings.
--   * Corrige conversao de pedido online concluido -> venda (inclui delivery_fee
--     no total_amount e usa timezone configurada do estabelecimento).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ALINHAMENTO DE PLANOS, ASSINATURAS (4990 CENTAVOS, 3 DIAS, RETENCAO)
-- ----------------------------------------------------------------------------

UPDATE public.plans
SET
  name = 'Período de Teste (3 dias)',
  description = 'Avaliação completa gratuita por 3 dias imediatamente após o cadastro.',
  active = true,
  updated_at = now()
WHERE code = 'trial';

UPDATE public.plans
SET
  name = 'MGW Gestão Mensal',
  description = 'Plano comercial único com faturamento mensal recorrente de R$ 49,90.',
  amount_cents = 4990,
  billing_interval = 'monthly',
  active = true,
  updated_at = now()
WHERE code = 'mgw_mensal_49';

UPDATE public.plans
SET
  active = false,
  description = 'Plano legado desativado para novas contratações comerciais.',
  updated_at = now()
WHERE code = 'free';

COMMENT ON TABLE public.plans IS
  'Catalogo oficial de planos do MGW Gestao (isento fundador, trial 3 dias e mensal R$ 49,90).';

COMMENT ON TABLE public.subscriptions IS
  'Status da assinatura unica (R$ 49,90/mes) ou isencao fundadora por estabelecimento, com controle de carencia e retencao.';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS chk_subscriptions_status,
  DROP CONSTRAINT IF EXISTS chk_subscriptions_retention_status;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT chk_subscriptions_status CHECK (
    status IN (
      'pending',
      'trialing',
      'active',
      'authorized',
      'past_due',
      'paused',
      'cancelled',
      'expired',
      'suspended',
      'free',
      'exempt'
    )
  ),
  ADD CONSTRAINT chk_subscriptions_retention_status CHECK (
    retention_status IN ('none', 'active_retention', 'expired')
  );

-- ----------------------------------------------------------------------------
-- 2. ONBOARDING DE ESTABELECIMENTO (OAUTH) E FUSO HORARIO EM SHOP_SETTINGS
-- ----------------------------------------------------------------------------

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT true;

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.shop_settings
  DROP CONSTRAINT IF EXISTS chk_shop_settings_timezone_nonempty;

ALTER TABLE public.shop_settings
  ADD CONSTRAINT chk_shop_settings_timezone_nonempty
  CHECK (char_length(btrim(timezone)) > 0);

CREATE OR REPLACE FUNCTION public.validate_shop_settings_timezone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tz text := btrim(coalesce(NEW.timezone, ''));
BEGIN
  IF v_tz = '' THEN
    NEW.timezone := 'America/Sao_Paulo';
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

DROP TRIGGER IF EXISTS trg_shop_settings_validate_timezone ON public.shop_settings;
CREATE TRIGGER trg_shop_settings_validate_timezone
  BEFORE INSERT OR UPDATE ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_shop_settings_timezone();

REVOKE ALL ON FUNCTION public.validate_shop_settings_timezone() FROM PUBLIC, anon, authenticated;

-- Protege onboarding_completed contra alteracao direta fora de RPC/service_role
CREATE OR REPLACE FUNCTION public.guard_tenant_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_privileged_db_role() THEN
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'Alteracao de slug nao e permitida.';
    END IF;
    IF NEW.is_founder_account IS DISTINCT FROM OLD.is_founder_account THEN
      RAISE EXCEPTION 'Alteracao de is_founder_account nao e permitida.';
    END IF;
    IF NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt THEN
      RAISE EXCEPTION 'Alteracao de billing_exempt nao e permitida.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Alteracao de status do tenant nao e permitida.';
    END IF;
    IF NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed THEN
      RAISE EXCEPTION 'Alteracao direta de onboarding_completed nao e permitida.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_tenant_protected_fields() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. FUNCOES OFICIAIS DE ACESSO, TRIAL (3 DIAS), CARENCIA E RETENCAO
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_tenant_billing_active(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
    WHERE t.id = p_tenant_id
      AND t.status = 'active'
      AND coalesce(s.retention_status, 'none') = 'none'
      AND (
        t.billing_exempt = true
        OR s.status IN ('authorized', 'active', 'exempt', 'free')
        OR (
          s.status = 'trialing'
          AND s.trial_ends_at IS NOT NULL
          AND s.trial_ends_at > now()
        )
        OR (
          s.status IN ('past_due', 'paused')
          AND s.grace_until IS NOT NULL
          AND s.grace_until > now()
        )
        OR (
          s.status = 'cancelled'
          AND s.current_period_end IS NOT NULL
          AND s.current_period_end > now()
        )
      )
  );
$$;

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
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.active = true
      AND public.is_tenant_billing_active(p_tenant_id)
  );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_billing_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_billing_active(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_active_tenant_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_tenant_access(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. PROVISIONAMENTO DE NOVO USUARIO (3 DIAS DE TESTE) & ONBOARDING OAUTH
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
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  v_email := lower(btrim(NEW.email));

  -- Evita duplicacao caso o usuario ja tenha vinculo ativo criado em corrida
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
  VALUES (v_tenant_id, v_email, v_name, current_date, 'America/Sao_Paulo');

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
    CURRENT_DATE,
    'America/Sao_Paulo'
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
  VALUES (p_tenant_id, v_email, v_clean_name, current_date, 'America/Sao_Paulo')
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
-- 5. CARDAPIO PUBLICO E PEDIDOS ONLINE (CONVERSAO EXATA + TIMEZONE)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_digital_menu(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'found', true,
    'store', jsonb_build_object(
      'slug', d.slug,
      'isActive', d.is_active,
      'isOpen', d.is_open,
      'storeName', d.store_name,
      'description', d.description,
      'phoneWhatsapp', d.phone_whatsapp,
      'address', d.address,
      'openingHours', d.opening_hours,
      'pixKey', d.pix_key,
      'logoUrl', d.logo_url,
      'bannerUrl', d.banner_url,
      'deliveryFee', d.delivery_fee,
      'minimumOrderAmount', d.minimum_order_amount,
      'acceptsDelivery', d.accepts_delivery,
      'acceptsPickup', d.accepts_pickup
    ),
    'products', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', p.category,
        'unitPrice', p.unit_price, 'countsAsXSalada', p.counts_as_x_salada,
        'imageUrl', coalesce(p.image_url, '')
      ) ORDER BY p.name)
      FROM public.products p
      WHERE p.tenant_id = d.tenant_id AND p.active = true
    ), '[]'::jsonb),
    'combos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'description', c.description,
        'items', c.items, 'salePrice', c.sale_price,
        'imageUrl', coalesce(c.image_url, '')
      ) ORDER BY c.name)
      FROM public.combos c
      WHERE c.tenant_id = d.tenant_id AND c.active = true
    ), '[]'::jsonb)
  )
  FROM public.digital_menu_settings d
  WHERE d.slug = lower(btrim(coalesce(p_slug, '')))
    AND d.is_active = true
    AND public.is_tenant_billing_active(d.tenant_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_digital_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO anon, authenticated, service_role;

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
  v_product_counts boolean;
  v_components jsonb;
  v_pending_items jsonb := '[]'::jsonb;
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

  SELECT * INTO v_menu
  FROM public.digital_menu_settings
  WHERE slug = lower(btrim(p_slug))
    AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cardapio digital nao encontrado ou indisponivel.';
  END IF;

  IF NOT public.is_tenant_billing_active(v_menu.tenant_id) THEN
    RAISE EXCEPTION 'Estabelecimento temporariamente indisponivel.';
  END IF;

  IF NOT v_menu.is_open THEN RAISE EXCEPTION 'A loja esta fechada para novos pedidos.'; END IF;
  IF p_fulfillment_type NOT IN ('delivery','pickup') THEN RAISE EXCEPTION 'Escolha entrega ou retirada.'; END IF;
  IF p_fulfillment_type = 'delivery' AND NOT v_menu.accepts_delivery THEN RAISE EXCEPTION 'Esta loja nao aceita pedidos para entrega.'; END IF;
  IF p_fulfillment_type = 'pickup' AND NOT v_menu.accepts_pickup THEN RAISE EXCEPTION 'Esta loja nao aceita retirada.'; END IF;
  IF p_payment_method NOT IN ('Pix','Dinheiro','Cartão') THEN RAISE EXCEPTION 'Forma de pagamento invalida.'; END IF;
  IF length(btrim(coalesce(p_customer_name,''))) < 2 OR length(coalesce(p_customer_name,'')) > 120 THEN RAISE EXCEPTION 'Informe seu nome.'; END IF;
  IF length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g')) < 10 THEN RAISE EXCEPTION 'Informe um telefone valido.'; END IF;
  IF p_fulfillment_type = 'delivery' AND length(btrim(coalesce(p_delivery_address,''))) < 5 THEN RAISE EXCEPTION 'Informe o endereco de entrega.'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 40 THEN
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
      INTO v_name, v_unit_price, v_product_counts
      FROM public.products
      WHERE id = v_ref AND tenant_id = v_menu.tenant_id AND active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Um produto do carrinho nao esta mais disponivel.'; END IF;
      v_xsaladas := CASE WHEN v_product_counts THEN 1 ELSE 0 END;
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
    v_pending_items := v_pending_items || jsonb_build_array(jsonb_build_object(
      'id',v_order_item_id,'kind',v_kind,'refId',v_ref,'name',v_name,
      'quantity',v_qty,'unitPrice',v_unit_price,'lineTotal',v_unit_price*v_qty,
      'estimatedUnitCost',v_unit_cost,'xSaladasPerUnit',v_xsaladas,
      'components',v_components,'note',v_note
    ));
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

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_pending_items) LOOP
    INSERT INTO public.online_order_items (
      id,order_id,tenant_id,item_kind,ref_id,item_name,quantity,unit_price,
      line_total,estimated_unit_cost,x_saladas_per_unit,components,item_note
    ) VALUES (
      (v_item->>'id')::uuid,v_order_id,v_menu.tenant_id,v_item->>'kind',
      (v_item->>'refId')::uuid,v_item->>'name',(v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric,(v_item->>'lineTotal')::numeric,
      (v_item->>'estimatedUnitCost')::numeric,(v_item->>'xSaladasPerUnit')::integer,
      v_item->'components',v_item->>'note'
    );
  END LOOP;

  INSERT INTO public.online_order_status_history(order_id,tenant_id,from_status,to_status,reason,actor_type)
  VALUES (v_order_id,v_menu.tenant_id,NULL,'received','Pedido enviado pelo cardapio digital.','customer');

  RETURN jsonb_build_object(
    'orderId',v_order_id,'orderNumber',v_order_number,'orderCode',v_order_code,
    'trackingToken',v_token,'tokenHash',v_token_hash,'status','received',
    'subtotalAmount',v_subtotal,'deliveryFee',v_delivery_fee,'totalAmount',v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_online_order_viewed(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.online_orders WHERE id = p_order_id;
  IF v_tenant IS NULL OR NOT public.has_tenant_role(v_tenant, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Pedido nao encontrado ou acesso negado.';
  END IF;
  UPDATE public.online_orders
  SET viewed_at = coalesce(viewed_at, now()), updated_at = now()
  WHERE id = p_order_id AND tenant_id = v_tenant;
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
  v_configured_tz text;
  v_tz text := 'America/Sao_Paulo';
  v_sale_date date;
  v_sale_total numeric(12,2);
  v_actor_email text;
BEGIN
  SELECT * INTO v_order FROM public.online_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_tenant_role(v_order.tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Pedido nao encontrado ou acesso negado.';
  END IF;
  IF v_order.status IN ('completed','rejected','cancelled') THEN
    RAISE EXCEPTION 'Pedido ja finalizado nao permite alteracao.';
  END IF;
  IF p_next_status IN ('rejected','cancelled') AND length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo (minimo 3 caracteres).';
  END IF;
  IF NOT (
    (v_order.status='received' AND p_next_status IN ('accepted','rejected','cancelled')) OR
    (v_order.status='accepted' AND p_next_status IN ('preparing','cancelled')) OR
    (v_order.status='preparing' AND p_next_status IN ('ready','cancelled')) OR
    (v_order.status='ready' AND p_next_status IN (CASE WHEN v_order.fulfillment_type='delivery' THEN 'out_for_delivery' ELSE 'ready_for_pickup' END,'cancelled')) OR
    (v_order.status IN ('out_for_delivery','ready_for_pickup') AND p_next_status IN ('completed','cancelled'))
  ) THEN
    RAISE EXCEPTION 'Transicao de status invalida.';
  END IF;

  UPDATE public.online_orders SET
    status = p_next_status,
    viewed_at = coalesce(viewed_at, v_now),
    accepted_at = CASE WHEN p_next_status='accepted' THEN coalesce(accepted_at, v_now) ELSE accepted_at END,
    preparing_at = CASE WHEN p_next_status='preparing' THEN coalesce(preparing_at, v_now) ELSE preparing_at END,
    ready_at = CASE WHEN p_next_status='ready' THEN coalesce(ready_at, v_now) ELSE ready_at END,
    dispatched_at = CASE WHEN p_next_status IN ('out_for_delivery','ready_for_pickup') THEN coalesce(dispatched_at, v_now) ELSE dispatched_at END,
    completed_at = CASE WHEN p_next_status='completed' THEN coalesce(completed_at, v_now) ELSE completed_at END,
    cancelled_at = CASE WHEN p_next_status IN ('rejected','cancelled') THEN coalesce(cancelled_at, v_now) ELSE cancelled_at END,
    rejection_reason = CASE WHEN p_next_status IN ('rejected','cancelled') THEN v_reason ELSE rejection_reason END,
    updated_at = v_now
  WHERE id = p_order_id;

  INSERT INTO public.online_order_status_history(order_id,tenant_id,from_status,to_status,reason,actor_type)
  VALUES (
    p_order_id,
    v_order.tenant_id,
    v_order.status,
    p_next_status,
    CASE WHEN p_next_status IN ('rejected','cancelled') THEN v_reason ELSE p_next_status END,
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
    v_sale_total := greatest(
      0,
      round(coalesce(v_order.total_amount, v_order.subtotal_amount + coalesce(v_order.delivery_fee, 0)), 2)
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
      coalesce(v_order.delivery_fee, 0)
    )
    RETURNING id INTO v_sale_id;

    UPDATE public.online_orders SET sale_id = v_sale_id WHERE id = p_order_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_online_order_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_online_order_viewed(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transition_online_order_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_online_order_status(uuid,text,text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. ENDURECIMENTO DE RLS, TRIGGERS E FECHAMENTO DE EXPOSICAO GLOBAL
-- ----------------------------------------------------------------------------

-- Tenants e Membros: owner bloqueado por billing/retencao nao altera equipe ou tenant
DROP POLICY IF EXISTS tenants_update_owner ON public.tenants;
CREATE POLICY tenants_update_owner
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (public.is_tenant_owner(id) AND public.has_active_tenant_access(id))
  WITH CHECK (public.is_tenant_owner(id) AND public.has_active_tenant_access(id));

DROP POLICY IF EXISTS tenant_members_insert_owner_only ON public.tenant_members;
CREATE POLICY tenant_members_insert_owner_only
  ON public.tenant_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_tenant_owner(tenant_id)
    AND public.has_active_tenant_access(tenant_id)
    AND role IN ('admin', 'manager', 'staff')
    AND is_founder = false
    AND user_id IS NULL
  );

DROP POLICY IF EXISTS tenant_members_update_owner_only ON public.tenant_members;
CREATE POLICY tenant_members_update_owner_only
  ON public.tenant_members
  FOR UPDATE
  TO authenticated
  USING (
    public.is_tenant_owner(tenant_id)
    AND public.has_active_tenant_access(tenant_id)
    AND user_id IS DISTINCT FROM auth.uid()
    AND role <> 'owner'
    AND is_founder = false
  )
  WITH CHECK (
    public.is_tenant_owner(tenant_id)
    AND public.has_active_tenant_access(tenant_id)
    AND user_id IS DISTINCT FROM auth.uid()
    AND role IN ('admin', 'manager', 'staff')
    AND is_founder = false
  );

DROP POLICY IF EXISTS tenant_members_delete_owner_only ON public.tenant_members;
CREATE POLICY tenant_members_delete_owner_only
  ON public.tenant_members
  FOR DELETE
  TO authenticated
  USING (
    public.is_tenant_owner(tenant_id)
    AND public.has_active_tenant_access(tenant_id)
    AND user_id IS DISTINCT FROM auth.uid()
    AND role <> 'owner'
    AND is_founder = false
  );

-- shop_settings, products e combos: leitura exige acesso ativo (assinatura/trial/carencia/isencao)
DROP POLICY IF EXISTS shop_settings_select_member ON public.shop_settings;
CREATE POLICY shop_settings_select_active_member
  ON public.shop_settings
  FOR SELECT
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS products_select_member ON public.products;
CREATE POLICY products_select_active_member
  ON public.products
  FOR SELECT
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS combos_select_member ON public.combos;
CREATE POLICY combos_select_active_member
  ON public.combos
  FOR SELECT
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

-- sales: SELECT restrito a owner, admin e manager com assinatura/trial ativo (staff nao le historico)
DROP POLICY IF EXISTS sales_select_member ON public.sales;
DROP POLICY IF EXISTS sales_select_by_role ON public.sales;
CREATE POLICY sales_select_by_role
  ON public.sales
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

-- digital_menu_settings: SELECT exige acesso ativo; escrita liberada para owner e admin com assinatura ativa
DROP POLICY IF EXISTS digital_menu_settings_member_select ON public.digital_menu_settings;
CREATE POLICY digital_menu_settings_select_active_member
  ON public.digital_menu_settings
  FOR SELECT
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS digital_menu_settings_owner_insert ON public.digital_menu_settings;
CREATE POLICY digital_menu_settings_insert_by_role
  ON public.digital_menu_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS digital_menu_settings_owner_update ON public.digital_menu_settings;
CREATE POLICY digital_menu_settings_update_by_role
  ON public.digital_menu_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- online_orders, online_order_items, online_order_status_history: leitura restrita a owner, admin e manager ativos
DROP POLICY IF EXISTS online_orders_member_select ON public.online_orders;
CREATE POLICY online_orders_select_by_role
  ON public.online_orders
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS online_order_items_member_select ON public.online_order_items;
CREATE POLICY online_order_items_select_by_role
  ON public.online_order_items
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS online_order_history_member_select ON public.online_order_status_history;
CREATE POLICY online_order_history_select_by_role
  ON public.online_order_status_history
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

-- tenant_push_subscriptions: exige proprio user_id + acesso ativo do estabelecimento
DROP POLICY IF EXISTS "Members manage own push subscriptions" ON public.tenant_push_subscriptions;
CREATE POLICY tenant_push_subscriptions_manage_own_active
  ON public.tenant_push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = (select auth.uid()) AND public.has_active_tenant_access(tenant_id))
  WITH CHECK (user_id = (select auth.uid()) AND public.has_active_tenant_access(tenant_id));

-- Fecha exposicao publica global de online_order_realtime_pings
DROP POLICY IF EXISTS online_order_pings_public_read ON public.online_order_realtime_pings;
REVOKE ALL ON TABLE public.online_order_realtime_pings FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'online_order_realtime_pings'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.online_order_realtime_pings;
  END IF;
END;
$$;

-- Triggers updated_at e trava de tenant_id nas tabelas operacionais mais recentes
DROP TRIGGER IF EXISTS trg_digital_menu_settings_updated_at ON public.digital_menu_settings;
CREATE TRIGGER trg_digital_menu_settings_updated_at
  BEFORE UPDATE ON public.digital_menu_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_digital_menu_settings_lock_tenant ON public.digital_menu_settings;
CREATE TRIGGER trg_digital_menu_settings_lock_tenant
  BEFORE UPDATE ON public.digital_menu_settings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_online_orders_updated_at ON public.online_orders;
CREATE TRIGGER trg_online_orders_updated_at
  BEFORE UPDATE ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_online_orders_lock_tenant ON public.online_orders;
CREATE TRIGGER trg_online_orders_lock_tenant
  BEFORE UPDATE ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_online_order_items_lock_tenant ON public.online_order_items;
CREATE TRIGGER trg_online_order_items_lock_tenant
  BEFORE UPDATE ON public.online_order_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_online_order_status_history_lock_tenant ON public.online_order_status_history;
CREATE TRIGGER trg_online_order_status_history_lock_tenant
  BEFORE UPDATE ON public.online_order_status_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_tenant_push_subscriptions_updated_at ON public.tenant_push_subscriptions;
CREATE TRIGGER trg_tenant_push_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_push_subscriptions_lock_tenant ON public.tenant_push_subscriptions;
CREATE TRIGGER trg_tenant_push_subscriptions_lock_tenant
  BEFORE UPDATE ON public.tenant_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

COMMIT;
