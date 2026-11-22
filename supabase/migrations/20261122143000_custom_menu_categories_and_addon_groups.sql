-- MGW Gestão: categorias personalizadas e grupos reutilizáveis de adicionais.
-- Aditiva e compatível com produtos existentes. Não altera pedidos nem preços atuais.

BEGIN;

-- 1) Categorias por estabelecimento.
CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_categories_tenant_name
  ON public.product_categories (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_order
  ON public.product_categories (tenant_id, sort_order, name);

-- Preserve all existing category labels as tenant-owned categories.
INSERT INTO public.product_categories (tenant_id, name, sort_order)
SELECT p.tenant_id, btrim(p.category), 0
FROM public.products p
WHERE nullif(btrim(p.category), '') IS NOT NULL
GROUP BY p.tenant_id, btrim(p.category)
ON CONFLICT DO NOTHING;

-- 2) Reusable option groups and their choices.
CREATE TABLE IF NOT EXISTS public.addon_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  is_required boolean NOT NULL DEFAULT false,
  min_select integer NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select integer NOT NULL DEFAULT 1 CHECK (max_select BETWEEN 1 AND 30),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_addon_group_selection_range CHECK (min_select <= max_select),
  CONSTRAINT chk_addon_group_required_min CHECK (NOT is_required OR min_select >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_addon_groups_tenant_name
  ON public.addon_groups (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_addon_groups_tenant_active
  ON public.addon_groups (tenant_id, active, sort_order);

CREATE TABLE IF NOT EXISTS public.addon_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0 AND price <= 10000),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addon_options_group_order
  ON public.addon_options (tenant_id, group_id, active, sort_order);

CREATE TABLE IF NOT EXISTS public.product_addon_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_addon_group UNIQUE (tenant_id, product_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_product_addon_groups_product
  ON public.product_addon_groups (tenant_id, product_id, sort_order);

-- Ensure every relationship stays inside the same tenant, including service-role writes.
CREATE OR REPLACE FUNCTION public.guard_mgw_menu_addon_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'addon_options' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.addon_groups g
      WHERE g.id = NEW.group_id AND g.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'Grupo de adicionais inválido para este estabelecimento.';
    END IF;
  ELSIF TG_TABLE_NAME = 'product_addon_groups' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.addon_groups g
      WHERE g.id = NEW.group_id AND g.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'Produto ou grupo de adicionais pertence a outro estabelecimento.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_addon_option_tenant ON public.addon_options;
CREATE TRIGGER trg_guard_addon_option_tenant
BEFORE INSERT OR UPDATE ON public.addon_options
FOR EACH ROW EXECUTE FUNCTION public.guard_mgw_menu_addon_tenant();

DROP TRIGGER IF EXISTS trg_guard_product_addon_group_tenant ON public.product_addon_groups;
CREATE TRIGGER trg_guard_product_addon_group_tenant
BEFORE INSERT OR UPDATE ON public.product_addon_groups
FOR EACH ROW EXECUTE FUNCTION public.guard_mgw_menu_addon_tenant();

-- Tenant isolation and role-based write access.
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_addon_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_categories_member_select ON public.product_categories;
CREATE POLICY product_categories_member_select ON public.product_categories
FOR SELECT TO authenticated
USING (public.has_active_tenant_access(tenant_id));
DROP POLICY IF EXISTS product_categories_manager_insert ON public.product_categories;
CREATE POLICY product_categories_manager_insert ON public.product_categories
FOR INSERT TO authenticated
WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));
DROP POLICY IF EXISTS product_categories_manager_update ON public.product_categories;
CREATE POLICY product_categories_manager_update ON public.product_categories
FOR UPDATE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']))
WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));
DROP POLICY IF EXISTS product_categories_admin_delete ON public.product_categories;
CREATE POLICY product_categories_admin_delete ON public.product_categories
FOR DELETE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS addon_groups_member_select ON public.addon_groups;
CREATE POLICY addon_groups_member_select ON public.addon_groups
FOR SELECT TO authenticated
USING (public.has_active_tenant_access(tenant_id));
DROP POLICY IF EXISTS addon_groups_manager_insert ON public.addon_groups;
CREATE POLICY addon_groups_manager_insert ON public.addon_groups
FOR INSERT TO authenticated
WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));
DROP POLICY IF EXISTS addon_groups_manager_update ON public.addon_groups;
CREATE POLICY addon_groups_manager_update ON public.addon_groups
FOR UPDATE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']))
WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));
DROP POLICY IF EXISTS addon_groups_admin_delete ON public.addon_groups;
CREATE POLICY addon_groups_admin_delete ON public.addon_groups
FOR DELETE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS addon_options_member_select ON public.addon_options;
CREATE POLICY addon_options_member_select ON public.addon_options
FOR SELECT TO authenticated
USING (public.has_active_tenant_access(tenant_id));
DROP POLICY IF EXISTS addon_options_manager_insert ON public.addon_options;
CREATE POLICY addon_options_manager_insert ON public.addon_options
FOR INSERT TO authenticated
WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));
DROP POLICY IF EXISTS addon_options_manager_update ON public.addon_options;
CREATE POLICY addon_options_manager_update ON public.addon_options
FOR UPDATE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']))
WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));
DROP POLICY IF EXISTS addon_options_admin_delete ON public.addon_options;
CREATE POLICY addon_options_admin_delete ON public.addon_options
FOR DELETE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS product_addon_groups_member_select ON public.product_addon_groups;
CREATE POLICY product_addon_groups_member_select ON public.product_addon_groups
FOR SELECT TO authenticated
USING (public.has_active_tenant_access(tenant_id));
DROP POLICY IF EXISTS product_addon_groups_manager_insert ON public.product_addon_groups;
CREATE POLICY product_addon_groups_manager_insert ON public.product_addon_groups
FOR INSERT TO authenticated
WITH CHECK (
  public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager'])
  AND EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_addon_groups.product_id AND p.tenant_id=product_addon_groups.tenant_id)
  AND EXISTS (SELECT 1 FROM public.addon_groups g WHERE g.id=product_addon_groups.group_id AND g.tenant_id=product_addon_groups.tenant_id)
);
DROP POLICY IF EXISTS product_addon_groups_manager_update ON public.product_addon_groups;
CREATE POLICY product_addon_groups_manager_update ON public.product_addon_groups
FOR UPDATE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']))
WITH CHECK (
  public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager'])
  AND EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND p.tenant_id=tenant_id)
  AND EXISTS (SELECT 1 FROM public.addon_groups g WHERE g.id=group_id AND g.tenant_id=tenant_id)
);
DROP POLICY IF EXISTS product_addon_groups_admin_delete ON public.product_addon_groups;
CREATE POLICY product_addon_groups_admin_delete ON public.product_addon_groups
FOR DELETE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']));

-- Allow tenant-created category names while preserving all current labels.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_category;
ALTER TABLE public.products
  ADD CONSTRAINT chk_products_category_nonempty
  CHECK (char_length(btrim(category)) BETWEEN 1 AND 60);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addon_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addon_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_addon_groups TO authenticated;

COMMIT;
