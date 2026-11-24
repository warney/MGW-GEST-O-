-- MGW DELIVERY — ETAPA 2: CADASTRO E GESTÃO DE CLIENTES
-- Multi-tenant customer directory, multiple addresses, configurable classification rules,
-- atomic checkout customer identification in create_public_online_order, and strict RLS.

-- 1) Funcao deterministica de normalizacao de telefone brasileiro (DDD + numero com prefixo 55)
CREATE OR REPLACE FUNCTION public.normalize_br_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN digits = '' THEN ''
    WHEN digits ~ '^55[0-9]{10,11}$' THEN digits
    WHEN length(digits) IN (10, 11) THEN '55' || digits
    ELSE digits
  END
  FROM (
    SELECT regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') AS digits
  ) s;
$$;

-- 2) Tabela de clientes do MGW Delivery por estabelecimento (tenant)
CREATE TABLE IF NOT EXISTS public.delivery_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) >= 2 AND length(name) <= 120),
  phone text NOT NULL CHECK (length(btrim(phone)) >= 8 AND length(phone) <= 32),
  normalized_phone text NOT NULL CHECK (length(normalized_phone) >= 8 AND length(normalized_phone) <= 20),
  email text NOT NULL DEFAULT '' CHECK (length(email) <= 160),
  cpf text NOT NULL DEFAULT '' CHECK (length(cpf) <= 20),
  birth_date date NULL,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery_customers_tenant_phone
  ON public.delivery_customers (tenant_id, normalized_phone);

CREATE INDEX IF NOT EXISTS idx_delivery_customers_tenant_name
  ON public.delivery_customers (tenant_id, name);

-- 3) Tabela de multiplos enderecos por cliente
CREATE TABLE IF NOT EXISTS public.delivery_customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.delivery_customers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 40),
  cep text NOT NULL DEFAULT '' CHECK (length(cep) <= 16),
  street text NOT NULL DEFAULT '' CHECK (length(street) <= 200),
  number text NOT NULL DEFAULT '' CHECK (length(number) <= 30),
  neighborhood text NOT NULL DEFAULT '' CHECK (length(neighborhood) <= 100),
  complement text NOT NULL DEFAULT '' CHECK (length(complement) <= 120),
  reference text NOT NULL DEFAULT '' CHECK (length(reference) <= 160),
  city text NOT NULL DEFAULT '' CHECK (length(city) <= 100),
  state text NOT NULL DEFAULT '' CHECK (length(state) <= 10),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_customer_addresses_tenant_customer
  ON public.delivery_customer_addresses (tenant_id, customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery_customer_primary_address
  ON public.delivery_customer_addresses (customer_id)
  WHERE is_primary = true;

-- 4) Tabela de configuracao de criterios automaticos de classificacao por estabelecimento
CREATE TABLE IF NOT EXISTS public.delivery_customer_classification_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  recurring_min_orders integer NOT NULL DEFAULT 3 CHECK (recurring_min_orders >= 2 AND recurring_min_orders <= 100),
  vip_min_orders integer NOT NULL DEFAULT 6 CHECK (vip_min_orders >= 2 AND vip_min_orders <= 500),
  vip_min_spent numeric(12,2) NOT NULL DEFAULT 300.00 CHECK (vip_min_spent >= 0),
  inactive_days integer NOT NULL DEFAULT 45 CHECK (inactive_days >= 7 AND inactive_days <= 365),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5) Associacao direta de pedidos online ao cliente identificado
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.delivery_customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_online_orders_tenant_customer
  ON public.online_orders (tenant_id, customer_id, created_at DESC);

-- 6) Triggers de integridade, tenant_id imutavel e updated_at
CREATE OR REPLACE FUNCTION public.validate_delivery_customer_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.name := left(btrim(coalesce(NEW.name, '')), 120);
  NEW.phone := left(btrim(coalesce(NEW.phone, '')), 32);
  NEW.normalized_phone := public.normalize_br_phone(NEW.phone);
  NEW.email := left(btrim(coalesce(NEW.email, '')), 160);
  NEW.cpf := left(regexp_replace(coalesce(NEW.cpf, ''), '[^0-9]', '', 'g'), 14);
  NEW.notes := left(btrim(coalesce(NEW.notes, '')), 1000);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_customers_normalize ON public.delivery_customers;
CREATE TRIGGER trg_delivery_customers_normalize
  BEFORE INSERT OR UPDATE ON public.delivery_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_delivery_customer_before_write();

DROP TRIGGER IF EXISTS trg_delivery_customers_updated_at ON public.delivery_customers;
CREATE TRIGGER trg_delivery_customers_updated_at
  BEFORE UPDATE ON public.delivery_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_prevent_tenant_id_change_delivery_customers ON public.delivery_customers;
CREATE TRIGGER trg_prevent_tenant_id_change_delivery_customers
  BEFORE UPDATE ON public.delivery_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_id_change();

CREATE OR REPLACE FUNCTION public.validate_delivery_customer_address_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_customer_tenant
  FROM public.delivery_customers
  WHERE id = NEW.customer_id;

  IF NOT FOUND OR v_customer_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Cliente nao pertence ao estabelecimento ativo.';
  END IF;

  NEW.label := left(btrim(coalesce(NEW.label, '')), 40);
  NEW.cep := left(regexp_replace(coalesce(NEW.cep, ''), '[^0-9-]', '', 'g'), 16);
  NEW.street := left(btrim(coalesce(NEW.street, '')), 200);
  NEW.number := left(btrim(coalesce(NEW.number, '')), 30);
  NEW.neighborhood := left(btrim(coalesce(NEW.neighborhood, '')), 100);
  NEW.complement := left(btrim(coalesce(NEW.complement, '')), 120);
  NEW.reference := left(btrim(coalesce(NEW.reference, '')), 160);
  NEW.city := left(btrim(coalesce(NEW.city, '')), 100);
  NEW.state := left(upper(btrim(coalesce(NEW.state, ''))), 10);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_customer_addresses_validate ON public.delivery_customer_addresses;
CREATE TRIGGER trg_delivery_customer_addresses_validate
  BEFORE INSERT OR UPDATE ON public.delivery_customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_delivery_customer_address_tenant();

DROP TRIGGER IF EXISTS trg_delivery_customer_addresses_updated_at ON public.delivery_customer_addresses;
CREATE TRIGGER trg_delivery_customer_addresses_updated_at
  BEFORE UPDATE ON public.delivery_customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_prevent_tenant_id_change_delivery_customer_addresses ON public.delivery_customer_addresses;
CREATE TRIGGER trg_prevent_tenant_id_change_delivery_customer_addresses
  BEFORE UPDATE ON public.delivery_customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_delivery_customer_classification_updated_at ON public.delivery_customer_classification_settings;
CREATE TRIGGER trg_delivery_customer_classification_updated_at
  BEFORE UPDATE ON public.delivery_customer_classification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_prevent_tenant_id_change_delivery_classification ON public.delivery_customer_classification_settings;
CREATE TRIGGER trg_prevent_tenant_id_change_delivery_classification
  BEFORE UPDATE ON public.delivery_customer_classification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_id_change();

-- 7) Seguranca Multi-Tenant (RLS estrito, ZERO acesso anon direto aos dados de clientes)
ALTER TABLE public.delivery_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_customer_classification_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_customers FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.delivery_customer_addresses FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.delivery_customer_classification_settings FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_customer_addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_customer_classification_settings TO authenticated;

DROP POLICY IF EXISTS delivery_customers_select_tenant ON public.delivery_customers;
CREATE POLICY delivery_customers_select_tenant
  ON public.delivery_customers
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_customers_insert_tenant ON public.delivery_customers;
CREATE POLICY delivery_customers_insert_tenant
  ON public.delivery_customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_customers_update_tenant ON public.delivery_customers;
CREATE POLICY delivery_customers_update_tenant
  ON public.delivery_customers
  FOR UPDATE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_customers_delete_tenant ON public.delivery_customers;
CREATE POLICY delivery_customers_delete_tenant
  ON public.delivery_customers
  FOR DELETE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_customer_addresses_select_tenant ON public.delivery_customer_addresses;
CREATE POLICY delivery_customer_addresses_select_tenant
  ON public.delivery_customer_addresses
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_customer_addresses_insert_tenant ON public.delivery_customer_addresses;
CREATE POLICY delivery_customer_addresses_insert_tenant
  ON public.delivery_customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_customer_addresses_update_tenant ON public.delivery_customer_addresses;
CREATE POLICY delivery_customer_addresses_update_tenant
  ON public.delivery_customer_addresses
  FOR UPDATE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_customer_addresses_delete_tenant ON public.delivery_customer_addresses;
CREATE POLICY delivery_customer_addresses_delete_tenant
  ON public.delivery_customer_addresses
  FOR DELETE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_classification_select_tenant ON public.delivery_customer_classification_settings;
CREATE POLICY delivery_classification_select_tenant
  ON public.delivery_customer_classification_settings
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_classification_upsert_tenant ON public.delivery_customer_classification_settings;
CREATE POLICY delivery_classification_upsert_tenant
  ON public.delivery_customer_classification_settings
  FOR ALL TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

-- 8) RPC segura para definir endereco principal de um cliente sem conflito do indice parcial
CREATE OR REPLACE FUNCTION public.set_primary_delivery_customer_address(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_address_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id)
     OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente para gerenciar enderecos de clientes.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_customer_addresses
    WHERE id = p_address_id
      AND customer_id = p_customer_id
      AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Endereco nao encontrado para este cliente.';
  END IF;

  UPDATE public.delivery_customer_addresses
  SET is_primary = false, updated_at = now()
  WHERE customer_id = p_customer_id
    AND tenant_id = p_tenant_id
    AND is_primary = true
    AND id <> p_address_id;

  UPDATE public.delivery_customer_addresses
  SET is_primary = true, updated_at = now()
  WHERE id = p_address_id
    AND customer_id = p_customer_id
    AND tenant_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_primary_delivery_customer_address(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_primary_delivery_customer_address(uuid, uuid, uuid) TO authenticated, service_role;

-- 9) Identificacao e associacao atomica de cliente durante checkout publico (concorrencia-segura)
CREATE OR REPLACE FUNCTION public.upsert_delivery_customer_from_order(
  p_tenant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment_type text,
  p_delivery_address text,
  p_delivery_reference text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clean_name text := left(btrim(coalesce(p_customer_name, '')), 120);
  v_clean_phone text := left(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g'), 32);
  v_norm_phone text := public.normalize_br_phone(p_customer_phone);
  v_clean_addr text := left(btrim(coalesce(p_delivery_address, '')), 200);
  v_clean_ref text := left(btrim(coalesce(p_delivery_reference, '')), 160);
  v_customer_id uuid;
  v_has_any_address boolean := false;
BEGIN
  IF length(v_norm_phone) < 8 OR length(v_clean_name) < 2 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.delivery_customers (
    tenant_id,
    name,
    phone,
    normalized_phone
  )
  VALUES (
    p_tenant_id,
    v_clean_name,
    v_clean_phone,
    v_norm_phone
  )
  ON CONFLICT (tenant_id, normalized_phone) DO UPDATE
  SET
    -- Preserva o nome/telefone mais completo ja existente; evita sobrescrever dados editados manualmente
    name = CASE
      WHEN length(btrim(public.delivery_customers.name)) >= 2 THEN public.delivery_customers.name
      ELSE EXCLUDED.name
    END,
    phone = CASE
      WHEN length(btrim(public.delivery_customers.phone)) >= 8 THEN public.delivery_customers.phone
      ELSE EXCLUDED.phone
    END,
    updated_at = now()
  RETURNING id INTO v_customer_id;

  IF p_fulfillment_type = 'delivery' AND length(v_clean_addr) >= 5 THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.delivery_customer_addresses
      WHERE customer_id = v_customer_id
        AND tenant_id = p_tenant_id
    ) INTO v_has_any_address;

    IF NOT v_has_any_address THEN
      INSERT INTO public.delivery_customer_addresses (
        tenant_id,
        customer_id,
        label,
        street,
        reference,
        is_primary
      )
      VALUES (
        p_tenant_id,
        v_customer_id,
        'Principal',
        v_clean_addr,
        v_clean_ref,
        true
      )
      ON CONFLICT DO NOTHING;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.delivery_customer_addresses
      WHERE customer_id = v_customer_id
        AND tenant_id = p_tenant_id
        AND lower(btrim(street)) = lower(v_clean_addr)
    ) THEN
      -- Registra novo endereco secundario sem substituir o endereco principal salvo
      INSERT INTO public.delivery_customer_addresses (
        tenant_id,
        customer_id,
        label,
        street,
        reference,
        is_primary
      )
      VALUES (
        p_tenant_id,
        v_customer_id,
        'Entrega',
        v_clean_addr,
        v_clean_ref,
        false
      );
    END IF;
  END IF;

  RETURN v_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_delivery_customer_from_order(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_delivery_customer_from_order(uuid, text, text, text, text, text) TO service_role;

-- 10) Atualizar create_public_online_order preservando assinatura exata, validacao de adicionais e is_tenant_billing_active
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
      'quantity',v_qty,'unitPrice',v_unit_price,'lineTotal',round(v_unit_price*v_qty, 2),
      'estimatedUnitCost',v_unit_cost,'xSaladasPerUnit',v_xsaladas,
      'components',v_components,'selectedAddons',v_selected_addons_snapshot,'note',v_note
    ));
  END LOOP;

  v_delivery_fee := CASE WHEN p_fulfillment_type = 'delivery' THEN v_menu.delivery_fee ELSE 0 END;
  IF v_subtotal < v_menu.minimum_order_amount THEN
    RAISE EXCEPTION 'Pedido minimo de R$ % nao atingido.', to_char(v_menu.minimum_order_amount,'FM999999990D00');
  END IF;
  v_total := v_subtotal + v_delivery_fee;
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
    payment_method,change_for,customer_note,subtotal_amount,delivery_fee,total_amount
  ) VALUES (
    v_order_id,v_menu.tenant_id,v_customer_id,v_order_number,v_order_code,v_token_hash,v_menu.slug,'received',
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
    'totalAmount', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb) TO anon, authenticated, service_role;

-- 11) Backfill seguro dos pedidos historicos ja existentes (preservando historico de entrega)
DO $$
DECLARE
  v_ord record;
  v_cid uuid;
BEGIN
  FOR v_ord IN
    SELECT id, tenant_id, customer_name, customer_phone, fulfillment_type, delivery_address, delivery_reference
    FROM public.online_orders
    WHERE customer_id IS NULL
    ORDER BY created_at ASC
  LOOP
    v_cid := public.upsert_delivery_customer_from_order(
      v_ord.tenant_id,
      v_ord.customer_name,
      v_ord.customer_phone,
      v_ord.fulfillment_type,
      v_ord.delivery_address,
      v_ord.delivery_reference
    );
    IF v_cid IS NOT NULL THEN
      UPDATE public.online_orders
      SET customer_id = v_cid
      WHERE id = v_ord.id AND customer_id IS NULL;
    END IF;
  END LOOP;
END;
$$;
