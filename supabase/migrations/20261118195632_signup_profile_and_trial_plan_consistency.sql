-- Complete signup provisioning for the commercial SaaS schema.
-- New accounts receive the trial plan and a private user profile.
-- Existing tenant and business data are preserved.
BEGIN;

CREATE OR REPLACE FUNCTION public.provision_new_mgw_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_name text;
  v_slug_base text;
  v_slug text;
  v_tenant_id uuid;
  v_trial_days integer := 14;
  v_trial_amount integer;
BEGIN
  v_name := left(btrim(coalesce(NEW.raw_user_meta_data ->> 'shop_name', '')), 80);
  IF v_name = '' THEN
    v_name := 'Meu Estabelecimento';
  END IF;

  SELECT amount_cents INTO v_trial_amount
  FROM public.plans
  WHERE code = 'trial' AND active = true;

  IF v_trial_amount IS NULL THEN
    RAISE EXCEPTION 'Plano trial não está configurado.';
  END IF;

  v_slug_base := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);
  IF char_length(v_slug_base) < 2 THEN
    v_slug_base := 'loja';
  END IF;
  v_slug := left(v_slug_base, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.tenants (slug, name, status, billing_exempt)
  VALUES (v_slug, v_name, 'active', false)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, email, role, active)
  VALUES (v_tenant_id, NEW.id, lower(btrim(NEW.email)), 'owner', true);

  INSERT INTO public.subscriptions (
    tenant_id, plan_code, plan_amount_cents, currency, status,
    trial_ends_at, current_period_start, current_period_end
  )
  VALUES (
    v_tenant_id, 'trial', v_trial_amount, 'BRL', 'trialing',
    now() + make_interval(days => v_trial_days), now(),
    now() + make_interval(days => v_trial_days)
  );

  INSERT INTO public.shop_settings (tenant_id, owner_email, establishment_name, start_date)
  VALUES (v_tenant_id, lower(btrim(NEW.email)), v_name, current_date);

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
    lower(btrim(NEW.email)),
    left(btrim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), 120),
    v_tenant_id
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_new_mgw_owner() FROM PUBLIC, anon, authenticated;

-- Backfill profile rows for already-provisioned users without modifying tenant data.
INSERT INTO public.user_profiles (user_id, email, full_name, default_tenant_id)
SELECT DISTINCT ON (tm.user_id)
  tm.user_id,
  lower(btrim(u.email)),
  left(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 120),
  tm.tenant_id
FROM public.tenant_members tm
JOIN auth.users u ON u.id = tm.user_id
WHERE tm.active = true
  AND tm.user_id IS NOT NULL
  AND u.email IS NOT NULL
ORDER BY tm.user_id, tm.created_at ASC
ON CONFLICT (user_id) DO UPDATE
SET
  email = EXCLUDED.email,
  full_name = CASE WHEN public.user_profiles.full_name = '' THEN EXCLUDED.full_name ELSE public.user_profiles.full_name END,
  default_tenant_id = COALESCE(public.user_profiles.default_tenant_id, EXCLUDED.default_tenant_id),
  updated_at = now();

COMMIT;
