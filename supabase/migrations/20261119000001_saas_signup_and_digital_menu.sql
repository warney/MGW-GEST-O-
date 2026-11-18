-- MGW Gestao: cadastro publico, provisionamento de tenant e cardapio Supabase.
-- Aplicar somente depois da migration inicial 20261114000001_initial_saas_schema.sql.
BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS chk_subscriptions_status;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT chk_subscriptions_status
  CHECK (status IN ('pending', 'trialing', 'authorized', 'paused', 'cancelled', 'exempt', 'free'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_path text;

ALTER TABLE public.combos
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_path text;

CREATE TABLE IF NOT EXISTS public.digital_menu_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  is_active boolean NOT NULL DEFAULT false,
  is_open boolean NOT NULL DEFAULT true,
  store_name text NOT NULL CHECK (char_length(btrim(store_name)) > 0),
  description text NOT NULL DEFAULT '',
  phone_whatsapp text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  opening_hours text NOT NULL DEFAULT '',
  pix_key text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  logo_path text NOT NULL DEFAULT '',
  banner_url text NOT NULL DEFAULT '',
  banner_path text NOT NULL DEFAULT '',
  delivery_fee numeric(12,2) NOT NULL DEFAULT 5 CHECK (delivery_fee >= 0),
  minimum_order_amount numeric(12,2) NOT NULL DEFAULT 15 CHECK (minimum_order_amount >= 0),
  accepts_delivery boolean NOT NULL DEFAULT true,
  accepts_pickup boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digital_menu_settings_active_slug
  ON public.digital_menu_settings (slug) WHERE is_active = true;

ALTER TABLE public.digital_menu_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS digital_menu_settings_member_select ON public.digital_menu_settings;
CREATE POLICY digital_menu_settings_member_select
  ON public.digital_menu_settings FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS digital_menu_settings_owner_insert ON public.digital_menu_settings;
CREATE POLICY digital_menu_settings_owner_insert
  ON public.digital_menu_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_owner(tenant_id));

DROP POLICY IF EXISTS digital_menu_settings_owner_update ON public.digital_menu_settings;
CREATE POLICY digital_menu_settings_owner_update
  ON public.digital_menu_settings FOR UPDATE TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

GRANT SELECT, INSERT, UPDATE ON public.digital_menu_settings TO authenticated;
REVOKE ALL ON public.digital_menu_settings FROM anon;

-- Cada novo usuário Supabase recebe um tenant próprio. O nome vem do formulário,
-- mas não concede privilégios: a identidade confiável é sempre NEW.id/auth.uid().
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
BEGIN
  v_name := left(btrim(coalesce(NEW.raw_user_meta_data ->> 'shop_name', '')), 80);
  IF v_name = '' THEN
    v_name := 'Meu Estabelecimento';
  END IF;

  v_slug_base := lower(regexp_replace(public.unaccent(v_name), '[^a-zA-Z0-9]+', '-', 'g'));
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

  INSERT INTO public.subscriptions (tenant_id, status, trial_ends_at, current_period_start, current_period_end)
  VALUES (v_tenant_id, 'trialing', now() + interval '14 days', now(), now() + interval '14 days');

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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_new_mgw_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_mgw_tenant ON auth.users;
CREATE TRIGGER on_auth_user_created_mgw_tenant
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_new_mgw_owner();

-- Leitura pública controlada: somente lojas publicadas e itens ativos.
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
  JOIN public.tenants t ON t.id = d.tenant_id
  WHERE d.slug = p_slug
    AND d.is_active = true
    AND t.status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_digital_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO anon, authenticated, service_role;

COMMIT;
