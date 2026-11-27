-- ============================================================================
-- ETAPA 5 — COMBOS E COMPOSICAO DE PRODUTOS (SEGMENTO ADEGA + ESTOQUE)
-- Migration estritamente aditiva e idempotente.
--
-- Regras absolutas cumpridas:
--   - Nao modifica, converte ou prejudica combos existentes de lanchonetes.
--   - Nao altera politicas RLS existentes em combos, products, sales ou orders.
--   - Adiciona apenas colunas opcionais com default seguro em combos
--     (category, notes) e novas tabelas isoladas para composicao/consumo
--     exclusivo de estabelecimentos do segmento 'adega'.
--   - Consolida consumo de componentes em transacao atomica (FOR UPDATE
--     ordenado, pre-validacao all-or-nothing, idempotency_key e snapshot
--     historico imutavel).
--   - Nao antecipa a Etapa 6 (baixa automatica em vendas/pedidos).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Extensao segura e nao-destrutiva de public.combos para metadados de Adega
-- ----------------------------------------------------------------------------
ALTER TABLE public.combos
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';

ALTER TABLE public.combos
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

-- ----------------------------------------------------------------------------
-- 2) Ampliacao controlada dos CHECK constraints de inventory_movements
--    para registrar baixas individuais geradas por consumo de combo
-- ----------------------------------------------------------------------------
-- Remover exclusivamente os CHECKs de domínio criados na Etapa 4.
-- Não tocar em constraints adicionais que protejam outras regras do ledger.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check,
  DROP CONSTRAINT IF EXISTS inventory_movements_origin_type_check;

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS chk_inventory_movements_movement_type,
  DROP CONSTRAINT IF EXISTS chk_inventory_movements_origin_type;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT chk_inventory_movements_movement_type
  CHECK (
    movement_type IN (
      'manual_entry',
      'purchase_receipt',
      'manual_exit',
      'loss',
      'damage',
      'expiry',
      'internal_consumption',
      'adjustment_in',
      'adjustment_out',
      'inventory_adjustment',
      'return_in',
      'combo_consumption'
    )
  );

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT chk_inventory_movements_origin_type
  CHECK (
    origin_type IN (
      'manual',
      'purchase_receipt',
      'inventory_count',
      'adjustment',
      'return',
      'combo_consumption',
      'sale',
      'online_order'
    )
  );

-- ----------------------------------------------------------------------------
-- 3) Guardiao exclusivo do segmento Adega para composicao e consumo de combos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_adega_combo_segment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_adega_tenant(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Composicao e consumo integrado de combos disponiveis apenas para estabelecimentos do segmento Adega.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_adega_combo_segment() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Composicao estruturada de combos (combo_components)
--    Cada linha referencia exclusivamente um produto individual do mesmo tenant
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.combo_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  combo_id uuid NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0 AND quantity <= 10000),
  unit_label text NOT NULL DEFAULT 'unidade' CHECK (char_length(btrim(unit_label)) BETWEEN 1 AND 60),
  conversion_factor numeric(12, 3) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0 AND conversion_factor <= 10000),
  packaging_conversion_id uuid REFERENCES public.inventory_packaging_conversions(id) ON DELETE SET NULL,
  base_quantity numeric(14, 3) NOT NULL CHECK (base_quantity > 0 AND base_quantity <= 1000000),
  unit_cost_snapshot numeric(12, 4) NOT NULL DEFAULT 0 CHECK (unit_cost_snapshot >= 0),
  total_cost_snapshot numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost_snapshot >= 0),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_combo_components_tenant_combo_product UNIQUE (tenant_id, combo_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_combo_components_tenant_combo
  ON public.combo_components (tenant_id, combo_id, sort_order ASC);

CREATE INDEX IF NOT EXISTS idx_combo_components_tenant_product
  ON public.combo_components (tenant_id, product_id);

CREATE OR REPLACE FUNCTION public.validate_combo_component_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.combos c
    WHERE c.id = NEW.combo_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Combo nao pertence a este estabelecimento.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Produto componente nao pertence a este estabelecimento.';
  END IF;

  IF NEW.packaging_conversion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.inventory_packaging_conversions pc
    WHERE pc.id = NEW.packaging_conversion_id
      AND pc.tenant_id = NEW.tenant_id
      AND pc.product_id = NEW.product_id
      AND pc.active = true
  ) THEN
    RAISE EXCEPTION 'Embalagem de conversao invalida para o produto componente.';
  END IF;

  NEW.quantity := round(NEW.quantity, 3);
  NEW.conversion_factor := round(NEW.conversion_factor, 3);
  NEW.base_quantity := round(NEW.quantity * NEW.conversion_factor, 3);
  IF NEW.base_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade base do componente deve ser maior que zero.';
  END IF;
  NEW.unit_label := left(coalesce(nullif(btrim(NEW.unit_label), ''), 'unidade'), 60);
  NEW.unit_cost_snapshot := round(coalesce(NEW.unit_cost_snapshot, 0), 4);
  NEW.total_cost_snapshot := round(coalesce(NEW.total_cost_snapshot, 0), 2);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_combo_component_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_combo_components_segment ON public.combo_components;
CREATE TRIGGER trg_combo_components_segment
  BEFORE INSERT OR UPDATE ON public.combo_components
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_combo_segment();

DROP TRIGGER IF EXISTS trg_combo_components_validate ON public.combo_components;
CREATE TRIGGER trg_combo_components_validate
  BEFORE INSERT OR UPDATE ON public.combo_components
  FOR EACH ROW EXECUTE FUNCTION public.validate_combo_component_before_write();

DROP TRIGGER IF EXISTS trg_combo_components_lock_tenant ON public.combo_components;
CREATE TRIGGER trg_combo_components_lock_tenant
  BEFORE UPDATE ON public.combo_components
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_combo_components_updated_at ON public.combo_components;
CREATE TRIGGER trg_combo_components_updated_at
  BEFORE UPDATE ON public.combo_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.combo_components ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.combo_components FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.combo_components TO authenticated;

DROP POLICY IF EXISTS combo_components_select_tenant ON public.combo_components;
CREATE POLICY combo_components_select_tenant
  ON public.combo_components
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.is_adega_tenant(tenant_id)
  );

-- ----------------------------------------------------------------------------
-- 5) Snapshots imutaveis de consumo de combos (combo_consumptions + items)
--    Preservam exatamente o que foi baixado no momento da operacao
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.combo_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  combo_id uuid REFERENCES public.combos(id) ON DELETE SET NULL,
  combo_name_snapshot text NOT NULL CHECK (char_length(btrim(combo_name_snapshot)) BETWEEN 1 AND 120),
  combo_quantity numeric(14, 3) NOT NULL CHECK (combo_quantity > 0 AND combo_quantity <= 10000),
  sale_price_snapshot numeric(12, 2) NOT NULL DEFAULT 0 CHECK (sale_price_snapshot >= 0),
  total_cost_snapshot numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost_snapshot >= 0),
  origin_type text NOT NULL DEFAULT 'combo_consumption'
    CHECK (origin_type IN ('combo_consumption', 'sale', 'online_order')),
  origin_id uuid,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 600),
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 160),
  actor_user_id uuid,
  actor_email text NOT NULL DEFAULT '' CHECK (char_length(actor_email) <= 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_combo_consumptions_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_combo_consumptions_tenant_created
  ON public.combo_consumptions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_combo_consumptions_tenant_combo
  ON public.combo_consumptions (tenant_id, combo_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.combo_consumption_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  consumption_id uuid NOT NULL REFERENCES public.combo_consumptions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL CHECK (char_length(btrim(product_name_snapshot)) BETWEEN 1 AND 120),
  component_qty_per_combo numeric(14, 3) NOT NULL CHECK (component_qty_per_combo > 0),
  unit_label text NOT NULL CHECK (char_length(btrim(unit_label)) BETWEEN 1 AND 60),
  conversion_factor numeric(12, 3) NOT NULL CHECK (conversion_factor > 0),
  base_qty_per_combo numeric(14, 3) NOT NULL CHECK (base_qty_per_combo > 0),
  total_base_qty_deducted numeric(14, 3) NOT NULL CHECK (total_base_qty_deducted > 0),
  unit_cost_snapshot numeric(12, 4) NOT NULL DEFAULT 0 CHECK (unit_cost_snapshot >= 0),
  total_cost_snapshot numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost_snapshot >= 0),
  movement_id uuid NOT NULL REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combo_consumption_items_tenant_consumption
  ON public.combo_consumption_items (tenant_id, consumption_id);

CREATE OR REPLACE FUNCTION public.prevent_combo_consumption_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Snapshots historicos de consumo de combos sao imutaveis.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Snapshots historicos de consumo de combos nao podem ser excluidos.';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_combo_consumption_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_combo_consumptions_segment ON public.combo_consumptions;
CREATE TRIGGER trg_combo_consumptions_segment
  BEFORE INSERT ON public.combo_consumptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_combo_segment();

DROP TRIGGER IF EXISTS trg_combo_consumptions_immutable ON public.combo_consumptions;
CREATE TRIGGER trg_combo_consumptions_immutable
  BEFORE UPDATE OR DELETE ON public.combo_consumptions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_combo_consumption_mutation();

DROP TRIGGER IF EXISTS trg_combo_consumption_items_segment ON public.combo_consumption_items;
CREATE TRIGGER trg_combo_consumption_items_segment
  BEFORE INSERT ON public.combo_consumption_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_combo_segment();

DROP TRIGGER IF EXISTS trg_combo_consumption_items_immutable ON public.combo_consumption_items;
CREATE TRIGGER trg_combo_consumption_items_immutable
  BEFORE UPDATE OR DELETE ON public.combo_consumption_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_combo_consumption_mutation();

ALTER TABLE public.combo_consumptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.combo_consumptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.combo_consumptions TO authenticated;

DROP POLICY IF EXISTS combo_consumptions_select_tenant ON public.combo_consumptions;
CREATE POLICY combo_consumptions_select_tenant
  ON public.combo_consumptions
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

ALTER TABLE public.combo_consumption_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.combo_consumption_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.combo_consumption_items TO authenticated;

DROP POLICY IF EXISTS combo_consumption_items_select_tenant ON public.combo_consumption_items;
CREATE POLICY combo_consumption_items_select_tenant
  ON public.combo_consumption_items
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

-- ----------------------------------------------------------------------------
-- 6) RPC transacional: salvar combo de Adega + composicao estruturada
--    Calcula custos reais dos componentes no servidor e preserva preco editado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.combo_save_with_composition(
  p_tenant_id uuid,
  p_combo_id uuid DEFAULT NULL,
  p_name text DEFAULT '',
  p_description text DEFAULT '',
  p_category text DEFAULT '',
  p_notes text DEFAULT '',
  p_sale_price numeric DEFAULT 0,
  p_active boolean DEFAULT true,
  p_image_url text DEFAULT '',
  p_image_path text DEFAULT '',
  p_components jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_clean_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 80);
  v_clean_desc text := left(btrim(coalesce(p_description, '')), 240);
  v_clean_category text := left(btrim(coalesce(p_category, '')), 60);
  v_clean_notes text := left(btrim(coalesce(p_notes, '')), 600);
  v_sale_price numeric(12, 2) := round(coalesce(p_sale_price, 0), 2);
  v_combo_id uuid := p_combo_id;
  v_comp jsonb;
  v_product_id uuid;
  v_product record;
  v_pkg_id uuid;
  v_pkg record;
  v_qty numeric(14, 3);
  v_factor numeric(12, 3);
  v_unit_label text;
  v_base_qty numeric(14, 3);
  v_unit_cost numeric(12, 4);
  v_line_cost numeric(14, 2);
  v_total_cost numeric(12, 2) := 0;
  v_sort_order integer := 0;
  v_seen_products uuid[] := ARRAY[]::uuid[];
  v_legacy_items jsonb := '[]'::jsonb;
  v_auto_desc text := '';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao autenticada obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado ou assinatura inativa para este estabelecimento.';
  END IF;
  IF NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente para cadastrar ou editar combos.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Composicao integrada de combos disponivel apenas para estabelecimentos do segmento Adega.';
  END IF;

  IF char_length(v_clean_name) = 0 THEN
    RAISE EXCEPTION 'Informe o nome do combo.';
  END IF;
  IF v_sale_price <= 0 OR v_sale_price > 100000 THEN
    RAISE EXCEPTION 'Informe um preco de venda valido maior que zero.';
  END IF;
  IF p_components IS NULL OR jsonb_typeof(p_components) <> 'array' OR jsonb_array_length(p_components) = 0 THEN
    RAISE EXCEPTION 'Adicione ao menos um produto individual na composicao do combo.';
  END IF;
  IF jsonb_array_length(p_components) > 40 THEN
    RAISE EXCEPTION 'Limite maximo de 40 componentes por combo.';
  END IF;

  IF v_combo_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.combos c
      WHERE c.id = v_combo_id AND c.tenant_id = p_tenant_id
    ) THEN
      RAISE EXCEPTION 'Combo nao encontrado neste estabelecimento.';
    END IF;
  END IF;

  -- Pre-valida todos os componentes antes de gravar
  FOR v_comp IN SELECT value FROM jsonb_array_elements(p_components) LOOP
    v_product_id := NULLIF(btrim(coalesce(v_comp->>'productId', '')), '')::uuid;
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Todo componente do combo precisa referenciar um produto valido.';
    END IF;
    IF v_product_id = ANY(v_seen_products) THEN
      RAISE EXCEPTION 'Produto duplicado na composicao do combo. Ajuste a quantidade no mesmo item.';
    END IF;
    v_seen_products := array_append(v_seen_products, v_product_id);

    SELECT p.*, coalesce(NULLIF(ib.average_unit_cost, 0), p.cost_price, 0) AS effective_unit_cost
    INTO v_product
    FROM public.products p
    LEFT JOIN public.inventory_balances ib
      ON ib.tenant_id = p.tenant_id AND ib.product_id = p.id
    WHERE p.id = v_product_id AND p.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto componente nao encontrado neste estabelecimento.';
    END IF;

    v_qty := round(coalesce((v_comp->>'quantity')::numeric, 0), 3);
    IF v_qty <= 0 OR v_qty > 10000 THEN
      RAISE EXCEPTION 'A quantidade de "%" deve ser maior que zero.', v_product.name;
    END IF;

    v_pkg_id := NULLIF(btrim(coalesce(v_comp->>'packagingConversionId', '')), '')::uuid;
    IF v_pkg_id IS NOT NULL THEN
      SELECT * INTO v_pkg
      FROM public.inventory_packaging_conversions pc
      WHERE pc.id = v_pkg_id
        AND pc.tenant_id = p_tenant_id
        AND pc.product_id = v_product_id
        AND pc.active = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Embalagem de conversao invalida para "%".', v_product.name;
      END IF;
      v_factor := round(v_pkg.factor_to_base, 3);
      v_unit_label := left(btrim(coalesce(nullif(v_comp->>'unitLabel', ''), v_pkg.package_label)), 60);
    ELSE
      v_factor := round(coalesce(NULLIF((v_comp->>'conversionFactor')::numeric, 0), 1), 3);
      v_unit_label := left(btrim(coalesce(nullif(v_comp->>'unitLabel', ''), coalesce(v_product.sale_unit, 'unidade'))), 60);
    END IF;

    IF v_factor <= 0 OR v_factor > 10000 THEN
      RAISE EXCEPTION 'Fator de conversao invalido para "%".', v_product.name;
    END IF;

    v_base_qty := round(v_qty * v_factor, 3);
    IF v_base_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade base invalida para "%".', v_product.name;
    END IF;

    v_unit_cost := round(greatest(0, coalesce(v_product.effective_unit_cost, 0)), 4);
    v_line_cost := round(v_base_qty * v_unit_cost, 2);
    v_total_cost := round(v_total_cost + v_line_cost, 2);

    v_legacy_items := v_legacy_items || jsonb_build_array(
      jsonb_build_object(
        'productId', v_product.id,
        'productName', v_product.name,
        'quantity', v_base_qty,
        'countsAsXSalada', false
      )
    );

    IF v_auto_desc <> '' THEN
      v_auto_desc := v_auto_desc || ' + ';
    END IF;
    v_auto_desc := v_auto_desc || trim(to_char(v_qty, 'FM999999990.###')) || 'x ' || v_product.name;
  END LOOP;

  IF v_clean_desc = '' THEN
    v_clean_desc := left(v_auto_desc, 240);
  END IF;

  IF v_combo_id IS NULL THEN
    INSERT INTO public.combos (
      tenant_id,
      owner_email,
      name,
      description,
      category,
      notes,
      items,
      sale_price,
      estimated_cost,
      active,
      image_url,
      image_path
    ) VALUES (
      p_tenant_id,
      v_email,
      v_clean_name,
      v_clean_desc,
      v_clean_category,
      v_clean_notes,
      v_legacy_items,
      v_sale_price,
      v_total_cost,
      coalesce(p_active, true),
      left(btrim(coalesce(p_image_url, '')), 600),
      left(btrim(coalesce(p_image_path, '')), 400)
    )
    RETURNING id INTO v_combo_id;
  ELSE
    UPDATE public.combos
    SET
      name = v_clean_name,
      description = v_clean_desc,
      category = v_clean_category,
      notes = v_clean_notes,
      items = v_legacy_items,
      sale_price = v_sale_price,
      estimated_cost = v_total_cost,
      active = coalesce(p_active, true),
      image_url = left(btrim(coalesce(p_image_url, '')), 600),
      image_path = left(btrim(coalesce(p_image_path, '')), 400),
      updated_at = now()
    WHERE id = v_combo_id AND tenant_id = p_tenant_id;
  END IF;

  DELETE FROM public.combo_components
  WHERE tenant_id = p_tenant_id AND combo_id = v_combo_id;

  v_sort_order := 0;
  FOR v_comp IN SELECT value FROM jsonb_array_elements(p_components) LOOP
    v_product_id := (v_comp->>'productId')::uuid;
    SELECT p.*, coalesce(NULLIF(ib.average_unit_cost, 0), p.cost_price, 0) AS effective_unit_cost
    INTO v_product
    FROM public.products p
    LEFT JOIN public.inventory_balances ib
      ON ib.tenant_id = p.tenant_id AND ib.product_id = p.id
    WHERE p.id = v_product_id AND p.tenant_id = p_tenant_id;

    v_qty := round((v_comp->>'quantity')::numeric, 3);
    v_pkg_id := NULLIF(btrim(coalesce(v_comp->>'packagingConversionId', '')), '')::uuid;
    IF v_pkg_id IS NOT NULL THEN
      SELECT * INTO v_pkg
      FROM public.inventory_packaging_conversions pc
      WHERE pc.id = v_pkg_id
        AND pc.tenant_id = p_tenant_id
        AND pc.product_id = v_product_id
        AND pc.active = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Embalagem de conversao invalida para o produto componente.';
      END IF;
      v_factor := round(v_pkg.factor_to_base, 3);
      v_unit_label := left(btrim(coalesce(nullif(v_comp->>'unitLabel', ''), v_pkg.package_label)), 60);
    ELSE
      v_factor := round(coalesce(NULLIF((v_comp->>'conversionFactor')::numeric, 0), 1), 3);
      v_unit_label := left(btrim(coalesce(nullif(v_comp->>'unitLabel', ''), coalesce(v_product.sale_unit, 'unidade'))), 60);
    END IF;

    v_base_qty := round(v_qty * v_factor, 3);
    v_unit_cost := round(greatest(0, coalesce(v_product.effective_unit_cost, 0)), 4);
    v_line_cost := round(v_base_qty * v_unit_cost, 2);

    INSERT INTO public.combo_components (
      tenant_id,
      combo_id,
      product_id,
      quantity,
      unit_label,
      conversion_factor,
      packaging_conversion_id,
      base_quantity,
      unit_cost_snapshot,
      total_cost_snapshot,
      sort_order
    ) VALUES (
      p_tenant_id,
      v_combo_id,
      v_product_id,
      v_qty,
      v_unit_label,
      v_factor,
      v_pkg_id,
      v_base_qty,
      v_unit_cost,
      v_line_cost,
      v_sort_order
    );

    v_sort_order := v_sort_order + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'comboId', v_combo_id,
    'estimatedCost', v_total_cost,
    'salePrice', v_sale_price
  );
END;
$$;

REVOKE ALL ON FUNCTION public.combo_save_with_composition(uuid, uuid, text, text, text, text, numeric, boolean, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.combo_save_with_composition(uuid, uuid, text, text, text, text, numeric, boolean, text, text, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) RPC somente leitura: checagem de disponibilidade real por componentes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.combo_check_availability(
  p_tenant_id uuid,
  p_combo_id uuid,
  p_combo_quantity numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_qty numeric(14, 3) := round(coalesce(p_combo_quantity, 1), 3);
  v_combo record;
  v_comp record;
  v_available_qty numeric(14, 3);
  v_required_base numeric(14, 3);
  v_allow_negative boolean;
  v_possible_for_item integer;
  v_max_producible integer := NULL;
  v_all_available boolean := true;
  v_limiting_id uuid := NULL;
  v_limiting_name text := NULL;
  v_details jsonb := '[]'::jsonb;
  v_comp_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao autenticada obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado para este estabelecimento.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Verificacao de estoque para combos disponivel apenas no segmento Adega.';
  END IF;
  IF v_qty <= 0 OR v_qty > 10000 THEN
    RAISE EXCEPTION 'Quantidade de combos para verificacao deve ser maior que zero.';
  END IF;

  SELECT * INTO v_combo
  FROM public.combos c
  WHERE c.id = p_combo_id AND c.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combo nao encontrado neste estabelecimento.';
  END IF;

  FOR v_comp IN
    SELECT
      cc.product_id,
      p.name AS product_name,
      cc.base_quantity,
      cc.unit_label,
      coalesce(ib.available_qty, 0) AS current_available,
      coalesce(ib.allow_negative_stock, false) AS allow_negative
    FROM public.combo_components cc
    JOIN public.products p
      ON p.id = cc.product_id AND p.tenant_id = cc.tenant_id
    LEFT JOIN public.inventory_balances ib
      ON ib.tenant_id = cc.tenant_id AND ib.product_id = cc.product_id
    WHERE cc.tenant_id = p_tenant_id
      AND cc.combo_id = p_combo_id
    ORDER BY cc.sort_order ASC, p.name ASC
  LOOP
    v_comp_count := v_comp_count + 1;
    v_available_qty := round(v_comp.current_available, 3);
    v_required_base := round(v_comp.base_quantity * v_qty, 3);
    v_allow_negative := coalesce(v_comp.allow_negative, false);

    IF NOT v_allow_negative THEN
      v_possible_for_item := greatest(0, floor(v_available_qty / v_comp.base_quantity)::integer);
      IF v_max_producible IS NULL OR v_possible_for_item < v_max_producible THEN
        v_max_producible := v_possible_for_item;
        v_limiting_id := v_comp.product_id;
        v_limiting_name := v_comp.product_name;
      END IF;
      IF v_available_qty < v_required_base THEN
        v_all_available := false;
      END IF;
    END IF;

    v_details := v_details || jsonb_build_array(
      jsonb_build_object(
        'productId', v_comp.product_id,
        'productName', v_comp.product_name,
        'requiredPerComboBase', v_comp.base_quantity,
        'requiredTotalBase', v_required_base,
        'availableQty', v_available_qty,
        'allowNegativeStock', v_allow_negative,
        'sufficient', (v_allow_negative OR v_available_qty >= v_required_base),
        'maxCombosFromComponent', CASE WHEN v_allow_negative THEN NULL ELSE greatest(0, floor(v_available_qty / v_comp.base_quantity)::integer) END
      )
    );
  END LOOP;

  IF v_comp_count = 0 THEN
    v_all_available := false;
    v_max_producible := 0;
  END IF;

  RETURN jsonb_build_object(
    'comboId', v_combo.id,
    'comboName', v_combo.name,
    'requestedQuantity', v_qty,
    'available', v_all_available,
    'maxProducibleQty', v_max_producible,
    'limitingProductId', v_limiting_id,
    'limitingProductName', v_limiting_name,
    'components', v_details
  );
END;
$$;

REVOKE ALL ON FUNCTION public.combo_check_availability(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.combo_check_availability(uuid, uuid, numeric) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8) RPC transacional: consumo atomico dos componentes de um combo
--    - Bloqueio deterministico FOR UPDATE em ordem crescente de product_id
--    - Pre-validacao ALL-OR-NOTHING: se qualquer componente faltar, falha antes
--      de deduzir qualquer item
--    - Idempotente via (tenant_id, idempotency_key)
--    - Gera movimentacao individual por componente + snapshot imutavel
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.combo_consume_components(
  p_tenant_id uuid,
  p_combo_id uuid,
  p_combo_quantity numeric DEFAULT 1,
  p_origin_type text DEFAULT 'combo_consumption',
  p_origin_id uuid DEFAULT NULL,
  p_notes text DEFAULT '',
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_qty numeric(14, 3) := round(coalesce(p_combo_quantity, 1), 3);
  v_origin text := lower(btrim(coalesce(p_origin_type, 'combo_consumption')));
  v_clean_notes text := left(btrim(coalesce(p_notes, '')), 600);
  -- Reservar espaço para o sufixo ":" + UUID do produto nas movimentações.
  v_key text := left(btrim(coalesce(p_idempotency_key, '')), 120);
  v_combo record;
  v_existing record;
  v_comp record;
  v_bal record;
  v_comp_count integer := 0;
  v_deduct_base numeric(14, 3);
  v_deduct_input numeric(14, 3);
  v_prev_qty numeric(14, 3);
  v_next_qty numeric(14, 3);
  v_unit_cost numeric(12, 4);
  v_line_cost numeric(14, 2);
  v_total_cost numeric(14, 2) := 0;
  v_consumption_id uuid;
  v_mov_id uuid;
  v_movements jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao autenticada obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado ou assinatura inativa para este estabelecimento.';
  END IF;
  IF NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager', 'staff']) THEN
    RAISE EXCEPTION 'Permissao insuficiente para baixar estoque de combos.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Baixa integrada de combos disponivel apenas para estabelecimentos do segmento Adega.';
  END IF;
  IF v_qty <= 0 OR v_qty > 10000 THEN
    RAISE EXCEPTION 'Quantidade de combos para consumo deve ser maior que zero.';
  END IF;
  IF v_origin NOT IN ('combo_consumption', 'sale', 'online_order') THEN
    RAISE EXCEPTION 'Origem invalida para consumo de combo.';
  END IF;

  IF char_length(v_key) < 8 THEN
    RAISE EXCEPTION 'Chave de idempotencia obrigatoria (minimo de 8 caracteres) para consumir combo.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    hashtext('combo_consume:' || p_tenant_id::text || ':' || v_key)
  );

  SELECT * INTO v_existing
  FROM public.combo_consumptions cc
  WHERE cc.tenant_id = p_tenant_id
    AND cc.idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.combo_id IS DISTINCT FROM p_combo_id
       OR v_existing.combo_quantity IS DISTINCT FROM v_qty
       OR v_existing.origin_type IS DISTINCT FROM v_origin
       OR v_existing.origin_id IS DISTINCT FROM p_origin_id THEN
      RAISE EXCEPTION 'Chave de idempotencia ja utilizada com dados diferentes. Gere uma nova chave para esta operacao.';
    END IF;
    RETURN jsonb_build_object(
      'consumptionId', v_existing.id,
      'comboId', v_existing.combo_id,
      'comboQuantity', v_existing.combo_quantity,
      'totalCost', v_existing.total_cost_snapshot,
      'idempotentReplay', true
    );
  END IF;

  SELECT * INTO v_combo
  FROM public.combos c
  WHERE c.id = p_combo_id AND c.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combo nao encontrado neste estabelecimento.';
  END IF;

  -- Fase 1: Garante existencia de linhas em inventory_balances e aplica lock
  -- em ordem deterministica (product_id ASC) para evitar deadlocks e validar TUDO antes de deduzir.
  FOR v_comp IN
    SELECT
      cc.*,
      p.name AS product_name,
      p.cost_price AS product_cost_price
    FROM public.combo_components cc
    JOIN public.products p
      ON p.id = cc.product_id AND p.tenant_id = cc.tenant_id
    WHERE cc.tenant_id = p_tenant_id
      AND cc.combo_id = p_combo_id
    ORDER BY cc.product_id ASC
  LOOP
    v_comp_count := v_comp_count + 1;

    INSERT INTO public.inventory_balances (
      tenant_id, product_id, available_qty, average_unit_cost, last_cost_price
    ) VALUES (
      p_tenant_id, v_comp.product_id, 0, coalesce(v_comp.product_cost_price, 0), coalesce(v_comp.product_cost_price, 0)
    )
    ON CONFLICT (tenant_id, product_id) DO NOTHING;

    SELECT * INTO v_bal
    FROM public.inventory_balances ib
    WHERE ib.tenant_id = p_tenant_id
      AND ib.product_id = v_comp.product_id
    FOR UPDATE;

    v_deduct_base := round(v_comp.base_quantity * v_qty, 3);
    v_prev_qty := round(v_bal.available_qty, 3);
    v_next_qty := round(v_prev_qty - v_deduct_base, 3);

    IF v_next_qty < 0 AND NOT coalesce(v_bal.allow_negative_stock, false) THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%" ao consumir o combo "%" (disponivel: %, necessario: %).',
        v_comp.product_name, v_combo.name, v_prev_qty, v_deduct_base;
    END IF;

    v_unit_cost := round(greatest(0, coalesce(NULLIF(v_bal.average_unit_cost, 0), v_comp.unit_cost_snapshot, v_comp.product_cost_price, 0)), 4);
    v_total_cost := round(v_total_cost + round(v_deduct_base * v_unit_cost, 2), 2);
  END LOOP;

  IF v_comp_count = 0 THEN
    RAISE EXCEPTION 'Este combo nao possui componentes configurados para baixa de estoque.';
  END IF;

  INSERT INTO public.combo_consumptions (
    tenant_id,
    combo_id,
    combo_name_snapshot,
    combo_quantity,
    sale_price_snapshot,
    total_cost_snapshot,
    origin_type,
    origin_id,
    notes,
    idempotency_key,
    actor_user_id,
    actor_email
  ) VALUES (
    p_tenant_id,
    v_combo.id,
    left(v_combo.name, 120),
    v_qty,
    round(coalesce(v_combo.sale_price, 0), 2),
    v_total_cost,
    v_origin,
    p_origin_id,
    v_clean_notes,
    v_key,
    v_uid,
    left(v_email, 160)
  )
  RETURNING id INTO v_consumption_id;

  -- Fase 2: Deduz componentes e registra movimentacoes + itens do snapshot
  FOR v_comp IN
    SELECT
      cc.*,
      p.name AS product_name,
      p.cost_price AS product_cost_price
    FROM public.combo_components cc
    JOIN public.products p
      ON p.id = cc.product_id AND p.tenant_id = cc.tenant_id
    WHERE cc.tenant_id = p_tenant_id
      AND cc.combo_id = p_combo_id
    ORDER BY cc.product_id ASC
  LOOP
    SELECT * INTO v_bal
    FROM public.inventory_balances ib
    WHERE ib.tenant_id = p_tenant_id
      AND ib.product_id = v_comp.product_id
    FOR UPDATE;

    v_deduct_input := round(v_comp.quantity * v_qty, 3);
    v_deduct_base := round(v_comp.base_quantity * v_qty, 3);
    v_prev_qty := round(v_bal.available_qty, 3);
    v_next_qty := round(v_prev_qty - v_deduct_base, 3);
    v_unit_cost := round(greatest(0, coalesce(NULLIF(v_bal.average_unit_cost, 0), v_comp.unit_cost_snapshot, v_comp.product_cost_price, 0)), 4);
    v_line_cost := round(v_deduct_base * v_unit_cost, 2);

    UPDATE public.inventory_balances
    SET
      available_qty = v_next_qty,
      updated_at = now()
    WHERE id = v_bal.id;

    INSERT INTO public.inventory_movements (
      tenant_id,
      product_id,
      movement_type,
      direction,
      input_quantity,
      input_unit,
      conversion_factor_used,
      base_quantity,
      previous_balance,
      new_balance,
      unit_cost,
      total_cost,
      previous_avg_cost,
      new_avg_cost,
      reason,
      notes,
      origin_type,
      origin_id,
      packaging_conversion_id,
      idempotency_key,
      actor_user_id,
      actor_email
    ) VALUES (
      p_tenant_id,
      v_comp.product_id,
      'combo_consumption',
      'out',
      v_deduct_input,
      v_comp.unit_label,
      v_comp.conversion_factor,
      v_deduct_base,
      v_prev_qty,
      v_next_qty,
      v_unit_cost,
      v_line_cost,
      v_bal.average_unit_cost,
      v_bal.average_unit_cost,
      left('Consumo de combo: ' || v_combo.name || ' (' || trim(to_char(v_qty, 'FM999999990.###')) || 'x)', 300),
      v_clean_notes,
      v_origin,
      coalesce(p_origin_id, v_consumption_id),
      v_comp.packaging_conversion_id,
      left(v_key || ':' || v_comp.product_id::text, 160),
      v_uid,
      left(v_email, 160)
    )
    RETURNING id INTO v_mov_id;

    INSERT INTO public.combo_consumption_items (
      tenant_id,
      consumption_id,
      product_id,
      product_name_snapshot,
      component_qty_per_combo,
      unit_label,
      conversion_factor,
      base_qty_per_combo,
      total_base_qty_deducted,
      unit_cost_snapshot,
      total_cost_snapshot,
      movement_id
    ) VALUES (
      p_tenant_id,
      v_consumption_id,
      v_comp.product_id,
      left(v_comp.product_name, 120),
      v_comp.quantity,
      v_comp.unit_label,
      v_comp.conversion_factor,
      v_comp.base_quantity,
      v_deduct_base,
      v_unit_cost,
      v_line_cost,
      v_mov_id
    );

    v_movements := v_movements || jsonb_build_array(
      jsonb_build_object(
        'productId', v_comp.product_id,
        'movementId', v_mov_id,
        'deductedBaseQty', v_deduct_base,
        'newBalance', v_next_qty
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'consumptionId', v_consumption_id,
    'comboId', v_combo.id,
    'comboQuantity', v_qty,
    'totalCost', v_total_cost,
    'idempotentReplay', false,
    'movements', v_movements
  );
END;
$$;

REVOKE ALL ON FUNCTION public.combo_consume_components(uuid, uuid, numeric, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.combo_consume_components(uuid, uuid, numeric, text, uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9) Cardapio Digital publico com disponibilidade de combos para Adegas
--    Mantem 100% intacto o retorno e o comportamento das lanchonetes
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
      SELECT jsonb_agg(
        CASE
          WHEN coalesce(nullif(btrim(t.business_segment), ''), 'lanchonete') = 'adega' THEN
            jsonb_build_object(
              'id', c.id,
              'name', c.name,
              'description', c.description,
              'category', coalesce(c.category, ''),
              'items', c.items,
              'salePrice', c.sale_price,
              'imageUrl', coalesce(c.image_url, ''),
              'isAvailable', (
                EXISTS (
                  SELECT 1 FROM public.combo_components cc0
                  WHERE cc0.tenant_id = d.tenant_id AND cc0.combo_id = c.id
                )
                AND NOT EXISTS (
                  SELECT 1
                  FROM public.combo_components cc1
                  LEFT JOIN public.inventory_balances ib1
                    ON ib1.tenant_id = cc1.tenant_id AND ib1.product_id = cc1.product_id
                  WHERE cc1.tenant_id = d.tenant_id
                    AND cc1.combo_id = c.id
                    AND NOT coalesce(ib1.allow_negative_stock, false)
                    AND coalesce(ib1.available_qty, 0) < cc1.base_quantity
                )
              ),
              'maxAvailableQty', (
                SELECT min(greatest(0, floor(coalesce(ib2.available_qty, 0) / cc2.base_quantity)::integer))
                FROM public.combo_components cc2
                LEFT JOIN public.inventory_balances ib2
                  ON ib2.tenant_id = cc2.tenant_id AND ib2.product_id = cc2.product_id
                WHERE cc2.tenant_id = d.tenant_id
                  AND cc2.combo_id = c.id
                  AND NOT coalesce(ib2.allow_negative_stock, false)
              )
            )
          ELSE
            jsonb_build_object(
              'id', c.id,
              'name', c.name,
              'description', c.description,
              'items', c.items,
              'salePrice', c.sale_price,
              'imageUrl', coalesce(c.image_url, '')
            )
        END
        ORDER BY c.name ASC
      )
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

-- ----------------------------------------------------------------------------
-- 10) Publicacao Realtime para sincronizacao imediata de combos e consumos
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY['combo_components', 'combo_consumptions'] LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END LOOP;
  END IF;
END
$$;

COMMIT;

-- ============================================================================
-- ROLLBACK MANUAL (NAO EXECUTADO AUTOMATICAMENTE)
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.combo_consume_components(uuid, uuid, numeric, text, uuid, text, text);
--   DROP FUNCTION IF EXISTS public.combo_check_availability(uuid, uuid, numeric);
--   DROP FUNCTION IF EXISTS public.combo_save_with_composition(uuid, uuid, text, text, text, text, numeric, boolean, text, text, jsonb);
--   DROP TABLE IF EXISTS public.combo_consumption_items;
--   DROP TABLE IF EXISTS public.combo_consumptions;
--   DROP TABLE IF EXISTS public.combo_components;
--   DROP FUNCTION IF EXISTS public.prevent_combo_consumption_mutation();
--   DROP FUNCTION IF EXISTS public.validate_combo_component_before_write();
--   DROP FUNCTION IF EXISTS public.guard_adega_combo_segment();
-- COMMIT;
-- ============================================================================
