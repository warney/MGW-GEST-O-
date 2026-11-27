-- ============================================================================
-- ETAPA 4 — ESTOQUE PROFISSIONAL (MODULO EXCLUSIVO PARA SEGMENTO ADEGA)
-- Migration estritamente aditiva e idempotente.
--
-- Regras absolutas cumpridas:
--   - Nao modifica, renomeia nem altera tabelas existentes (products, sales, combos, etc.).
--   - Nao altera politicas RLS existentes nem funcoes de seguranca existentes.
--   - Nao altera nem converte registros de lanchonetes.
--   - Bloqueia uso para estabelecimentos fora do segmento 'adega'.
--   - Saldos (inventory_balances), movimentacoes (inventory_movements),
--     pedidos/recebimentos de compra e inventarios sao mutados exclusivamente
--     por funcoes RPC atomicas (SECURITY DEFINER + FOR UPDATE + idempotency_key).
--   - Nao implementa baixa automatica de vendas/combos/pedidos (etapa futura).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Funcao auxiliar interna de verificacao de segmento e permissao de Adega
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_adega_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND coalesce(nullif(btrim(t.business_segment), ''), 'lanchonete') = 'adega'
  );
$$;

REVOKE ALL ON FUNCTION public.is_adega_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_adega_tenant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_adega_inventory_segment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_adega_tenant(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Modulo de estoque profissional disponivel apenas para estabelecimentos do segmento Adega.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_adega_inventory_segment() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) Saldo consolidado por produto no estabelecimento (inventory_balances)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  available_qty numeric(14, 3) NOT NULL DEFAULT 0,
  reserved_qty numeric(14, 3) NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  min_stock_qty numeric(14, 3) NOT NULL DEFAULT 0 CHECK (min_stock_qty >= 0 AND min_stock_qty <= 1000000),
  average_unit_cost numeric(12, 4) NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0 AND average_unit_cost <= 1000000),
  last_cost_price numeric(12, 4) NOT NULL DEFAULT 0 CHECK (last_cost_price >= 0 AND last_cost_price <= 1000000),
  allow_negative_stock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventory_balances_tenant_product UNIQUE (tenant_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_tenant_product
  ON public.inventory_balances (tenant_id, product_id);

DROP TRIGGER IF EXISTS trg_inventory_balances_segment ON public.inventory_balances;
CREATE TRIGGER trg_inventory_balances_segment
  BEFORE INSERT OR UPDATE ON public.inventory_balances
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

DROP TRIGGER IF EXISTS trg_inventory_balances_lock_tenant ON public.inventory_balances;
CREATE TRIGGER trg_inventory_balances_lock_tenant
  BEFORE UPDATE ON public.inventory_balances
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_inventory_balances_updated_at ON public.inventory_balances;
CREATE TRIGGER trg_inventory_balances_updated_at
  BEFORE UPDATE ON public.inventory_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_balances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inventory_balances TO authenticated;

DROP POLICY IF EXISTS inventory_balances_select_tenant ON public.inventory_balances;
CREATE POLICY inventory_balances_select_tenant
  ON public.inventory_balances
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

-- ----------------------------------------------------------------------------
-- 3) Conversoes configuraveis de embalagens por produto
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_packaging_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  package_label text NOT NULL CHECK (char_length(btrim(package_label)) BETWEEN 1 AND 60),
  package_type text NOT NULL CHECK (package_type IN ('unidade', 'garrafa', 'lata', 'pacote', 'caixa', 'fardo')),
  factor_to_base numeric(12, 3) NOT NULL CHECK (factor_to_base > 0 AND factor_to_base <= 10000),
  is_default_purchase boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_packaging_tenant_product_label
  ON public.inventory_packaging_conversions (tenant_id, product_id, lower(btrim(package_label)));

CREATE INDEX IF NOT EXISTS idx_inventory_packaging_tenant_product
  ON public.inventory_packaging_conversions (tenant_id, product_id);

CREATE OR REPLACE FUNCTION public.validate_inventory_packaging_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Produto nao pertence a este estabelecimento.';
  END IF;

  NEW.package_label := left(btrim(coalesce(NEW.package_label, '')), 60);
  IF char_length(NEW.package_label) = 0 THEN
    RAISE EXCEPTION 'Informe o nome da embalagem de conversao.';
  END IF;
  NEW.package_type := lower(btrim(coalesce(NEW.package_type, 'caixa')));
  NEW.factor_to_base := round(NEW.factor_to_base, 3);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_inventory_packaging_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_inventory_packaging_segment ON public.inventory_packaging_conversions;
CREATE TRIGGER trg_inventory_packaging_segment
  BEFORE INSERT OR UPDATE ON public.inventory_packaging_conversions
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

DROP TRIGGER IF EXISTS trg_inventory_packaging_validate ON public.inventory_packaging_conversions;
CREATE TRIGGER trg_inventory_packaging_validate
  BEFORE INSERT OR UPDATE ON public.inventory_packaging_conversions
  FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_packaging_before_write();

DROP TRIGGER IF EXISTS trg_inventory_packaging_lock_tenant ON public.inventory_packaging_conversions;
CREATE TRIGGER trg_inventory_packaging_lock_tenant
  BEFORE UPDATE ON public.inventory_packaging_conversions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_inventory_packaging_updated_at ON public.inventory_packaging_conversions;
CREATE TRIGGER trg_inventory_packaging_updated_at
  BEFORE UPDATE ON public.inventory_packaging_conversions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.inventory_packaging_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_packaging_conversions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_packaging_conversions TO authenticated;

DROP POLICY IF EXISTS inventory_packaging_select_tenant ON public.inventory_packaging_conversions;
CREATE POLICY inventory_packaging_select_tenant
  ON public.inventory_packaging_conversions
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

DROP POLICY IF EXISTS inventory_packaging_insert_tenant ON public.inventory_packaging_conversions;
CREATE POLICY inventory_packaging_insert_tenant
  ON public.inventory_packaging_conversions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

DROP POLICY IF EXISTS inventory_packaging_update_tenant ON public.inventory_packaging_conversions;
CREATE POLICY inventory_packaging_update_tenant
  ON public.inventory_packaging_conversions
  FOR UPDATE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  )
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

DROP POLICY IF EXISTS inventory_packaging_delete_tenant ON public.inventory_packaging_conversions;
CREATE POLICY inventory_packaging_delete_tenant
  ON public.inventory_packaging_conversions
  FOR DELETE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

-- ----------------------------------------------------------------------------
-- 4) Fornecedores (suppliers) e vinculos Produto x Fornecedor (product_suppliers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  trade_name text NOT NULL DEFAULT '' CHECK (char_length(trade_name) <= 120),
  document text NOT NULL DEFAULT '' CHECK (char_length(document) <= 32),
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 32),
  whatsapp text NOT NULL DEFAULT '' CHECK (char_length(whatsapp) <= 32),
  email text NOT NULL DEFAULT '' CHECK (char_length(email) <= 120),
  address text NOT NULL DEFAULT '' CHECK (char_length(address) <= 300),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 600),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_name
  ON public.suppliers (tenant_id, lower(name));

CREATE OR REPLACE FUNCTION public.validate_supplier_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.name := left(btrim(regexp_replace(coalesce(NEW.name, ''), '\s+', ' ', 'g')), 120);
  IF char_length(NEW.name) < 2 THEN
    RAISE EXCEPTION 'Informe o nome do fornecedor (minimo 2 caracteres).';
  END IF;
  NEW.trade_name := left(btrim(coalesce(NEW.trade_name, '')), 120);
  NEW.document := left(btrim(coalesce(NEW.document, '')), 32);
  NEW.phone := left(btrim(coalesce(NEW.phone, '')), 32);
  NEW.whatsapp := left(btrim(coalesce(NEW.whatsapp, '')), 32);
  NEW.email := left(btrim(coalesce(NEW.email, '')), 120);
  NEW.address := left(btrim(coalesce(NEW.address, '')), 300);
  NEW.notes := left(btrim(coalesce(NEW.notes, '')), 600);
  NEW.active := coalesce(NEW.active, true);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_supplier_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_suppliers_segment ON public.suppliers;
CREATE TRIGGER trg_suppliers_segment
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

DROP TRIGGER IF EXISTS trg_suppliers_validate ON public.suppliers;
CREATE TRIGGER trg_suppliers_validate
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_before_write();

DROP TRIGGER IF EXISTS trg_suppliers_lock_tenant ON public.suppliers;
CREATE TRIGGER trg_suppliers_lock_tenant
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.suppliers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suppliers TO authenticated;

DROP POLICY IF EXISTS suppliers_select_tenant ON public.suppliers;
CREATE POLICY suppliers_select_tenant
  ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

DROP POLICY IF EXISTS suppliers_insert_tenant ON public.suppliers;
CREATE POLICY suppliers_insert_tenant
  ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

DROP POLICY IF EXISTS suppliers_update_tenant ON public.suppliers;
CREATE POLICY suppliers_update_tenant
  ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  )
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

DROP POLICY IF EXISTS suppliers_delete_tenant ON public.suppliers;
CREATE POLICY suppliers_delete_tenant
  ON public.suppliers
  FOR DELETE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

-- Vinculos Produto <-> Fornecedor
CREATE TABLE IF NOT EXISTS public.product_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_sku text NOT NULL DEFAULT '' CHECK (char_length(supplier_sku) <= 60),
  last_unit_cost numeric(12, 4) NOT NULL DEFAULT 0 CHECK (last_unit_cost >= 0 AND last_unit_cost <= 1000000),
  is_preferred boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_suppliers_tenant_pair UNIQUE (tenant_id, product_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_product_suppliers_tenant_product
  ON public.product_suppliers (tenant_id, product_id);

CREATE INDEX IF NOT EXISTS idx_product_suppliers_tenant_supplier
  ON public.product_suppliers (tenant_id, supplier_id);

CREATE OR REPLACE FUNCTION public.validate_product_supplier_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Produto nao pertence a este estabelecimento.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = NEW.supplier_id AND s.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Fornecedor nao pertence a este estabelecimento.';
  END IF;
  NEW.supplier_sku := left(btrim(coalesce(NEW.supplier_sku, '')), 60);
  NEW.notes := left(btrim(coalesce(NEW.notes, '')), 300);
  NEW.last_unit_cost := round(greatest(0, coalesce(NEW.last_unit_cost, 0)), 4);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_product_supplier_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_suppliers_segment ON public.product_suppliers;
CREATE TRIGGER trg_product_suppliers_segment
  BEFORE INSERT OR UPDATE ON public.product_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

DROP TRIGGER IF EXISTS trg_product_suppliers_validate ON public.product_suppliers;
CREATE TRIGGER trg_product_suppliers_validate
  BEFORE INSERT OR UPDATE ON public.product_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_supplier_before_write();

DROP TRIGGER IF EXISTS trg_product_suppliers_lock_tenant ON public.product_suppliers;
CREATE TRIGGER trg_product_suppliers_lock_tenant
  BEFORE UPDATE ON public.product_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_product_suppliers_updated_at ON public.product_suppliers;
CREATE TRIGGER trg_product_suppliers_updated_at
  BEFORE UPDATE ON public.product_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_suppliers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_suppliers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_suppliers TO authenticated;

DROP POLICY IF EXISTS product_suppliers_select_tenant ON public.product_suppliers;
CREATE POLICY product_suppliers_select_tenant
  ON public.product_suppliers
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

DROP POLICY IF EXISTS product_suppliers_insert_tenant ON public.product_suppliers;
CREATE POLICY product_suppliers_insert_tenant
  ON public.product_suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

DROP POLICY IF EXISTS product_suppliers_update_tenant ON public.product_suppliers;
CREATE POLICY product_suppliers_update_tenant
  ON public.product_suppliers
  FOR UPDATE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  )
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

DROP POLICY IF EXISTS product_suppliers_delete_tenant ON public.product_suppliers;
CREATE POLICY product_suppliers_delete_tenant
  ON public.product_suppliers
  FOR DELETE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

-- ----------------------------------------------------------------------------
-- 5) Ledger imutavel de movimentacoes (inventory_movements)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (
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
      'return_in'
    )
  ),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  input_quantity numeric(14, 3) NOT NULL CHECK (input_quantity > 0),
  input_unit text NOT NULL CHECK (char_length(btrim(input_unit)) BETWEEN 1 AND 60),
  conversion_factor_used numeric(12, 3) NOT NULL CHECK (conversion_factor_used > 0),
  base_quantity numeric(14, 3) NOT NULL CHECK (base_quantity > 0),
  previous_balance numeric(14, 3) NOT NULL,
  new_balance numeric(14, 3) NOT NULL,
  unit_cost numeric(12, 4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  previous_avg_cost numeric(12, 4) NOT NULL DEFAULT 0 CHECK (previous_avg_cost >= 0),
  new_avg_cost numeric(12, 4) NOT NULL DEFAULT 0 CHECK (new_avg_cost >= 0),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 600),
  origin_type text NOT NULL CHECK (origin_type IN ('manual', 'purchase_receipt', 'inventory_count', 'adjustment', 'return')),
  origin_id uuid,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  packaging_conversion_id uuid REFERENCES public.inventory_packaging_conversions(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 160),
  actor_user_id uuid,
  actor_email text NOT NULL DEFAULT '' CHECK (char_length(actor_email) <= 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventory_movements_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_tenant_created
  ON public.inventory_movements (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_tenant_product
  ON public.inventory_movements (tenant_id, product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_tenant_supplier
  ON public.inventory_movements (tenant_id, supplier_id, created_at DESC)
  WHERE supplier_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_inventory_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Registros do historico de estoque sao imutaveis.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Registros do historico de estoque nao podem ser excluidos.';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_inventory_movement_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_inventory_movements_segment ON public.inventory_movements;
CREATE TRIGGER trg_inventory_movements_segment
  BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

DROP TRIGGER IF EXISTS trg_inventory_movements_immutable ON public.inventory_movements;
CREATE TRIGGER trg_inventory_movements_immutable
  BEFORE UPDATE OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_inventory_movement_mutation();

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inventory_movements TO authenticated;

DROP POLICY IF EXISTS inventory_movements_select_tenant ON public.inventory_movements;
CREATE POLICY inventory_movements_select_tenant
  ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

-- ----------------------------------------------------------------------------
-- 6) Compras (purchase_orders, purchase_order_items) e Recebimentos parciais/totais
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number integer NOT NULL CHECK (order_number > 0),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'partially_received', 'received', 'cancelled')),
  payment_terms text NOT NULL DEFAULT '' CHECK (char_length(payment_terms) <= 120),
  expected_delivery_date date,
  discount_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  additional_expenses numeric(12, 2) NOT NULL DEFAULT 0 CHECK (additional_expenses >= 0),
  items_subtotal numeric(14, 2) NOT NULL DEFAULT 0 CHECK (items_subtotal >= 0),
  total_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 800),
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 160),
  cancelled_reason text NOT NULL DEFAULT '' CHECK (char_length(cancelled_reason) <= 300),
  cancelled_at timestamptz,
  created_by_user_id uuid,
  created_by_email text NOT NULL DEFAULT '' CHECK (char_length(created_by_email) <= 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_orders_tenant_number UNIQUE (tenant_id, order_number),
  CONSTRAINT uq_purchase_orders_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_status
  ON public.purchase_orders (tenant_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_purchase_orders_segment ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_segment
  BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

DROP TRIGGER IF EXISTS trg_purchase_orders_lock_tenant ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_lock_tenant
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_orders TO authenticated;

DROP POLICY IF EXISTS purchase_orders_select_tenant ON public.purchase_orders;
CREATE POLICY purchase_orders_select_tenant
  ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  packaging_conversion_id uuid REFERENCES public.inventory_packaging_conversions(id) ON DELETE SET NULL,
  unit_label text NOT NULL CHECK (char_length(btrim(unit_label)) BETWEEN 1 AND 60),
  conversion_factor numeric(12, 3) NOT NULL CHECK (conversion_factor > 0),
  ordered_qty numeric(14, 3) NOT NULL CHECK (ordered_qty > 0),
  ordered_base_qty numeric(14, 3) NOT NULL CHECK (ordered_base_qty > 0),
  received_base_qty numeric(14, 3) NOT NULL DEFAULT 0 CHECK (received_base_qty >= 0),
  unit_cost numeric(12, 4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_tenant_order
  ON public.purchase_order_items (tenant_id, purchase_order_id);

DROP TRIGGER IF EXISTS trg_purchase_order_items_segment ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_segment
  BEFORE INSERT OR UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

DROP TRIGGER IF EXISTS trg_purchase_order_items_lock_tenant ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_lock_tenant
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_purchase_order_items_updated_at ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_updated_at
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_order_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_order_items TO authenticated;

DROP POLICY IF EXISTS purchase_order_items_select_tenant ON public.purchase_order_items;
CREATE POLICY purchase_order_items_select_tenant
  ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  receipt_number integer NOT NULL CHECK (receipt_number > 0),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 600),
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 160),
  received_by_user_id uuid,
  received_by_email text NOT NULL DEFAULT '' CHECK (char_length(received_by_email) <= 160),
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_receipts_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_tenant_order
  ON public.purchase_receipts (tenant_id, purchase_order_id, received_at DESC);

DROP TRIGGER IF EXISTS trg_purchase_receipts_segment ON public.purchase_receipts;
CREATE TRIGGER trg_purchase_receipts_segment
  BEFORE INSERT ON public.purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_receipts TO authenticated;

DROP POLICY IF EXISTS purchase_receipts_select_tenant ON public.purchase_receipts;
CREATE POLICY purchase_receipts_select_tenant
  ON public.purchase_receipts
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

CREATE TABLE IF NOT EXISTS public.purchase_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  received_qty numeric(14, 3) NOT NULL CHECK (received_qty > 0),
  unit_label text NOT NULL CHECK (char_length(btrim(unit_label)) BETWEEN 1 AND 60),
  conversion_factor numeric(12, 3) NOT NULL CHECK (conversion_factor > 0),
  received_base_qty numeric(14, 3) NOT NULL CHECK (received_base_qty > 0),
  unit_cost numeric(12, 4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  movement_id uuid NOT NULL REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_tenant_receipt
  ON public.purchase_receipt_items (tenant_id, receipt_id);

DROP TRIGGER IF EXISTS trg_purchase_receipt_items_segment ON public.purchase_receipt_items;
CREATE TRIGGER trg_purchase_receipt_items_segment
  BEFORE INSERT ON public.purchase_receipt_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_receipt_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_receipt_items TO authenticated;

DROP POLICY IF EXISTS purchase_receipt_items_select_tenant ON public.purchase_receipt_items;
CREATE POLICY purchase_receipt_items_select_tenant
  ON public.purchase_receipt_items
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

-- ----------------------------------------------------------------------------
-- 7) Inventario fisico / contagem ciclica (inventory_counts & items)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  count_number integer NOT NULL CHECK (count_number > 0),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finalized', 'cancelled')),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 600),
  started_by_user_id uuid,
  started_by_email text NOT NULL DEFAULT '' CHECK (char_length(started_by_email) <= 160),
  finalized_by_user_id uuid,
  finalized_by_email text NOT NULL DEFAULT '' CHECK (char_length(finalized_by_email) <= 160),
  finalized_at timestamptz,
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventory_counts_tenant_number UNIQUE (tenant_id, count_number),
  CONSTRAINT uq_inventory_counts_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_tenant_status
  ON public.inventory_counts (tenant_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_inventory_counts_segment ON public.inventory_counts;
CREATE TRIGGER trg_inventory_counts_segment
  BEFORE INSERT OR UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

DROP TRIGGER IF EXISTS trg_inventory_counts_lock_tenant ON public.inventory_counts;
CREATE TRIGGER trg_inventory_counts_lock_tenant
  BEFORE UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_inventory_counts_updated_at ON public.inventory_counts;
CREATE TRIGGER trg_inventory_counts_updated_at
  BEFORE UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inventory_counts TO authenticated;

DROP POLICY IF EXISTS inventory_counts_select_tenant ON public.inventory_counts;
CREATE POLICY inventory_counts_select_tenant
  ON public.inventory_counts
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

CREATE TABLE IF NOT EXISTS public.inventory_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  expected_qty numeric(14, 3) NOT NULL DEFAULT 0,
  counted_qty numeric(14, 3),
  difference_qty numeric(14, 3) NOT NULL DEFAULT 0,
  unit_cost_snapshot numeric(12, 4) NOT NULL DEFAULT 0,
  estimated_difference_value numeric(14, 2) NOT NULL DEFAULT 0,
  adjustment_movement_id uuid REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventory_count_items_pair UNIQUE (tenant_id, count_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_items_tenant_count
  ON public.inventory_count_items (tenant_id, count_id);

DROP TRIGGER IF EXISTS trg_inventory_count_items_segment ON public.inventory_count_items;
CREATE TRIGGER trg_inventory_count_items_segment
  BEFORE INSERT OR UPDATE ON public.inventory_count_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_adega_inventory_segment();

DROP TRIGGER IF EXISTS trg_inventory_count_items_lock_tenant ON public.inventory_count_items;
CREATE TRIGGER trg_inventory_count_items_lock_tenant
  BEFORE UPDATE ON public.inventory_count_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_inventory_count_items_updated_at ON public.inventory_count_items;
CREATE TRIGGER trg_inventory_count_items_updated_at
  BEFORE UPDATE ON public.inventory_count_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_count_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inventory_count_items TO authenticated;

DROP POLICY IF EXISTS inventory_count_items_select_tenant ON public.inventory_count_items;
CREATE POLICY inventory_count_items_select_tenant
  ON public.inventory_count_items
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND public.is_adega_tenant(tenant_id)
  );

-- ----------------------------------------------------------------------------
-- 8) Funcoes RPC atomicas (SECURITY DEFINER + FOR UPDATE + Idempotencia)
-- ----------------------------------------------------------------------------

-- 8.1) Configuracao de estoque minimo e permissao de saldo negativo por produto
CREATE OR REPLACE FUNCTION public.inventory_upsert_product_config(
  p_tenant_id uuid,
  p_product_id uuid,
  p_min_stock_qty numeric,
  p_allow_negative_stock boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_row public.inventory_balances%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id)
     OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente para configurar estoque deste estabelecimento.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Modulo de estoque disponivel apenas para o segmento Adega.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Produto nao encontrado neste estabelecimento.';
  END IF;
  IF p_min_stock_qty IS NULL OR p_min_stock_qty < 0 OR p_min_stock_qty > 1000000 THEN
    RAISE EXCEPTION 'Estoque minimo invalido.';
  END IF;

  INSERT INTO public.inventory_balances (
    tenant_id,
    product_id,
    available_qty,
    reserved_qty,
    min_stock_qty,
    average_unit_cost,
    last_cost_price,
    allow_negative_stock
  )
  VALUES (
    p_tenant_id,
    p_product_id,
    0,
    0,
    round(p_min_stock_qty, 3),
    0,
    0,
    coalesce(p_allow_negative_stock, false)
  )
  ON CONFLICT (tenant_id, product_id)
  DO UPDATE SET
    min_stock_qty = round(EXCLUDED.min_stock_qty, 3),
    allow_negative_stock = EXCLUDED.allow_negative_stock
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_upsert_product_config(uuid, uuid, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_upsert_product_config(uuid, uuid, numeric, boolean) TO authenticated;

-- 8.2) Registro atomico de movimentacao manual (entrada, saida, perda, ajuste, devolucao)
CREATE OR REPLACE FUNCTION public.inventory_record_movement(
  p_tenant_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_input_quantity numeric,
  p_input_unit text DEFAULT 'unidade',
  p_conversion_factor numeric DEFAULT 1,
  p_total_cost numeric DEFAULT NULL,
  p_reason text DEFAULT '',
  p_notes text DEFAULT '',
  p_supplier_id uuid DEFAULT NULL,
  p_packaging_conversion_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_allow_negative_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), '');
  v_key text;
  v_existing public.inventory_movements%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_direction text;
  v_origin_type text;
  v_factor numeric(12, 3);
  v_input_qty numeric(14, 3);
  v_base_qty numeric(14, 3);
  v_prev_qty numeric(14, 3);
  v_new_qty numeric(14, 3);
  v_prev_avg numeric(12, 4);
  v_new_avg numeric(12, 4);
  v_unit_cost numeric(12, 4);
  v_total_cost numeric(14, 2);
  v_movement_id uuid;
  v_pkg public.inventory_packaging_conversions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id)
     OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente para movimentar estoque.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Modulo de estoque disponivel apenas para o segmento Adega.';
  END IF;

  IF p_movement_type NOT IN (
    'manual_entry',
    'manual_exit',
    'loss',
    'damage',
    'expiry',
    'internal_consumption',
    'adjustment_in',
    'adjustment_out',
    'return_in'
  ) THEN
    RAISE EXCEPTION 'Tipo de movimentacao manual invalido: %', coalesce(p_movement_type, '');
  END IF;

  IF p_input_quantity IS NULL OR p_input_quantity <= 0 OR p_input_quantity > 1000000 THEN
    RAISE EXCEPTION 'Quantidade movimentada deve ser maior que zero.';
  END IF;

  v_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 160), '');
  IF v_key IS NULL OR char_length(v_key) < 8 THEN
    v_key := 'mov_' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':mov:' || v_key));

  SELECT * INTO v_existing
  FROM public.inventory_movements
  WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'duplicate', true,
      'movementId', v_existing.id,
      'previousBalance', v_existing.previous_balance,
      'newBalance', v_existing.new_balance
    );
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto nao encontrado neste estabelecimento.';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = p_supplier_id AND s.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Fornecedor nao pertence a este estabelecimento.';
  END IF;

  IF p_packaging_conversion_id IS NOT NULL THEN
    SELECT * INTO v_pkg
    FROM public.inventory_packaging_conversions c
    WHERE c.id = p_packaging_conversion_id
      AND c.tenant_id = p_tenant_id
      AND c.product_id = p_product_id
      AND c.active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conversao de embalagem nao encontrada ou inativa.';
    END IF;
    v_factor := v_pkg.factor_to_base;
  ELSE
    IF p_conversion_factor IS NULL OR p_conversion_factor <= 0 OR p_conversion_factor > 10000 THEN
      RAISE EXCEPTION 'Fator de conversao deve ser maior que zero.';
    END IF;
    v_factor := round(p_conversion_factor, 3);
  END IF;

  v_input_qty := round(p_input_quantity, 3);
  v_base_qty := round(v_input_qty * v_factor, 3);
  IF v_base_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade convertida para unidade base invalida.';
  END IF;

  IF p_movement_type IN ('manual_entry', 'adjustment_in', 'return_in') THEN
    v_direction := 'in';
  ELSE
    v_direction := 'out';
  END IF;

  v_origin_type := CASE
    WHEN p_movement_type IN ('adjustment_in', 'adjustment_out') THEN 'adjustment'
    WHEN p_movement_type = 'return_in' THEN 'return'
    ELSE 'manual'
  END;

  -- Garante existencia e bloqueio exclusivo (FOR UPDATE) do saldo do produto
  INSERT INTO public.inventory_balances (
    tenant_id, product_id, available_qty, reserved_qty, min_stock_qty,
    average_unit_cost, last_cost_price, allow_negative_stock
  )
  VALUES (
    p_tenant_id, p_product_id, 0, 0, 0,
    coalesce(v_product.cost_price, 0), coalesce(v_product.cost_price, 0), false
  )
  ON CONFLICT (tenant_id, product_id) DO NOTHING;

  SELECT * INTO v_balance
  FROM public.inventory_balances
  WHERE tenant_id = p_tenant_id AND product_id = p_product_id
  FOR UPDATE;

  v_prev_qty := v_balance.available_qty;
  v_prev_avg := v_balance.average_unit_cost;

  IF v_direction = 'in' THEN
    v_new_qty := round(v_prev_qty + v_base_qty, 3);

    IF p_total_cost IS NOT NULL THEN
      IF p_total_cost < 0 OR p_total_cost > 10000000 THEN
        RAISE EXCEPTION 'Custo total informado invalido.';
      END IF;
      v_total_cost := round(p_total_cost, 2);
      v_unit_cost := round(v_total_cost / v_base_qty, 4);

      IF v_prev_qty <= 0 THEN
        v_new_avg := v_unit_cost;
      ELSE
        v_new_avg := round(((v_prev_qty * v_prev_avg) + v_total_cost) / (v_prev_qty + v_base_qty), 4);
      END IF;
    ELSE
      v_unit_cost := v_prev_avg;
      v_total_cost := round(v_base_qty * v_unit_cost, 2);
      v_new_avg := v_prev_avg;
    END IF;

    UPDATE public.inventory_balances
    SET
      available_qty = v_new_qty,
      average_unit_cost = v_new_avg,
      last_cost_price = CASE WHEN p_total_cost IS NOT NULL THEN v_unit_cost ELSE last_cost_price END
    WHERE id = v_balance.id;
  ELSE
    v_new_qty := round(v_prev_qty - v_base_qty, 3);
    IF v_new_qty < 0 THEN
      IF NOT (v_balance.allow_negative_stock AND coalesce(p_allow_negative_override, false)) THEN
        RAISE EXCEPTION 'Estoque insuficiente para "%" (disponivel: %, solicitado: %).',
          v_product.name, v_prev_qty, v_base_qty;
      END IF;
    END IF;

    v_unit_cost := v_prev_avg;
    v_total_cost := round(v_base_qty * v_unit_cost, 2);
    v_new_avg := v_prev_avg;

    UPDATE public.inventory_balances
    SET available_qty = v_new_qty
    WHERE id = v_balance.id;
  END IF;

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
    supplier_id,
    packaging_conversion_id,
    idempotency_key,
    actor_user_id,
    actor_email
  )
  VALUES (
    p_tenant_id,
    p_product_id,
    p_movement_type,
    v_direction,
    v_input_qty,
    coalesce(nullif(left(btrim(coalesce(p_input_unit, '')), 60), ''), coalesce(v_pkg.package_label, v_product.sale_unit, 'unidade')),
    v_factor,
    v_base_qty,
    v_prev_qty,
    v_new_qty,
    v_unit_cost,
    v_total_cost,
    v_prev_avg,
    v_new_avg,
    left(btrim(coalesce(p_reason, '')), 300),
    left(btrim(coalesce(p_notes, '')), 600),
    v_origin_type,
    NULL,
    p_supplier_id,
    p_packaging_conversion_id,
    v_key,
    v_user_id,
    left(v_user_email, 160)
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'movementId', v_movement_id,
    'previousBalance', v_prev_qty,
    'newBalance', v_new_qty,
    'newAverageUnitCost', v_new_avg
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_record_movement(uuid, uuid, text, numeric, text, numeric, numeric, text, text, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_record_movement(uuid, uuid, text, numeric, text, numeric, numeric, text, text, uuid, uuid, text, boolean) TO authenticated;

-- 8.3) Criacao de Pedido de Compra (rascunho ou pendente; NAO altera saldo!)
CREATE OR REPLACE FUNCTION public.inventory_create_purchase_order(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_status text DEFAULT 'pending',
  p_payment_terms text DEFAULT '',
  p_expected_delivery_date date DEFAULT NULL,
  p_discount_amount numeric DEFAULT 0,
  p_additional_expenses numeric DEFAULT 0,
  p_notes text DEFAULT '',
  p_items jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), '');
  v_key text;
  v_existing public.purchase_orders%ROWTYPE;
  v_next_number integer;
  v_order_id uuid;
  v_subtotal numeric(14, 2) := 0;
  v_discount numeric(12, 2);
  v_expenses numeric(12, 2);
  v_total numeric(14, 2);
  v_item jsonb;
  v_product_id uuid;
  v_pkg_id uuid;
  v_unit_label text;
  v_factor numeric(12, 3);
  v_qty numeric(14, 3);
  v_base_qty numeric(14, 3);
  v_unit_cost numeric(12, 4);
  v_line_total numeric(14, 2);
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id)
     OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente para registrar compras.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Modulo de compras disponivel apenas para o segmento Adega.';
  END IF;
  IF p_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Pedido de compra inicial deve ser rascunho ou pendente.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = p_supplier_id AND s.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Fornecedor nao encontrado neste estabelecimento.';
  END IF;
  IF jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Inclua ao menos um item no pedido de compra.';
  END IF;

  v_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 160), '');
  IF v_key IS NULL OR char_length(v_key) < 8 THEN
    v_key := 'po_' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':po:' || v_key));

  SELECT * INTO v_existing
  FROM public.purchase_orders
  WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'duplicate', true,
      'purchaseOrderId', v_existing.id,
      'orderNumber', v_existing.order_number
    );
  END IF;

  v_discount := round(greatest(0, coalesce(p_discount_amount, 0)), 2);
  v_expenses := round(greatest(0, coalesce(p_additional_expenses, 0)), 2);

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':po_seq'));
  SELECT coalesce(max(order_number), 0) + 1 INTO v_next_number
  FROM public.purchase_orders
  WHERE tenant_id = p_tenant_id;

  INSERT INTO public.purchase_orders (
    tenant_id,
    order_number,
    supplier_id,
    status,
    payment_terms,
    expected_delivery_date,
    discount_amount,
    additional_expenses,
    items_subtotal,
    total_amount,
    notes,
    idempotency_key,
    created_by_user_id,
    created_by_email
  )
  VALUES (
    p_tenant_id,
    v_next_number,
    p_supplier_id,
    p_status,
    left(btrim(coalesce(p_payment_terms, '')), 120),
    p_expected_delivery_date,
    v_discount,
    v_expenses,
    0,
    0,
    left(btrim(coalesce(p_notes, '')), 800),
    v_key,
    v_user_id,
    left(v_user_email, 160)
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_count := v_count + 1;
    v_product_id := (v_item ->> 'productId')::uuid;
    v_pkg_id := NULLIF(coalesce(v_item ->> 'packagingConversionId', ''), '')::uuid;
    v_unit_label := coalesce(nullif(left(btrim(coalesce(v_item ->> 'unitLabel', '')), 60), ''), 'unidade');
    v_factor := round(greatest(0.001, coalesce((v_item ->> 'conversionFactor')::numeric, 1)), 3);
    v_qty := round(coalesce((v_item ->> 'orderedQty')::numeric, 0), 3);
    v_unit_cost := round(greatest(0, coalesce((v_item ->> 'unitCost')::numeric, 0)), 4);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade comprada do item % deve ser maior que zero.', v_count;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND p.tenant_id = p_tenant_id
    ) THEN
      RAISE EXCEPTION 'Produto informado no item % nao pertence a este estabelecimento.', v_count;
    END IF;
    IF v_pkg_id IS NOT NULL THEN
      SELECT factor_to_base INTO v_factor
      FROM public.inventory_packaging_conversions c
      WHERE c.id = v_pkg_id AND c.tenant_id = p_tenant_id AND c.product_id = v_product_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Embalagem informada no item % nao encontrada.', v_count;
      END IF;
    END IF;

    v_base_qty := round(v_qty * v_factor, 3);
    v_line_total := round(v_qty * v_unit_cost, 2);
    v_subtotal := round(v_subtotal + v_line_total, 2);

    INSERT INTO public.purchase_order_items (
      tenant_id,
      purchase_order_id,
      product_id,
      packaging_conversion_id,
      unit_label,
      conversion_factor,
      ordered_qty,
      ordered_base_qty,
      received_base_qty,
      unit_cost,
      total_cost
    )
    VALUES (
      p_tenant_id,
      v_order_id,
      v_product_id,
      v_pkg_id,
      v_unit_label,
      v_factor,
      v_qty,
      v_base_qty,
      0,
      v_unit_cost,
      v_line_total
    );
  END LOOP;

  v_total := round(greatest(0, v_subtotal - v_discount + v_expenses), 2);

  UPDATE public.purchase_orders
  SET
    items_subtotal = v_subtotal,
    total_amount = v_total
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'purchaseOrderId', v_order_id,
    'orderNumber', v_next_number,
    'totalAmount', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_create_purchase_order(uuid, uuid, text, text, date, numeric, numeric, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_create_purchase_order(uuid, uuid, text, text, date, numeric, numeric, text, jsonb, text) TO authenticated;

-- 8.4) Alteracao de status de Pedido de Compra (confirmar pendente ou cancelar sem apagar historico)
CREATE OR REPLACE FUNCTION public.inventory_update_purchase_order_status(
  p_tenant_id uuid,
  p_purchase_order_id uuid,
  p_next_status text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_order public.purchase_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id)
     OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Modulo disponivel apenas para o segmento Adega.';
  END IF;

  SELECT * INTO v_order
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de compra nao encontrado.';
  END IF;

  IF p_next_status = 'pending' THEN
    IF v_order.status <> 'draft' THEN
      RAISE EXCEPTION 'Apenas pedidos em rascunho podem ser enviados para pendente.';
    END IF;
    UPDATE public.purchase_orders
    SET status = 'pending'
    WHERE id = v_order.id;
  ELSIF p_next_status = 'cancelled' THEN
    IF v_order.status IN ('received', 'cancelled') THEN
      RAISE EXCEPTION 'Este pedido de compra nao pode mais ser cancelado.';
    END IF;
    UPDATE public.purchase_orders
    SET
      status = 'cancelled',
      cancelled_reason = left(btrim(coalesce(p_reason, '')), 300),
      cancelled_at = now()
    WHERE id = v_order.id;
  ELSE
    RAISE EXCEPTION 'Transicao de status de compra invalida.';
  END IF;

  RETURN jsonb_build_object('purchaseOrderId', v_order.id, 'status', p_next_status);
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_update_purchase_order_status(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_update_purchase_order_status(uuid, uuid, text, text) TO authenticated;

-- 8.5) Recebimento atomico (parcial ou total) de Pedido de Compra
CREATE OR REPLACE FUNCTION public.inventory_receive_purchase_items(
  p_tenant_id uuid,
  p_purchase_order_id uuid,
  p_items jsonb,
  p_notes text DEFAULT '',
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), '');
  v_key text;
  v_existing public.purchase_receipts%ROWTYPE;
  v_order public.purchase_orders%ROWTYPE;
  v_po_item public.purchase_order_items%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_receipt_id uuid;
  v_receipt_number integer;
  v_req jsonb;
  v_po_item_id uuid;
  v_rec_qty numeric(14, 3);
  v_rec_base_qty numeric(14, 3);
  v_unit_cost_pkg numeric(12, 4);
  v_total_cost numeric(14, 2);
  v_base_unit_cost numeric(12, 4);
  v_prev_qty numeric(14, 3);
  v_new_qty numeric(14, 3);
  v_prev_avg numeric(12, 4);
  v_new_avg numeric(12, 4);
  v_mov_id uuid;
  v_items_processed integer := 0;
  v_remaining_open integer := 0;
  v_next_order_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id)
     OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente para receber compras.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Modulo disponivel apenas para o segmento Adega.';
  END IF;
  IF jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item recebido.';
  END IF;

  v_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 160), '');
  IF v_key IS NULL OR char_length(v_key) < 8 THEN
    v_key := 'rec_' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':rec:' || v_key));

  SELECT * INTO v_existing
  FROM public.purchase_receipts
  WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'duplicate', true,
      'receiptId', v_existing.id,
      'receiptNumber', v_existing.receipt_number
    );
  END IF;

  SELECT * INTO v_order
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de compra nao encontrado.';
  END IF;
  IF v_order.status NOT IN ('pending', 'partially_received') THEN
    RAISE EXCEPTION 'Apenas pedidos pendentes ou parcialmente recebidos podem receber mercadorias (status atual: %).', v_order.status;
  END IF;

  SELECT coalesce(max(receipt_number), 0) + 1 INTO v_receipt_number
  FROM public.purchase_receipts
  WHERE tenant_id = p_tenant_id AND purchase_order_id = v_order.id;

  INSERT INTO public.purchase_receipts (
    tenant_id,
    purchase_order_id,
    receipt_number,
    notes,
    idempotency_key,
    received_by_user_id,
    received_by_email
  )
  VALUES (
    p_tenant_id,
    v_order.id,
    v_receipt_number,
    left(btrim(coalesce(p_notes, '')), 600),
    v_key,
    v_user_id,
    left(v_user_email, 160)
  )
  RETURNING id INTO v_receipt_id;

  FOR v_req IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_po_item_id := (v_req ->> 'purchaseOrderItemId')::uuid;
    v_rec_qty := round(coalesce((v_req ->> 'receivedQty')::numeric, 0), 3);

    IF v_rec_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_po_item
    FROM public.purchase_order_items
    WHERE id = v_po_item_id
      AND tenant_id = p_tenant_id
      AND purchase_order_id = v_order.id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item de compra nao encontrado neste pedido.';
    END IF;

    v_rec_base_qty := round(v_rec_qty * v_po_item.conversion_factor, 3);
    IF (v_po_item.received_base_qty + v_rec_base_qty) > (v_po_item.ordered_base_qty + 0.001) THEN
      RAISE EXCEPTION 'Quantidade recebida excede o saldo pendente do item.';
    END IF;

    -- Ajusta eventual centesimo/milesimo residual para fechar exato quando finalizando o saldo restante
    IF abs((v_po_item.received_base_qty + v_rec_base_qty) - v_po_item.ordered_base_qty) <= 0.001 THEN
      v_rec_base_qty := round(v_po_item.ordered_base_qty - v_po_item.received_base_qty, 3);
    END IF;

    v_unit_cost_pkg := round(greatest(0, coalesce((v_req ->> 'unitCost')::numeric, v_po_item.unit_cost)), 4);
    v_total_cost := round(v_rec_qty * v_unit_cost_pkg, 2);
    v_base_unit_cost := round(v_total_cost / greatest(v_rec_base_qty, 0.001), 4);

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_po_item.product_id AND tenant_id = p_tenant_id;

    INSERT INTO public.inventory_balances (
      tenant_id, product_id, available_qty, reserved_qty, min_stock_qty,
      average_unit_cost, last_cost_price, allow_negative_stock
    )
    VALUES (
      p_tenant_id, v_po_item.product_id, 0, 0, 0,
      coalesce(v_product.cost_price, 0), coalesce(v_product.cost_price, 0), false
    )
    ON CONFLICT (tenant_id, product_id) DO NOTHING;

    SELECT * INTO v_balance
    FROM public.inventory_balances
    WHERE tenant_id = p_tenant_id AND product_id = v_po_item.product_id
    FOR UPDATE;

    v_prev_qty := v_balance.available_qty;
    v_prev_avg := v_balance.average_unit_cost;
    v_new_qty := round(v_prev_qty + v_rec_base_qty, 3);

    IF v_prev_qty <= 0 THEN
      v_new_avg := v_base_unit_cost;
    ELSE
      v_new_avg := round(((v_prev_qty * v_prev_avg) + v_total_cost) / (v_prev_qty + v_rec_base_qty), 4);
    END IF;

    UPDATE public.inventory_balances
    SET
      available_qty = v_new_qty,
      average_unit_cost = v_new_avg,
      last_cost_price = v_base_unit_cost
    WHERE id = v_balance.id;

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
      supplier_id,
      packaging_conversion_id,
      idempotency_key,
      actor_user_id,
      actor_email
    )
    VALUES (
      p_tenant_id,
      v_po_item.product_id,
      'purchase_receipt',
      'in',
      v_rec_qty,
      v_po_item.unit_label,
      v_po_item.conversion_factor,
      v_rec_base_qty,
      v_prev_qty,
      v_new_qty,
      v_base_unit_cost,
      v_total_cost,
      v_prev_avg,
      v_new_avg,
      'Recebimento Compra #' || v_order.order_number || ' (Rec. #' || v_receipt_number || ')',
      left(btrim(coalesce(p_notes, '')), 600),
      'purchase_receipt',
      v_receipt_id,
      v_order.supplier_id,
      v_po_item.packaging_conversion_id,
      v_key || ':' || v_po_item.id::text,
      v_user_id,
      left(v_user_email, 160)
    )
    RETURNING id INTO v_mov_id;

    INSERT INTO public.purchase_receipt_items (
      tenant_id,
      receipt_id,
      purchase_order_item_id,
      product_id,
      received_qty,
      unit_label,
      conversion_factor,
      received_base_qty,
      unit_cost,
      total_cost,
      movement_id
    )
    VALUES (
      p_tenant_id,
      v_receipt_id,
      v_po_item.id,
      v_po_item.product_id,
      v_rec_qty,
      v_po_item.unit_label,
      v_po_item.conversion_factor,
      v_rec_base_qty,
      v_base_unit_cost,
      v_total_cost,
      v_mov_id
    );

    UPDATE public.purchase_order_items
    SET received_base_qty = round(received_base_qty + v_rec_base_qty, 3)
    WHERE id = v_po_item.id;

    UPDATE public.product_suppliers
    SET last_unit_cost = v_base_unit_cost
    WHERE tenant_id = p_tenant_id
      AND product_id = v_po_item.product_id
      AND supplier_id = v_order.supplier_id;

    v_items_processed := v_items_processed + 1;
  END LOOP;

  IF v_items_processed = 0 THEN
    RAISE EXCEPTION 'Nenhuma quantidade valida maior que zero foi informada para recebimento.';
  END IF;

  SELECT count(*) INTO v_remaining_open
  FROM public.purchase_order_items
  WHERE purchase_order_id = v_order.id
    AND received_base_qty < (ordered_base_qty - 0.001);

  v_next_order_status := CASE WHEN v_remaining_open = 0 THEN 'received' ELSE 'partially_received' END;

  UPDATE public.purchase_orders
  SET status = v_next_order_status
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'receiptId', v_receipt_id,
    'receiptNumber', v_receipt_number,
    'orderStatus', v_next_order_status,
    'itemsProcessed', v_items_processed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_receive_purchase_items(uuid, uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_receive_purchase_items(uuid, uuid, jsonb, text, text) TO authenticated;

-- 8.6) Inventario fisico — iniciar, salvar contagens parciais, finalizar atomicamente e cancelar
CREATE OR REPLACE FUNCTION public.inventory_start_count(
  p_tenant_id uuid,
  p_title text,
  p_product_ids uuid[] DEFAULT NULL,
  p_notes text DEFAULT '',
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), '');
  v_key text;
  v_existing public.inventory_counts%ROWTYPE;
  v_next_number integer;
  v_count_id uuid;
  v_clean_title text;
  v_inserted_items integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id)
     OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente para iniciar inventario.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Modulo disponivel apenas para o segmento Adega.';
  END IF;

  v_clean_title := left(btrim(coalesce(p_title, '')), 120);
  IF char_length(v_clean_title) < 2 THEN
    RAISE EXCEPTION 'Informe um titulo valido para o inventario.';
  END IF;

  v_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 160), '');
  IF v_key IS NULL OR char_length(v_key) < 8 THEN
    v_key := 'cnt_' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':cnt:' || v_key));

  SELECT * INTO v_existing
  FROM public.inventory_counts
  WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'duplicate', true,
      'countId', v_existing.id,
      'countNumber', v_existing.count_number
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':cnt_seq'));
  SELECT coalesce(max(count_number), 0) + 1 INTO v_next_number
  FROM public.inventory_counts
  WHERE tenant_id = p_tenant_id;

  INSERT INTO public.inventory_counts (
    tenant_id,
    count_number,
    title,
    status,
    notes,
    started_by_user_id,
    started_by_email,
    idempotency_key
  )
  VALUES (
    p_tenant_id,
    v_next_number,
    v_clean_title,
    'open',
    left(btrim(coalesce(p_notes, '')), 600),
    v_user_id,
    left(v_user_email, 160),
    v_key
  )
  RETURNING id INTO v_count_id;

  INSERT INTO public.inventory_count_items (
    tenant_id,
    count_id,
    product_id,
    expected_qty,
    counted_qty,
    difference_qty,
    unit_cost_snapshot,
    estimated_difference_value
  )
  SELECT
    p_tenant_id,
    v_count_id,
    p.id,
    coalesce(b.available_qty, 0),
    NULL,
    0,
    coalesce(b.average_unit_cost, p.cost_price, 0),
    0
  FROM public.products p
  LEFT JOIN public.inventory_balances b
    ON b.tenant_id = p.tenant_id AND b.product_id = p.id
  WHERE p.tenant_id = p_tenant_id
    AND (
      (p_product_ids IS NOT NULL AND p.id = ANY(p_product_ids))
      OR (p_product_ids IS NULL AND p.active = true)
    );

  GET DIAGNOSTICS v_inserted_items = ROW_COUNT;
  IF v_inserted_items = 0 THEN
    RAISE EXCEPTION 'Nenhum produto elegivel encontrado para compor o inventario.';
  END IF;

  RETURN jsonb_build_object(
    'duplicate', false,
    'countId', v_count_id,
    'countNumber', v_next_number,
    'itemsCount', v_inserted_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_start_count(uuid, text, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_start_count(uuid, text, uuid[], text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.inventory_save_count_items(
  p_tenant_id uuid,
  p_count_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_count public.inventory_counts%ROWTYPE;
  v_item jsonb;
  v_item_id uuid;
  v_counted numeric(14, 3);
  v_notes text;
  v_updated integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id)
     OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Modulo disponivel apenas para o segmento Adega.';
  END IF;

  SELECT * INTO v_count
  FROM public.inventory_counts
  WHERE id = p_count_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_count.status <> 'open' THEN
    RAISE EXCEPTION 'Inventario nao encontrado ou ja encerrado.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) LOOP
    v_item_id := (v_item ->> 'countItemId')::uuid;
    IF v_item ->> 'countedQty' IS NULL OR btrim(v_item ->> 'countedQty') = '' THEN
      v_counted := NULL;
    ELSE
      v_counted := round((v_item ->> 'countedQty')::numeric, 3);
      IF v_counted < 0 THEN
        RAISE EXCEPTION 'Quantidade contada nao pode ser negativa.';
      END IF;
    END IF;
    v_notes := left(btrim(coalesce(v_item ->> 'notes', '')), 300);

    UPDATE public.inventory_count_items
    SET
      counted_qty = v_counted,
      difference_qty = CASE
        WHEN v_counted IS NULL THEN 0
        ELSE round(v_counted - expected_qty, 3)
      END,
      estimated_difference_value = CASE
        WHEN v_counted IS NULL THEN 0
        ELSE round((v_counted - expected_qty) * unit_cost_snapshot, 2)
      END,
      notes = v_notes
    WHERE id = v_item_id
      AND count_id = p_count_id
      AND tenant_id = p_tenant_id;

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('countId', p_count_id, 'updatedItems', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_save_count_items(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_save_count_items(uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.inventory_finalize_count(
  p_tenant_id uuid,
  p_count_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), '');
  v_key text;
  v_count public.inventory_counts%ROWTYPE;
  v_item public.inventory_count_items%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_delta numeric(14, 3);
  v_abs_delta numeric(14, 3);
  v_direction text;
  v_mov_id uuid;
  v_adjustments integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id)
     OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente para finalizar inventario.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Modulo disponivel apenas para o segmento Adega.';
  END IF;

  SELECT * INTO v_count
  FROM public.inventory_counts
  WHERE id = p_count_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventario nao encontrado.';
  END IF;
  IF v_count.status = 'finalized' THEN
    RETURN jsonb_build_object('duplicate', true, 'countId', v_count.id, 'status', 'finalized');
  END IF;
  IF v_count.status <> 'open' THEN
    RAISE EXCEPTION 'Apenas inventarios abertos podem ser finalizados.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_count_items
    WHERE count_id = p_count_id AND tenant_id = p_tenant_id AND counted_qty IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Informe ao menos uma quantidade contada antes de finalizar o inventario.';
  END IF;

  v_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 160), '');
  IF v_key IS NULL OR char_length(v_key) < 8 THEN
    v_key := 'fincnt_' || p_count_id::text;
  END IF;

  FOR v_item IN
    SELECT * FROM public.inventory_count_items
    WHERE count_id = p_count_id
      AND tenant_id = p_tenant_id
      AND counted_qty IS NOT NULL
    ORDER BY id
    FOR UPDATE
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id AND tenant_id = p_tenant_id;

    INSERT INTO public.inventory_balances (
      tenant_id, product_id, available_qty, reserved_qty, min_stock_qty,
      average_unit_cost, last_cost_price, allow_negative_stock
    )
    VALUES (
      p_tenant_id, v_item.product_id, 0, 0, 0,
      coalesce(v_product.cost_price, 0), coalesce(v_product.cost_price, 0), false
    )
    ON CONFLICT (tenant_id, product_id) DO NOTHING;

    SELECT * INTO v_balance
    FROM public.inventory_balances
    WHERE tenant_id = p_tenant_id AND product_id = v_item.product_id
    FOR UPDATE;

    -- Calcula delta autoritativo contra o saldo travado atual para nao perder operacoes concorrentes
    v_delta := round(v_item.counted_qty - v_balance.available_qty, 3);
    v_mov_id := NULL;

    IF v_delta <> 0 THEN
      v_direction := CASE WHEN v_delta > 0 THEN 'in' ELSE 'out' END;
      v_abs_delta := abs(v_delta);

      UPDATE public.inventory_balances
      SET available_qty = round(v_item.counted_qty, 3)
      WHERE id = v_balance.id;

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
        idempotency_key,
        actor_user_id,
        actor_email
      )
      VALUES (
        p_tenant_id,
        v_item.product_id,
        'inventory_adjustment',
        v_direction,
        v_abs_delta,
        coalesce(v_product.sale_unit, 'unidade'),
        1,
        v_abs_delta,
        v_balance.available_qty,
        round(v_item.counted_qty, 3),
        v_balance.average_unit_cost,
        round(v_abs_delta * v_balance.average_unit_cost, 2),
        v_balance.average_unit_cost,
        v_balance.average_unit_cost,
        'Inventario #' || v_count.count_number || ' — ' || v_count.title,
        left(
          CASE
            WHEN v_balance.available_qty <> v_item.expected_qty THEN
              'Saldo atualizado por movimentacao concorrente durante a contagem (inicial: ' || v_item.expected_qty::text || ', momento do fechamento: ' || v_balance.available_qty::text || '). ' || coalesce(v_item.notes, '')
            ELSE coalesce(v_item.notes, '')
          END,
          600
        ),
        'inventory_count',
        v_count.id,
        v_key || ':' || v_item.id::text,
        v_user_id,
        left(v_user_email, 160)
      )
      RETURNING id INTO v_mov_id;

      v_adjustments := v_adjustments + 1;
    END IF;

    UPDATE public.inventory_count_items
    SET
      difference_qty = round(v_item.counted_qty - v_item.expected_qty, 3),
      unit_cost_snapshot = v_balance.average_unit_cost,
      estimated_difference_value = round((v_item.counted_qty - v_item.expected_qty) * v_balance.average_unit_cost, 2),
      adjustment_movement_id = v_mov_id
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.inventory_counts
  SET
    status = 'finalized',
    finalized_by_user_id = v_user_id,
    finalized_by_email = left(v_user_email, 160),
    finalized_at = now()
  WHERE id = v_count.id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'countId', v_count.id,
    'status', 'finalized',
    'adjustmentsApplied', v_adjustments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_finalize_count(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_finalize_count(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.inventory_cancel_count(
  p_tenant_id uuid,
  p_count_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_count public.inventory_counts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;
  IF NOT public.has_active_tenant_access(p_tenant_id)
     OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Permissao insuficiente.';
  END IF;
  IF NOT public.is_adega_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Modulo disponivel apenas para o segmento Adega.';
  END IF;

  SELECT * INTO v_count
  FROM public.inventory_counts
  WHERE id = p_count_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_count.status <> 'open' THEN
    RAISE EXCEPTION 'Apenas inventarios abertos podem ser cancelados.';
  END IF;

  UPDATE public.inventory_counts
  SET status = 'cancelled'
  WHERE id = v_count.id;

  RETURN jsonb_build_object('countId', v_count.id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_cancel_count(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_cancel_count(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9) Publicacao Realtime para as novas tabelas de estoque
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_balances'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_balances;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_packaging_conversions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_packaging_conversions;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_movements'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_movements;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'suppliers'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_suppliers'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.product_suppliers;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'purchase_orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'purchase_order_items'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_order_items;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'purchase_receipts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_receipts;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'purchase_receipt_items'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_receipt_items;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_counts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_counts;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_count_items'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_count_items;
    END IF;
  END IF;
END
$$;

COMMIT;

-- ============================================================================
-- ROLLBACK MANUAL (NAO EXECUTADO AUTOMATICAMENTE)
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.inventory_cancel_count(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.inventory_finalize_count(uuid, uuid, text);
--   DROP FUNCTION IF EXISTS public.inventory_save_count_items(uuid, uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.inventory_start_count(uuid, text, uuid[], text, text);
--   DROP FUNCTION IF EXISTS public.inventory_receive_purchase_items(uuid, uuid, jsonb, text, text);
--   DROP FUNCTION IF EXISTS public.inventory_update_purchase_order_status(uuid, uuid, text, text);
--   DROP FUNCTION IF EXISTS public.inventory_create_purchase_order(uuid, uuid, text, text, date, numeric, numeric, text, jsonb, text);
--   DROP FUNCTION IF EXISTS public.inventory_record_movement(uuid, uuid, text, numeric, text, numeric, numeric, text, text, uuid, uuid, text, boolean);
--   DROP FUNCTION IF EXISTS public.inventory_upsert_product_config(uuid, uuid, numeric, boolean);
--   DROP TABLE IF EXISTS public.inventory_count_items;
--   DROP TABLE IF EXISTS public.inventory_counts;
--   DROP TABLE IF EXISTS public.purchase_receipt_items;
--   DROP TABLE IF EXISTS public.purchase_receipts;
--   DROP TABLE IF EXISTS public.purchase_order_items;
--   DROP TABLE IF EXISTS public.purchase_orders;
--   DROP TABLE IF EXISTS public.inventory_movements;
--   DROP TABLE IF EXISTS public.product_suppliers;
--   DROP TABLE IF EXISTS public.suppliers;
--   DROP TABLE IF EXISTS public.inventory_packaging_conversions;
--   DROP TABLE IF EXISTS public.inventory_balances;
--   DROP FUNCTION IF EXISTS public.prevent_inventory_movement_mutation();
--   DROP FUNCTION IF EXISTS public.validate_product_supplier_before_write();
--   DROP FUNCTION IF EXISTS public.validate_supplier_before_write();
--   DROP FUNCTION IF EXISTS public.validate_inventory_packaging_before_write();
--   DROP FUNCTION IF EXISTS public.guard_adega_inventory_segment();
--   DROP FUNCTION IF EXISTS public.is_adega_tenant(uuid);
-- COMMIT;
-- ============================================================================
