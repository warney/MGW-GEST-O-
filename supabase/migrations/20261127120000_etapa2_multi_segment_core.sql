-- ============================================================================
-- ETAPA 2 — NUCLEO MULTISSEGMENTO (LANCHONETE + ADEGA)
-- Migration estritamente aditiva e idempotente.
-- Nao modifica RLS existente, nao altera nem sobrescreve registros antigos,
-- nao remove colunas e preserva integralmente o segmento 'lanchonete'.
-- ============================================================================

BEGIN;

-- 1) Propriedade persistente e isolada por estabelecimento (tenant)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_segment text NOT NULL DEFAULT 'lanchonete';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_tenants_business_segment'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT chk_tenants_business_segment
      CHECK (business_segment IN ('lanchonete', 'adega'));
  END IF;
END
$$;

COMMENT ON COLUMN public.tenants.business_segment IS
  'Segmento comercial do estabelecimento (lanchonete | adega). Padrao retroativo lanchonete.';

-- 2) Protege business_segment contra adulteracao direta pelo cliente fora das RPCs/triggers
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
    IF NEW.business_segment IS DISTINCT FROM OLD.business_segment THEN
      RAISE EXCEPTION 'Alteracao direta de business_segment nao e permitida.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_tenant_protected_fields() FROM PUBLIC, anon, authenticated;

-- 3) Provisionamento de novo estabelecimento preservando parceiros, indicacoes e OAuth
CREATE OR REPLACE FUNCTION public.provision_new_mgw_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_provided_shop_name text;
  v_name text;
  v_onboarding_completed boolean;
  v_slug_base text;
  v_slug text;
  v_tenant_id uuid;
  v_trial_days integer := 3;
  v_trial_amount integer;
  v_referral_code text;
  v_segment_raw text;
  v_business_segment text;
  v_email text;
  v_start_date date := (now() AT TIME ZONE 'America/Manaus')::date;
BEGIN
  IF coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'mgw_partner' THEN
    IF new.email IS NULL OR position('@' IN new.email) < 2 THEN
      RAISE EXCEPTION 'Cadastro de parceiro exige e-mail valido.';
    END IF;
    v_name := left(btrim(coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1)
    )), 120);
    IF char_length(v_name) < 2 THEN
      RAISE EXCEPTION 'Nome do parceiro invalido.';
    END IF;

    INSERT INTO public.mgw_partners(user_id, email, full_name, referral_code, status)
    VALUES (
      new.id,
      lower(btrim(new.email)),
      v_name,
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      'active'
    );
    RETURN new;
  END IF;

  IF new.email IS NULL OR btrim(new.email) = '' THEN
    RETURN new;
  END IF;

  v_email := lower(btrim(new.email));

  IF EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = new.id
      AND tm.active = true
  ) THEN
    RETURN new;
  END IF;

  v_provided_shop_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'shop_name', '')), 80);
  v_onboarding_completed := (v_provided_shop_name <> '');

  IF v_onboarding_completed THEN
    v_name := v_provided_shop_name;
  ELSE
    v_name := left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'Estabelecimento'
    ), 80);
  END IF;

  v_segment_raw := lower(btrim(coalesce(new.raw_user_meta_data ->> 'business_segment', '')));
  IF v_segment_raw <> '' AND v_segment_raw NOT IN ('lanchonete', 'adega') THEN
    RAISE EXCEPTION 'Segmento comercial invalido. Valores permitidos: lanchonete ou adega.';
  END IF;
  v_business_segment := coalesce(nullif(v_segment_raw, ''), 'lanchonete');

  SELECT amount_cents INTO v_trial_amount
  FROM public.plans
  WHERE code = 'trial' AND active = true;
  IF v_trial_amount IS NULL THEN
    RAISE EXCEPTION 'Plano trial nao esta configurado.';
  END IF;

  v_slug_base := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' FROM v_slug_base);
  IF char_length(v_slug_base) < 2 THEN
    v_slug_base := 'loja';
  END IF;
  v_slug := left(v_slug_base, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.tenants(
    slug, name, status, billing_exempt, onboarding_completed, business_segment
  )
  VALUES (
    v_slug, v_name, 'active', false, v_onboarding_completed, v_business_segment
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_members(tenant_id, user_id, email, role, active)
  VALUES (v_tenant_id, new.id, v_email, 'owner', true);

  INSERT INTO public.subscriptions(
    tenant_id, plan_code, plan_amount_cents, currency, status,
    trial_ends_at, current_period_start, current_period_end, retention_status
  ) VALUES (
    v_tenant_id, 'trial', v_trial_amount, 'BRL', 'trialing',
    now() + make_interval(days => v_trial_days),
    now(),
    now() + make_interval(days => v_trial_days),
    'none'
  );

  INSERT INTO public.shop_settings(tenant_id, owner_email, establishment_name, start_date, timezone)
  VALUES (v_tenant_id, v_email, v_name, v_start_date, 'America/Manaus');

  INSERT INTO public.digital_menu_settings(
    tenant_id, slug, is_active, is_open, store_name, description,
    phone_whatsapp, address, opening_hours, pix_key, delivery_fee,
    minimum_order_amount, accepts_delivery, accepts_pickup
  ) VALUES (
    v_tenant_id, v_slug, false, true, v_name,
    'Confira nosso cardapio e faca seu pedido online.',
    '', '', 'Consulte nosso horario de funcionamento', '', 5, 15, true, true
  );

  INSERT INTO public.user_profiles(user_id, email, full_name, default_tenant_id)
  VALUES (
    new.id,
    v_email,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 120),
    v_tenant_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    default_tenant_id = COALESCE(public.user_profiles.default_tenant_id, EXCLUDED.default_tenant_id),
    updated_at = now();

  -- Codigo de indicacao e dado comercial nao confiavel: nao concede permissao.
  v_referral_code := upper(left(btrim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')), 16));
  IF v_referral_code ~ '^[A-Z0-9]{8,16}$' THEN
    INSERT INTO public.mgw_partner_referrals(partner_id, referred_user_id, tenant_id, referral_code, status)
    SELECT p.id, new.id, v_tenant_id, p.referral_code, 'registered'
    FROM public.mgw_partners p
    WHERE p.referral_code = v_referral_code
      AND p.status = 'active'
      AND p.user_id <> new.id
    ON CONFLICT (tenant_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.provision_new_mgw_owner() FROM PUBLIC, anon, authenticated;

-- 4) Onboarding do primeiro acesso permite definir segmento somente antes de concluir onboarding
DROP FUNCTION IF EXISTS public.complete_tenant_onboarding(uuid, text, text);

CREATE OR REPLACE FUNCTION public.complete_tenant_onboarding(
  p_tenant_id uuid,
  p_store_name text,
  p_owner_name text DEFAULT '',
  p_business_segment text DEFAULT NULL
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
  v_requested_segment text;
  v_final_segment text;
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

  v_requested_segment := NULL;
  IF p_business_segment IS NOT NULL AND btrim(p_business_segment) <> '' THEN
    v_requested_segment := lower(btrim(p_business_segment));
    IF v_requested_segment NOT IN ('lanchonete', 'adega') THEN
      RAISE EXCEPTION 'Segmento comercial invalido.';
    END IF;
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento nao encontrado.';
  END IF;

  v_final_segment := coalesce(nullif(btrim(v_tenant.business_segment), ''), 'lanchonete');
  IF NOT v_tenant.onboarding_completed AND v_requested_segment IS NOT NULL THEN
    v_final_segment := v_requested_segment;
  END IF;

  v_final_slug := v_tenant.slug;
  IF NOT v_tenant.onboarding_completed THEN
    v_slug_base := lower(regexp_replace(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug_base := trim(both '-' FROM v_slug_base);
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
    business_segment = v_final_segment,
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
    'onboardingCompleted', true,
    'businessSegment', v_final_segment
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_tenant_onboarding(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_tenant_onboarding(uuid, text, text, text) TO authenticated, service_role;

-- 5) Cardapio Digital publico reconhece o segmento diretamente do tenant no backend
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
      'acceptsPickup', d.accepts_pickup,
      'timezone', coalesce(nullif(btrim(ss.timezone), ''), 'America/Manaus'),
      'businessSegment', coalesce(nullif(btrim(t.business_segment), ''), 'lanchonete')
    ),
    'deliveryPricing', coalesce((
      SELECT jsonb_build_object(
        'pricingMode', dps.pricing_mode,
        'defaultFeeEnabled', dps.default_fee_enabled,
        'defaultDeliveryFee', dps.default_delivery_fee,
        'defaultMinimumOrderAmount', dps.default_minimum_order_amount,
        'defaultEstimatedTime', dps.default_estimated_time,
        'freeDeliveryEnabled', dps.free_delivery_enabled,
        'freeDeliveryMinAmount', dps.free_delivery_min_amount
      )
      FROM public.delivery_pricing_settings dps
      WHERE dps.tenant_id = d.tenant_id
    ), jsonb_build_object(
      'pricingMode', 'by_neighborhood',
      'defaultFeeEnabled', true,
      'defaultDeliveryFee', d.delivery_fee,
      'defaultMinimumOrderAmount', d.minimum_order_amount,
      'defaultEstimatedTime', '',
      'freeDeliveryEnabled', false,
      'freeDeliveryMinAmount', 0
    )),
    'deliveryRegions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', dr.id,
        'name', dr.name,
        'city', dr.city,
        'neighborhoods', to_jsonb(dr.neighborhoods),
        'description', dr.description,
        'deliveryFee', dr.delivery_fee,
        'minimumOrderAmount', dr.minimum_order_amount,
        'estimatedTime', dr.estimated_time,
        'status', dr.status,
        'isTemporarilySuspended', dr.is_temporarily_suspended,
        'suspensionReason', dr.suspension_reason,
        'scheduleEnabled', dr.schedule_enabled,
        'scheduleDays', to_jsonb(dr.schedule_days),
        'scheduleStart', dr.schedule_start,
        'scheduleEnd', dr.schedule_end
      ) ORDER BY dr.city ASC, dr.name ASC)
      FROM public.delivery_regions dr
      WHERE dr.tenant_id = d.tenant_id
    ), '[]'::jsonb),
    'categories', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pc.id,
        'name', pc.name,
        'sortOrder', pc.sort_order,
        'active', pc.active
      ) ORDER BY pc.sort_order ASC, pc.name ASC)
      FROM public.product_categories pc
      WHERE pc.tenant_id = d.tenant_id
        AND pc.active = true
    ), '[]'::jsonb),
    'products', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'category', p.category,
        'unitPrice', p.unit_price,
        'countsAsXSalada', p.counts_as_x_salada,
        'imageUrl', coalesce(p.image_url, ''),
        'addonGroups', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', g.id,
            'name', g.name,
            'isRequired', g.is_required,
            'minSelect', g.min_select,
            'maxSelect', g.max_select,
            'active', g.active,
            'sortOrder', g.sort_order,
            'options', coalesce((
              SELECT jsonb_agg(jsonb_build_object(
                'id', ao.id,
                'groupId', ao.group_id,
                'name', ao.name,
                'price', ao.price,
                'active', ao.active,
                'sortOrder', ao.sort_order
              ) ORDER BY ao.sort_order ASC, ao.name ASC)
              FROM public.addon_options ao
              WHERE ao.tenant_id = d.tenant_id
                AND ao.group_id = g.id
                AND ao.active = true
            ), '[]'::jsonb)
          ) ORDER BY pag.sort_order ASC, g.sort_order ASC, g.name ASC)
          FROM public.product_addon_groups pag
          JOIN public.addon_groups g
            ON g.id = pag.group_id
           AND g.tenant_id = d.tenant_id
          WHERE pag.tenant_id = d.tenant_id
            AND pag.product_id = p.id
            AND g.active = true
            AND EXISTS (
              SELECT 1
              FROM public.addon_options ao2
              WHERE ao2.tenant_id = d.tenant_id
                AND ao2.group_id = g.id
                AND ao2.active = true
            )
        ), '[]'::jsonb)
      ) ORDER BY coalesce(pc.sort_order, 999999) ASC, p.name ASC)
      FROM public.products p
      LEFT JOIN public.product_categories pc
        ON pc.tenant_id = d.tenant_id
       AND lower(btrim(pc.name)) = lower(btrim(p.category))
      WHERE p.tenant_id = d.tenant_id
        AND p.active = true
        AND (pc.id IS NULL OR pc.active = true)
    ), '[]'::jsonb),
    'combos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'items', c.items,
        'salePrice', c.sale_price,
        'imageUrl', coalesce(c.image_url, '')
      ) ORDER BY c.name ASC)
      FROM public.combos c
      WHERE c.tenant_id = d.tenant_id
        AND c.active = true
    ), '[]'::jsonb)
  )
  FROM public.digital_menu_settings d
  JOIN public.tenants t ON t.id = d.tenant_id
  LEFT JOIN public.shop_settings ss ON ss.tenant_id = d.tenant_id
  WHERE d.slug = lower(btrim(coalesce(p_slug, '')))
    AND d.is_active = true
    AND public.is_tenant_billing_active(d.tenant_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_digital_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO anon, authenticated, service_role;

COMMIT;

-- ============================================================================
-- ROLLBACK MANUAL (NAO EXECUTADO AUTOMATICAMENTE)
-- Caso seja necessario reverter esta migration no futuro:
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.complete_tenant_onboarding(uuid, text, text, text);
--   -- Restaurar complete_tenant_onboarding(uuid, text, text),
--   -- get_public_digital_menu(text), provision_new_mgw_owner() e
--   -- guard_tenant_protected_fields() das migrations anteriores.
--   ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS chk_tenants_business_segment;
--   ALTER TABLE public.tenants DROP COLUMN IF EXISTS business_segment;
-- COMMIT;
-- ============================================================================
