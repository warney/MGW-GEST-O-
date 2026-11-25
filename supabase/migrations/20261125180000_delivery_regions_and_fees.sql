-- MGW DELIVERY — ETAPA 5: GERENCIAMENTO DE REGIÕES E TAXAS DE ENTREGA
-- Cria tabelas delivery_regions e delivery_pricing_settings com isolamento multi-tenant e RLS estrito,
-- adiciona snapshots imutaveis de entrega em online_orders e atualiza as RPCs publicas do Cardapio Digital
-- para validacao autoritativa de cobertura, horarios, pedido minimo e frete gratis no servidor.

BEGIN;

-- 1) Funcao pura de normalizacao geografica (sem depender de extensoes externas)
CREATE OR REPLACE FUNCTION public.normalize_delivery_geo_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
    regexp_replace(
      lower(
        translate(
          coalesce(p_value, ''),
          'áàâãäéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
          'aaaaaeeeeiiiiooooouuuucnyyAAAAAEEEEIIIIOOOOOUUUUCNY'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

-- 2) Tabela de regioes / bairros atendidos por estabelecimento
CREATE TABLE IF NOT EXISTS public.delivery_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) >= 2 AND length(name) <= 100),
  city text NOT NULL CHECK (length(btrim(city)) >= 2 AND length(city) <= 100),
  normalized_city text NOT NULL DEFAULT '',
  neighborhoods text[] NOT NULL DEFAULT ARRAY[]::text[],
  normalized_neighborhoods text[] NOT NULL DEFAULT ARRAY[]::text[],
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 300),
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0 AND delivery_fee <= 99999),
  minimum_order_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_order_amount >= 0 AND minimum_order_amount <= 999999),
  estimated_time text NOT NULL DEFAULT '' CHECK (length(estimated_time) <= 60),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_temporarily_suspended boolean NOT NULL DEFAULT false,
  suspension_reason text NOT NULL DEFAULT '' CHECK (length(suspension_reason) <= 300),
  schedule_enabled boolean NOT NULL DEFAULT false,
  schedule_days smallint[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::smallint[],
  schedule_start text NOT NULL DEFAULT '00:00' CHECK (schedule_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  schedule_end text NOT NULL DEFAULT '23:59' CHECK (schedule_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_delivery_regions_neighborhoods_non_empty CHECK (coalesce(array_length(neighborhoods, 1), 0) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_delivery_regions_tenant_status
  ON public.delivery_regions (tenant_id, status, city, name);

CREATE INDEX IF NOT EXISTS idx_delivery_regions_norm_neighborhoods
  ON public.delivery_regions USING GIN (normalized_neighborhoods);

-- Trigger de validacao, normalizacao e bloqueio de bairros duplicados no mesmo municipio/tenant
CREATE OR REPLACE FUNCTION public.validate_delivery_region_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_raw text;
  v_clean text;
  v_norm text;
  v_clean_list text[] := ARRAY[]::text[];
  v_norm_list text[] := ARRAY[]::text[];
  v_conflict_region text;
BEGIN
  NEW.name := left(btrim(regexp_replace(coalesce(NEW.name, ''), '\s+', ' ', 'g')), 100);
  IF length(NEW.name) < 2 THEN
    RAISE EXCEPTION 'Informe um nome válido para a região de entrega.';
  END IF;

  NEW.city := left(btrim(regexp_replace(coalesce(NEW.city, ''), '\s+', ' ', 'g')), 100);
  IF length(NEW.city) < 2 THEN
    RAISE EXCEPTION 'Informe o município da região de entrega.';
  END IF;
  NEW.normalized_city := public.normalize_delivery_geo_text(NEW.city);

  FOREACH v_raw IN ARRAY coalesce(NEW.neighborhoods, ARRAY[]::text[]) LOOP
    v_clean := left(btrim(regexp_replace(coalesce(v_raw, ''), '\s+', ' ', 'g')), 100);
    v_norm := public.normalize_delivery_geo_text(v_clean);
    IF length(v_clean) >= 2 AND length(v_norm) >= 2 THEN
      IF NOT (v_norm = ANY(v_norm_list)) THEN
        v_clean_list := array_append(v_clean_list, v_clean);
        v_norm_list := array_append(v_norm_list, v_norm);
      END IF;
    END IF;
  END LOOP;

  IF coalesce(array_length(v_clean_list, 1), 0) < 1 THEN
    RAISE EXCEPTION 'Informe ao menos um bairro válido para a região.';
  END IF;

  NEW.neighborhoods := v_clean_list;
  NEW.normalized_neighborhoods := v_norm_list;
  NEW.description := left(btrim(coalesce(NEW.description, '')), 300);
  NEW.delivery_fee := round(greatest(0, coalesce(NEW.delivery_fee, 0)), 2);
  NEW.minimum_order_amount := round(greatest(0, coalesce(NEW.minimum_order_amount, 0)), 2);
  NEW.estimated_time := left(btrim(coalesce(NEW.estimated_time, '')), 60);
  NEW.status := CASE WHEN NEW.status = 'inactive' THEN 'inactive' ELSE 'active' END;
  NEW.is_temporarily_suspended := coalesce(NEW.is_temporarily_suspended, false);
  NEW.suspension_reason := CASE
    WHEN NEW.is_temporarily_suspended THEN left(btrim(coalesce(NEW.suspension_reason, '')), 300)
    ELSE ''
  END;
  NEW.schedule_enabled := coalesce(NEW.schedule_enabled, false);
  NEW.schedule_days := CASE
    WHEN NEW.schedule_days IS NULL OR coalesce(array_length(NEW.schedule_days, 1), 0) = 0
      THEN ARRAY[0,1,2,3,4,5,6]::smallint[]
    ELSE (
      SELECT coalesce(array_agg(DISTINCT d ORDER BY d), ARRAY[0,1,2,3,4,5,6]::smallint[])
      FROM unnest(NEW.schedule_days) AS d
      WHERE d BETWEEN 0 AND 6
    )
  END;
  NEW.schedule_start := CASE
    WHEN NEW.schedule_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN NEW.schedule_start
    ELSE '00:00'
  END;
  NEW.schedule_end := CASE
    WHEN NEW.schedule_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN NEW.schedule_end
    ELSE '23:59'
  END;
  NEW.notes := left(btrim(coalesce(NEW.notes, '')), 1000);

  SELECT dr.name INTO v_conflict_region
  FROM public.delivery_regions dr
  WHERE dr.tenant_id = NEW.tenant_id
    AND dr.id <> NEW.id
    AND dr.normalized_city = NEW.normalized_city
    AND dr.normalized_neighborhoods && NEW.normalized_neighborhoods
  LIMIT 1;

  IF v_conflict_region IS NOT NULL THEN
    RAISE EXCEPTION 'Um ou mais bairros informados já pertencem à região "%" neste município.', v_conflict_region;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_delivery_region_before_write ON public.delivery_regions;
CREATE TRIGGER trg_validate_delivery_region_before_write
  BEFORE INSERT OR UPDATE ON public.delivery_regions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_delivery_region_before_write();

DROP TRIGGER IF EXISTS trg_delivery_regions_updated_at ON public.delivery_regions;
CREATE TRIGGER trg_delivery_regions_updated_at
  BEFORE UPDATE ON public.delivery_regions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_prevent_tenant_id_change_delivery_regions ON public.delivery_regions;
CREATE TRIGGER trg_prevent_tenant_id_change_delivery_regions
  BEFORE UPDATE ON public.delivery_regions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_id_change();

-- 3) Tabela de configuracoes gerais de precificacao de entrega por estabelecimento
CREATE TABLE IF NOT EXISTS public.delivery_pricing_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  pricing_mode text NOT NULL DEFAULT 'by_neighborhood' CHECK (pricing_mode IN ('by_neighborhood', 'by_region', 'default_only')),
  default_fee_enabled boolean NOT NULL DEFAULT false,
  default_delivery_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_delivery_fee >= 0 AND default_delivery_fee <= 99999),
  default_minimum_order_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_minimum_order_amount >= 0 AND default_minimum_order_amount <= 999999),
  default_estimated_time text NOT NULL DEFAULT '' CHECK (length(default_estimated_time) <= 60),
  free_delivery_enabled boolean NOT NULL DEFAULT false,
  free_delivery_min_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (free_delivery_min_amount >= 0 AND free_delivery_min_amount <= 999999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_delivery_pricing_settings_updated_at ON public.delivery_pricing_settings;
CREATE TRIGGER trg_delivery_pricing_settings_updated_at
  BEFORE UPDATE ON public.delivery_pricing_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_prevent_tenant_id_change_delivery_pricing_settings ON public.delivery_pricing_settings;
CREATE TRIGGER trg_prevent_tenant_id_change_delivery_pricing_settings
  BEFORE UPDATE ON public.delivery_pricing_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_id_change();

-- 4) RLS estrito multi-tenant
ALTER TABLE public.delivery_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_pricing_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_regions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_regions TO authenticated;

REVOKE ALL ON TABLE public.delivery_pricing_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.delivery_pricing_settings TO authenticated;

DROP POLICY IF EXISTS delivery_regions_select_tenant ON public.delivery_regions;
CREATE POLICY delivery_regions_select_tenant
  ON public.delivery_regions
  FOR SELECT TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS delivery_regions_insert_tenant ON public.delivery_regions;
CREATE POLICY delivery_regions_insert_tenant
  ON public.delivery_regions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_regions_update_tenant ON public.delivery_regions;
CREATE POLICY delivery_regions_update_tenant
  ON public.delivery_regions
  FOR UPDATE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_regions_delete_tenant ON public.delivery_regions;
CREATE POLICY delivery_regions_delete_tenant
  ON public.delivery_regions
  FOR DELETE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_pricing_settings_select_tenant ON public.delivery_pricing_settings;
CREATE POLICY delivery_pricing_settings_select_tenant
  ON public.delivery_pricing_settings
  FOR SELECT TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS delivery_pricing_settings_insert_tenant ON public.delivery_pricing_settings;
CREATE POLICY delivery_pricing_settings_insert_tenant
  ON public.delivery_pricing_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_pricing_settings_update_tenant ON public.delivery_pricing_settings;
CREATE POLICY delivery_pricing_settings_update_tenant
  ON public.delivery_pricing_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

-- 5) Snapshots imutaveis de entrega e regra de cobranca em online_orders
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS delivery_region_id uuid REFERENCES public.delivery_regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_region_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_neighborhood text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_base_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_rule text NOT NULL DEFAULT 'store_default',
  ADD COLUMN IF NOT EXISTS delivery_minimum_order_applied numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_free_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_free_threshold_applied numeric(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_online_orders_tenant_delivery_region
  ON public.online_orders (tenant_id, delivery_region_id)
  WHERE delivery_region_id IS NOT NULL;

-- 6) Funcao auxiliar de avaliacao de horario de funcionamento da regiao no fuso da loja
CREATE OR REPLACE FUNCTION public.is_delivery_region_open_now(
  p_schedule_enabled boolean,
  p_schedule_days smallint[],
  p_schedule_start text,
  p_schedule_end text,
  p_timezone text DEFAULT 'America/Manaus'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tz text := 'America/Manaus';
  v_local_now timestamp;
  v_today smallint;
  v_yesterday smallint;
  v_now_min integer;
  v_start_min integer;
  v_end_min integer;
  v_days smallint[];
BEGIN
  IF NOT coalesce(p_schedule_enabled, false) THEN
    RETURN true;
  END IF;

  IF p_timezone IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = btrim(p_timezone)
  ) THEN
    v_tz := btrim(p_timezone);
  END IF;

  v_local_now := now() AT TIME ZONE v_tz;
  v_today := EXTRACT(DOW FROM v_local_now)::smallint;
  v_yesterday := ((v_today + 6) % 7)::smallint;
  v_now_min := (EXTRACT(HOUR FROM v_local_now)::integer * 60) + EXTRACT(MINUTE FROM v_local_now)::integer;

  v_start_min := (split_part(coalesce(p_schedule_start, '00:00'), ':', 1)::integer * 60)
               + split_part(coalesce(p_schedule_start, '00:00'), ':', 2)::integer;
  v_end_min := (split_part(coalesce(p_schedule_end, '23:59'), ':', 1)::integer * 60)
             + split_part(coalesce(p_schedule_end, '23:59'), ':', 2)::integer;

  v_days := coalesce(p_schedule_days, ARRAY[0,1,2,3,4,5,6]::smallint[]);

  IF v_end_min >= v_start_min THEN
    RETURN (v_today = ANY(v_days)) AND v_now_min >= v_start_min AND v_now_min <= v_end_min;
  END IF;

  -- Janela noturna que cruza a meia-noite (ex: 18:00 as 02:00)
  RETURN ((v_today = ANY(v_days)) AND v_now_min >= v_start_min)
      OR ((v_yesterday = ANY(v_days)) AND v_now_min <= v_end_min);
END;
$$;

-- 7) Atualiza get_public_digital_menu incluindo deliveryPricing, deliveryRegions e timezone da loja
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
      'timezone', coalesce(nullif(btrim(ss.timezone), ''), 'America/Manaus')
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
  LEFT JOIN public.shop_settings ss ON ss.tenant_id = d.tenant_id
  WHERE d.slug = lower(btrim(coalesce(p_slug, '')))
    AND d.is_active = true
    AND public.is_tenant_billing_active(d.tenant_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_digital_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO anon, authenticated, service_role;

-- 8) Substitui create_public_online_order preservando addons + auto-cadastro de clientes + calculo autoritativo de regiao/taxa
DROP FUNCTION IF EXISTS public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb);

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
  p_items jsonb,
  p_delivery_neighborhood text DEFAULT '',
  p_delivery_city text DEFAULT '',
  p_delivery_region_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_menu public.digital_menu_settings%ROWTYPE;
  v_pricing public.delivery_pricing_settings%ROWTYPE;
  v_has_pricing boolean := false;
  v_has_regions boolean := false;
  v_region public.delivery_regions%ROWTYPE;
  v_has_region boolean := false;
  v_tz text := 'America/Manaus';
  v_configured_tz text;
  v_norm_neighborhood text := public.normalize_delivery_geo_text(p_delivery_neighborhood);
  v_norm_city text := public.normalize_delivery_geo_text(p_delivery_city);
  v_norm_address text := public.normalize_delivery_geo_text(p_delivery_address);
  v_clean_neighborhood text := left(btrim(coalesce(p_delivery_neighborhood, '')), 100);
  v_clean_city text := left(btrim(coalesce(p_delivery_city, '')), 100);
  v_order_id uuid := gen_random_uuid();
  v_customer_id uuid;
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
  v_product_category text;
  v_unit_price numeric(12,2);
  v_addon_unit_total numeric(12,2);
  v_unit_cost numeric(12,2) := 0;
  v_xsaladas integer;
  v_product_counts boolean;
  v_components jsonb;
  v_raw_addons jsonb;
  v_selected_addons_snapshot jsonb;
  v_sel jsonb;
  v_sel_group_id uuid;
  v_seen_group_ids uuid[];
  v_group_rec record;
  v_matched_sel jsonb;
  v_raw_option_ids jsonb;
  v_opt_el jsonb;
  v_opt_id uuid;
  v_group_opt_ids uuid[];
  v_selected_count integer;
  v_group_options_snapshot jsonb;
  v_group_addon_sum numeric(12,2);
  v_pending_items jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_base_fee numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_minimum_order numeric(12,2) := 0;
  v_free_enabled boolean := false;
  v_free_threshold numeric(12,2) := 0;
  v_free_applied boolean := false;
  v_fee_rule text := 'store_default';
  v_region_id_snapshot uuid := NULL;
  v_region_name_snapshot text := '';
  v_total numeric(12,2);
  v_item_count integer := 0;
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

  SELECT ss.timezone INTO v_configured_tz
  FROM public.shop_settings ss
  WHERE ss.tenant_id = v_menu.tenant_id;
  IF v_configured_tz IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = btrim(v_configured_tz)
  ) THEN
    v_tz := btrim(v_configured_tz);
  END IF;

  SELECT * INTO v_pricing
  FROM public.delivery_pricing_settings dps
  WHERE dps.tenant_id = v_menu.tenant_id;
  v_has_pricing := FOUND;

  SELECT EXISTS (
    SELECT 1 FROM public.delivery_regions dr WHERE dr.tenant_id = v_menu.tenant_id
  ) INTO v_has_regions;

  -- Calculo dos itens do carrinho (100% autoritativo no servidor)
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_kind := coalesce(v_item->>'kind','');
    v_qty := greatest(0, least(30, coalesce((v_item->>'quantity')::integer,0)));
    v_note := left(btrim(coalesce(v_item->>'note','')),160);
    v_selected_addons_snapshot := '[]'::jsonb;
    v_addon_unit_total := 0;
    v_unit_cost := 0;

    IF v_qty < 1 THEN RAISE EXCEPTION 'Quantidade de item invalida.'; END IF;
    BEGIN v_ref := (v_item->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Item do carrinho invalido.'; END;

    IF v_kind = 'product' THEN
      SELECT name, category, unit_price, counts_as_x_salada
      INTO v_name, v_product_category, v_unit_price, v_product_counts
      FROM public.products
      WHERE id = v_ref AND tenant_id = v_menu.tenant_id AND active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Um produto do carrinho nao esta mais disponivel.'; END IF;

      IF EXISTS (
        SELECT 1
        FROM public.product_categories pc
        WHERE pc.tenant_id = v_menu.tenant_id
          AND lower(btrim(pc.name)) = lower(btrim(v_product_category))
          AND pc.active = false
      ) THEN
        RAISE EXCEPTION 'A categoria do produto "%" esta temporariamente indisponivel.', v_name;
      END IF;

      v_raw_addons := coalesce(v_item->'selectedAddons', '[]'::jsonb);
      IF jsonb_typeof(v_raw_addons) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Selecao de adicionais invalida para "%".', v_name;
      END IF;

      v_seen_group_ids := ARRAY[]::uuid[];
      FOR v_sel IN SELECT value FROM jsonb_array_elements(v_raw_addons) LOOP
        IF jsonb_typeof(v_sel) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Formato de adicional invalido para "%".', v_name;
        END IF;

        BEGIN
          v_sel_group_id := (v_sel->>'groupId')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Grupo de adicionais invalido para "%".', v_name;
        END;

        IF v_sel_group_id = ANY(v_seen_group_ids) THEN
          RAISE EXCEPTION 'Grupo de adicionais duplicado em "%".', v_name;
        END IF;
        v_seen_group_ids := array_append(v_seen_group_ids, v_sel_group_id);

        IF jsonb_typeof(coalesce(v_sel->'optionIds', '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Lista de opcoes invalida para "%".', v_name;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM public.product_addon_groups pag
          JOIN public.addon_groups g
            ON g.id = pag.group_id
           AND g.tenant_id = v_menu.tenant_id
          WHERE pag.tenant_id = v_menu.tenant_id
            AND pag.product_id = v_ref
            AND pag.group_id = v_sel_group_id
            AND g.active = true
            AND EXISTS (
              SELECT 1 FROM public.addon_options ao
              WHERE ao.tenant_id = v_menu.tenant_id
                AND ao.group_id = g.id
                AND ao.active = true
            )
        ) THEN
          RAISE EXCEPTION 'Adicional nao vinculado ou indisponivel para "%".', v_name;
        END IF;
      END LOOP;

      FOR v_group_rec IN
        SELECT g.id, g.name, g.is_required, g.min_select, g.max_select
        FROM public.product_addon_groups pag
        JOIN public.addon_groups g
          ON g.id = pag.group_id
         AND g.tenant_id = v_menu.tenant_id
        WHERE pag.tenant_id = v_menu.tenant_id
          AND pag.product_id = v_ref
          AND g.active = true
          AND EXISTS (
            SELECT 1 FROM public.addon_options ao
            WHERE ao.tenant_id = v_menu.tenant_id
              AND ao.group_id = g.id
              AND ao.active = true
          )
        ORDER BY pag.sort_order ASC, g.sort_order ASC, g.name ASC
      LOOP
        v_matched_sel := NULL;
        FOR v_sel IN SELECT value FROM jsonb_array_elements(v_raw_addons) LOOP
          IF (v_sel->>'groupId')::uuid = v_group_rec.id THEN
            v_matched_sel := v_sel;
            EXIT;
          END IF;
        END LOOP;

        v_raw_option_ids := CASE
          WHEN v_matched_sel IS NULL THEN '[]'::jsonb
          ELSE coalesce(v_matched_sel->'optionIds', '[]'::jsonb)
        END;

        IF jsonb_typeof(v_raw_option_ids) IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Opcoes invalidas para "%".', v_group_rec.name;
        END IF;

        v_group_opt_ids := ARRAY[]::uuid[];
        FOR v_opt_el IN SELECT value FROM jsonb_array_elements(v_raw_option_ids) LOOP
          IF jsonb_typeof(v_opt_el) IS DISTINCT FROM 'string' THEN
            RAISE EXCEPTION 'Opcao de adicional invalida em "%".', v_group_rec.name;
          END IF;
          BEGIN
            v_opt_id := (v_opt_el #>> '{}')::uuid;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Identificador de adicional invalido em "%".', v_group_rec.name;
          END;
          IF v_opt_id = ANY(v_group_opt_ids) THEN
            RAISE EXCEPTION 'Opcao repetida em "%".', v_group_rec.name;
          END IF;
          IF NOT EXISTS (
            SELECT 1
            FROM public.addon_options ao
            WHERE ao.id = v_opt_id
              AND ao.tenant_id = v_menu.tenant_id
              AND ao.group_id = v_group_rec.id
              AND ao.active = true
          ) THEN
            RAISE EXCEPTION 'Uma opcao selecionada em "%" nao esta mais disponivel.', v_group_rec.name;
          END IF;
          v_group_opt_ids := array_append(v_group_opt_ids, v_opt_id);
        END LOOP;

        v_selected_count := coalesce(array_length(v_group_opt_ids, 1), 0);
        IF v_selected_count > v_group_rec.max_select THEN
          RAISE EXCEPTION 'Escolha no maximo % opcoes em "%".', v_group_rec.max_select, v_group_rec.name;
        END IF;
        IF v_group_rec.is_required AND v_selected_count < greatest(1, v_group_rec.min_select) THEN
          RAISE EXCEPTION 'Selecione ao menos % opcoes em "%".', greatest(1, v_group_rec.min_select), v_group_rec.name;
        END IF;
        IF NOT v_group_rec.is_required AND v_selected_count > 0 AND v_selected_count < v_group_rec.min_select THEN
          RAISE EXCEPTION 'Selecione ao menos % opcoes em "%".', v_group_rec.min_select, v_group_rec.name;
        END IF;

        IF v_selected_count > 0 THEN
          SELECT
            coalesce(sum(ao.price), 0)::numeric(12,2),
            coalesce(jsonb_agg(jsonb_build_object(
              'id', ao.id,
              'name', ao.name,
              'price', ao.price
            ) ORDER BY ao.sort_order ASC, ao.name ASC), '[]'::jsonb)
          INTO v_group_addon_sum, v_group_options_snapshot
          FROM public.addon_options ao
          WHERE ao.tenant_id = v_menu.tenant_id
            AND ao.group_id = v_group_rec.id
            AND ao.active = true
            AND ao.id = ANY(v_group_opt_ids);

          v_addon_unit_total := v_addon_unit_total + v_group_addon_sum;
          v_selected_addons_snapshot := v_selected_addons_snapshot || jsonb_build_array(
            jsonb_build_object(
              'groupId', v_group_rec.id,
              'groupName', v_group_rec.name,
              'options', v_group_options_snapshot
            )
          );
        END IF;
      END LOOP;

      v_unit_price := round(v_unit_price + v_addon_unit_total, 2);
      v_xsaladas := CASE WHEN v_product_counts THEN 1 ELSE 0 END;
      v_components := jsonb_build_array(jsonb_build_object(
        'productId',v_ref::text,'productName',v_name,'quantityPerUnit',1,
        'totalQuantity',v_qty,'countsAsXSalada',(v_xsaladas > 0)
      ));
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
    ELSE
      RAISE EXCEPTION 'Tipo de item invalido.';
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
    v_item_count := v_item_count + v_qty;
    v_order_item_id := gen_random_uuid();
    v_pending_items := v_pending_items || jsonb_build_array(jsonb_build_object(
      'id',v_order_item_id,'kind',v_kind,'refId',v_ref,'name',v_name,
      'quantity',v_qty,'unitPrice',v_unit_price,'lineTotal',round(v_unit_price*v_qty, 2),
      'estimatedUnitCost',v_unit_cost,'xSaladasPerUnit',v_xsaladas,
      'components',v_components,'selectedAddons',v_selected_addons_snapshot,'note',v_note
    ));
  END LOOP;

  v_free_enabled := CASE WHEN v_has_pricing THEN v_pricing.free_delivery_enabled ELSE false END;
  v_free_threshold := CASE WHEN v_has_pricing THEN v_pricing.free_delivery_min_amount ELSE 0 END;

  -- Resolucao autoritativa de taxa, cobertura, horario, pedido minimo e frete gratis
  IF p_fulfillment_type = 'pickup' THEN
    v_base_fee := 0;
    v_delivery_fee := 0;
    v_fee_rule := 'pickup';
    v_minimum_order := greatest(
      coalesce(v_menu.minimum_order_amount, 0),
      CASE WHEN v_has_pricing THEN coalesce(v_pricing.default_minimum_order_amount, 0) ELSE 0 END
    );
    v_clean_neighborhood := '';
    v_clean_city := '';
  ELSE
    -- Se houver regioes cadastradas (ou modo diferente de default_only), tenta localizar a regiao correspondente
    IF v_has_regions AND (NOT v_has_pricing OR v_pricing.pricing_mode <> 'default_only') THEN
      -- 1) Match por bairro explicitamente informado (+ municipio quando informado)
      IF v_norm_neighborhood <> '' THEN
        SELECT dr.* INTO v_region
        FROM public.delivery_regions dr
        WHERE dr.tenant_id = v_menu.tenant_id
          AND v_norm_neighborhood = ANY(dr.normalized_neighborhoods)
          AND (v_norm_city = '' OR dr.normalized_city = v_norm_city)
        ORDER BY CASE WHEN dr.status = 'active' THEN 0 ELSE 1 END, dr.created_at ASC
        LIMIT 1;
        v_has_region := FOUND;
      END IF;

      -- 2) Match por id de regiao informado (somente se bairro nao foi informado ou pertencer a regiao)
      IF NOT v_has_region AND p_delivery_region_id IS NOT NULL THEN
        SELECT dr.* INTO v_region
        FROM public.delivery_regions dr
        WHERE dr.tenant_id = v_menu.tenant_id
          AND dr.id = p_delivery_region_id
          AND (v_norm_neighborhood = '' OR v_norm_neighborhood = ANY(dr.normalized_neighborhoods))
        LIMIT 1;
        v_has_region := FOUND;
      END IF;

      -- 3) Fallback: detectar bairro dentro do texto do endereco informado
      IF NOT v_has_region AND v_norm_address <> '' THEN
        SELECT dr.* INTO v_region
        FROM public.delivery_regions dr,
             unnest(dr.normalized_neighborhoods) WITH ORDINALITY AS n(val, ord)
        WHERE dr.tenant_id = v_menu.tenant_id
          AND (v_norm_city = '' OR dr.normalized_city = v_norm_city)
          AND position(n.val IN v_norm_address) > 0
        ORDER BY length(n.val) DESC, CASE WHEN dr.status = 'active' THEN 0 ELSE 1 END
        LIMIT 1;
        v_has_region := FOUND;
      END IF;

      IF v_has_region THEN
        IF v_region.status <> 'active' THEN
          RAISE EXCEPTION 'Atendimento temporariamente indisponivel para a regiao "%".', v_region.name;
        END IF;
        IF v_region.is_temporarily_suspended THEN
          RAISE EXCEPTION 'Entregas temporariamente suspensas para "%": %',
            v_region.name,
            coalesce(nullif(v_region.suspension_reason, ''), 'tente retirada no balcao.');
        END IF;
        IF NOT public.is_delivery_region_open_now(
          v_region.schedule_enabled,
          v_region.schedule_days,
          v_region.schedule_start,
          v_region.schedule_end,
          v_tz
        ) THEN
          RAISE EXCEPTION 'Entregas para "%" funcionam somente entre % e %.',
            v_region.name, v_region.schedule_start, v_region.schedule_end;
        END IF;

        v_region_id_snapshot := v_region.id;
        v_region_name_snapshot := v_region.name;
        IF v_clean_city = '' THEN v_clean_city := v_region.city; END IF;
        IF v_clean_neighborhood = '' AND coalesce(array_length(v_region.neighborhoods, 1), 0) = 1 THEN
          v_clean_neighborhood := v_region.neighborhoods[1];
        END IF;

        v_base_fee := v_region.delivery_fee;
        v_minimum_order := CASE
          WHEN v_region.minimum_order_amount > 0 THEN v_region.minimum_order_amount
          WHEN v_has_pricing AND v_pricing.default_minimum_order_amount > 0 THEN v_pricing.default_minimum_order_amount
          ELSE coalesce(v_menu.minimum_order_amount, 0)
        END;
        v_fee_rule := CASE
          WHEN v_has_pricing AND v_pricing.pricing_mode = 'by_region' THEN 'region'
          ELSE 'neighborhood'
        END;
      ELSE
        -- Bairro fora das regioes cadastradas: so permite taxa padrao se o estabelecimento habilitou explicitamente
        IF v_has_pricing AND v_pricing.default_fee_enabled THEN
          v_base_fee := v_pricing.default_delivery_fee;
          v_minimum_order := CASE
            WHEN v_pricing.default_minimum_order_amount > 0 THEN v_pricing.default_minimum_order_amount
            ELSE coalesce(v_menu.minimum_order_amount, 0)
          END;
          v_fee_rule := 'default_fallback';
          v_region_name_snapshot := CASE WHEN v_clean_neighborhood <> '' THEN v_clean_neighborhood ELSE 'Taxa padrão' END;
        ELSE
          RAISE EXCEPTION 'Nao realizamos entregas para o bairro ou endereco informado. Selecione um bairro atendido ou escolha retirada no local.';
        END IF;
      END IF;
    ELSE
      -- Estabelecimento ainda sem regioes configuradas ou operando explicitamente no modo taxa padrao unica
      IF v_has_pricing THEN
        v_base_fee := v_pricing.default_delivery_fee;
        v_minimum_order := CASE
          WHEN v_pricing.default_minimum_order_amount > 0 THEN v_pricing.default_minimum_order_amount
          ELSE coalesce(v_menu.minimum_order_amount, 0)
        END;
        v_fee_rule := 'store_default';
      ELSE
        v_base_fee := coalesce(v_menu.delivery_fee, 0);
        v_minimum_order := coalesce(v_menu.minimum_order_amount, 0);
        v_fee_rule := 'store_default';
      END IF;
    END IF;

    IF v_free_enabled AND v_free_threshold > 0 AND v_subtotal >= v_free_threshold THEN
      v_delivery_fee := 0;
      v_free_applied := true;
    ELSE
      v_delivery_fee := v_base_fee;
      v_free_applied := false;
    END IF;
  END IF;

  IF v_subtotal < v_minimum_order THEN
    RAISE EXCEPTION 'Pedido minimo de R$ % nao atingido para esta entrega.', to_char(v_minimum_order,'FM999999990D00');
  END IF;

  v_total := round(v_subtotal + v_delivery_fee, 2);
  v_change_for := CASE WHEN p_payment_method = 'Dinheiro' AND coalesce(p_change_for,0) > 0 THEN p_change_for ELSE NULL END;
  IF v_change_for IS NOT NULL AND v_change_for < v_total THEN RAISE EXCEPTION 'O troco precisa ser maior ou igual ao total do pedido.'; END IF;

  -- Identificacao / criacao atomica do cliente no tenant antes de gravar o pedido
  v_customer_id := public.upsert_delivery_customer_from_order(
    v_menu.tenant_id,
    p_customer_name,
    p_customer_phone,
    p_fulfillment_type,
    p_delivery_address,
    p_delivery_reference
  );

  INSERT INTO public.online_order_counters(tenant_id,last_number)
  VALUES (v_menu.tenant_id,1)
  ON CONFLICT (tenant_id) DO UPDATE SET last_number = public.online_order_counters.last_number + 1
  RETURNING last_number INTO v_order_number;

  v_order_code := lpad((v_order_number % 100000)::text,5,'0');
  v_token_hash := encode(digest(v_token,'sha256'),'hex');

  INSERT INTO public.online_orders (
    id,tenant_id,customer_id,order_number,order_code,tracking_token_hash,menu_slug,status,
    fulfillment_type,customer_name,customer_phone,delivery_address,delivery_reference,
    payment_method,change_for,customer_note,subtotal_amount,delivery_fee,total_amount,
    delivery_region_id,delivery_region_name,delivery_neighborhood,delivery_city,
    delivery_base_fee,delivery_fee_rule,delivery_minimum_order_applied,
    delivery_free_applied,delivery_free_threshold_applied
  ) VALUES (
    v_order_id,v_menu.tenant_id,v_customer_id,v_order_number,v_order_code,v_token_hash,v_menu.slug,'received',
    p_fulfillment_type,left(btrim(p_customer_name),120),
    left(regexp_replace(p_customer_phone,'[^0-9+]','','g'),32),
    CASE WHEN p_fulfillment_type='delivery' THEN left(btrim(p_delivery_address),280) ELSE '' END,
    CASE WHEN p_fulfillment_type='delivery' THEN left(btrim(coalesce(p_delivery_reference,'')),160) ELSE '' END,
    p_payment_method,v_change_for,left(btrim(coalesce(p_customer_note,'')),300),
    v_subtotal,v_delivery_fee,v_total,
    v_region_id_snapshot,
    left(v_region_name_snapshot, 100),
    left(v_clean_neighborhood, 100),
    left(v_clean_city, 100),
    v_base_fee,
    v_fee_rule,
    v_minimum_order,
    v_free_applied,
    v_free_threshold
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_pending_items) LOOP
    INSERT INTO public.online_order_items (
      id,order_id,tenant_id,item_kind,ref_id,item_name,quantity,unit_price,
      line_total,estimated_unit_cost,x_saladas_per_unit,components,selected_addons,item_note
    ) VALUES (
      (v_item->>'id')::uuid,v_order_id,v_menu.tenant_id,v_item->>'kind',
      (v_item->>'refId')::uuid,v_item->>'name',(v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric,(v_item->>'lineTotal')::numeric,
      (v_item->>'estimatedUnitCost')::numeric,(v_item->>'xSaladasPerUnit')::integer,
      v_item->'components',coalesce(v_item->'selectedAddons','[]'::jsonb),v_item->>'note'
    );
  END LOOP;

  INSERT INTO public.online_order_status_history(order_id,tenant_id,from_status,to_status,reason,actor_type)
  VALUES (v_order_id,v_menu.tenant_id,NULL,'received','Pedido enviado pelo cardapio digital.','customer');

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'customerId', v_customer_id,
    'orderNumber', v_order_number,
    'orderCode', v_order_code,
    'trackingToken', v_token,
    'status', 'received',
    'subtotalAmount', v_subtotal,
    'deliveryFee', v_delivery_fee,
    'totalAmount', v_total,
    'deliveryRegionName', v_region_name_snapshot,
    'deliveryNeighborhood', v_clean_neighborhood,
    'deliveryCity', v_clean_city,
    'deliveryFeeRule', v_fee_rule,
    'deliveryFreeApplied', v_free_applied
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb,text,text,uuid) TO anon, authenticated, service_role;

-- 9) Atualiza get_public_order_by_token expondo snapshot da regiao/bairro/taxa aplicada
CREATE OR REPLACE FUNCTION public.get_public_order_by_token(p_tracking_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT jsonb_build_object(
    'found', true,
    'order', jsonb_build_object(
      'orderId', o.id,
      'orderNumber', o.order_number,
      'orderCode', o.order_code,
      'status', o.status,
      'fulfillmentType', o.fulfillment_type,
      'customerName', o.customer_name,
      'deliveryAddress', o.delivery_address,
      'deliveryReference', o.delivery_reference,
      'deliveryRegionName', coalesce(o.delivery_region_name, ''),
      'deliveryNeighborhood', coalesce(o.delivery_neighborhood, ''),
      'deliveryCity', coalesce(o.delivery_city, ''),
      'deliveryBaseFee', coalesce(o.delivery_base_fee, o.delivery_fee),
      'deliveryFeeRule', coalesce(o.delivery_fee_rule, 'store_default'),
      'deliveryMinimumOrderApplied', coalesce(o.delivery_minimum_order_applied, 0),
      'deliveryFreeApplied', coalesce(o.delivery_free_applied, false),
      'deliveryFreeThresholdApplied', coalesce(o.delivery_free_threshold_applied, 0),
      'paymentMethod', o.payment_method,
      'changeFor', o.change_for,
      'customerNote', o.customer_note,
      'subtotalAmount', o.subtotal_amount,
      'deliveryFee', o.delivery_fee,
      'totalAmount', o.total_amount,
      'rejectionReason', o.rejection_reason,
      'storeName', d.store_name,
      'storeSlug', d.slug,
      'storeWhatsapp', d.phone_whatsapp,
      'storeAddress', d.address,
      'storePixKey', d.pix_key,
      'createdAt', o.created_at,
      'updatedAt', o.updated_at,
      'items', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', i.id,
          'itemKind', i.item_kind,
          'refId', i.ref_id,
          'itemName', i.item_name,
          'quantity', i.quantity,
          'unitPrice', i.unit_price,
          'lineTotal', i.line_total,
          'selectedAddons', coalesce(i.selected_addons, '[]'::jsonb),
          'itemNote', i.item_note
        ) ORDER BY i.created_at)
        FROM public.online_order_items i
        WHERE i.order_id = o.id
      ), '[]'::jsonb),
      'statusHistory', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', h.id,
          'fromStatus', h.from_status,
          'toStatus', h.to_status,
          'reason', h.reason,
          'createdAt', h.created_at
        ) ORDER BY h.created_at)
        FROM public.online_order_status_history h
        WHERE h.order_id = o.id
      ), '[]'::jsonb)
    )
  )
  FROM public.online_orders o
  JOIN public.digital_menu_settings d ON d.tenant_id = o.tenant_id
  WHERE o.tracking_token_hash = encode(digest(coalesce(p_tracking_token, ''), 'sha256'), 'hex')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_order_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_by_token(text) TO anon, authenticated, service_role;

-- 10) Publicacao Realtime para delivery_regions e delivery_pricing_settings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_regions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_regions;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_pricing_settings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_pricing_settings;
    END IF;
  END IF;
END
$$;

COMMIT;
