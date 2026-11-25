-- MGW DELIVERY — ETAPA 3: CADASTRO E GESTÃO DE MOTOBOYS (ENTREGADORES)
-- Multi-tenant courier directory, vehicle details, operational status & availability,
-- duplicate normalized phone prevention per tenant, and strict RLS.

CREATE TABLE IF NOT EXISTS public.delivery_couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) >= 2 AND length(name) <= 120),
  phone text NOT NULL CHECK (length(btrim(phone)) >= 8 AND length(phone) <= 32),
  normalized_phone text NOT NULL CHECK (length(normalized_phone) >= 8 AND length(normalized_phone) <= 20),
  whatsapp text NOT NULL DEFAULT '' CHECK (length(whatsapp) <= 32),
  normalized_whatsapp text NOT NULL DEFAULT '' CHECK (length(normalized_whatsapp) <= 20),
  cpf text NOT NULL DEFAULT '' CHECK (length(cpf) <= 20),
  email text NOT NULL DEFAULT '' CHECK (length(email) <= 160),
  motorcycle_brand text NOT NULL DEFAULT '' CHECK (length(motorcycle_brand) <= 60),
  motorcycle_model text NOT NULL DEFAULT '' CHECK (length(motorcycle_model) <= 80),
  motorcycle_color text NOT NULL DEFAULT '' CHECK (length(motorcycle_color) <= 40),
  motorcycle_plate text NOT NULL DEFAULT '' CHECK (length(motorcycle_plate) <= 16),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  availability_status text NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available', 'unavailable')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices obrigatórios para consultas rápidas e isolamento por estabelecimento
CREATE INDEX IF NOT EXISTS idx_delivery_couriers_tenant_id
  ON public.delivery_couriers (tenant_id);

CREATE INDEX IF NOT EXISTS idx_delivery_couriers_normalized_phone
  ON public.delivery_couriers (normalized_phone);

CREATE INDEX IF NOT EXISTS idx_delivery_couriers_tenant_status
  ON public.delivery_couriers (tenant_id, status, availability_status);

-- Prevenção de duplicidade de telefone normalizado dentro do mesmo estabelecimento
-- (permite que dois estabelecimentos diferentes cadastrem o mesmo telefone sem conflito)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery_couriers_tenant_phone
  ON public.delivery_couriers (tenant_id, normalized_phone);

-- Normalização e proteção de integridade antes de inserir/atualizar
CREATE OR REPLACE FUNCTION public.validate_delivery_courier_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.name := left(btrim(coalesce(NEW.name, '')), 120);
  NEW.phone := left(btrim(coalesce(NEW.phone, '')), 32);
  NEW.normalized_phone := public.normalize_br_phone(NEW.phone);
  NEW.whatsapp := left(btrim(coalesce(NEW.whatsapp, '')), 32);
  NEW.normalized_whatsapp := CASE
    WHEN length(btrim(NEW.whatsapp)) >= 8 THEN public.normalize_br_phone(NEW.whatsapp)
    ELSE ''
  END;
  NEW.cpf := left(regexp_replace(coalesce(NEW.cpf, ''), '[^0-9]', '', 'g'), 14);
  NEW.email := left(lower(btrim(coalesce(NEW.email, ''))), 160);
  NEW.motorcycle_brand := left(btrim(coalesce(NEW.motorcycle_brand, '')), 60);
  NEW.motorcycle_model := left(btrim(coalesce(NEW.motorcycle_model, '')), 80);
  NEW.motorcycle_color := left(btrim(coalesce(NEW.motorcycle_color, '')), 40);
  NEW.motorcycle_plate := left(upper(regexp_replace(btrim(coalesce(NEW.motorcycle_plate, '')), '[^A-Za-z0-9-]', '', 'g')), 16);
  NEW.status := CASE
    WHEN NEW.status = 'inactive' THEN 'inactive'
    ELSE 'active'
  END;
  NEW.availability_status := CASE
    WHEN NEW.status = 'inactive' THEN 'unavailable'
    WHEN NEW.availability_status = 'unavailable' THEN 'unavailable'
    ELSE 'available'
  END;
  NEW.notes := left(btrim(coalesce(NEW.notes, '')), 1000);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_couriers_normalize ON public.delivery_couriers;
CREATE TRIGGER trg_delivery_couriers_normalize
  BEFORE INSERT OR UPDATE ON public.delivery_couriers
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_delivery_courier_before_write();

DROP TRIGGER IF EXISTS trg_delivery_couriers_updated_at ON public.delivery_couriers;
CREATE TRIGGER trg_delivery_couriers_updated_at
  BEFORE UPDATE ON public.delivery_couriers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_prevent_tenant_id_change_delivery_couriers ON public.delivery_couriers;
CREATE TRIGGER trg_prevent_tenant_id_change_delivery_couriers
  BEFORE UPDATE ON public.delivery_couriers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_id_change();

-- Segurança Multi-Tenant (RLS estrito; nenhum acesso anônimo ou cross-tenant)
ALTER TABLE public.delivery_couriers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_couriers FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_couriers TO authenticated;

DROP POLICY IF EXISTS delivery_couriers_select_tenant ON public.delivery_couriers;
CREATE POLICY delivery_couriers_select_tenant
  ON public.delivery_couriers
  FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_couriers_insert_tenant ON public.delivery_couriers;
CREATE POLICY delivery_couriers_insert_tenant
  ON public.delivery_couriers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_couriers_update_tenant ON public.delivery_couriers;
CREATE POLICY delivery_couriers_update_tenant
  ON public.delivery_couriers
  FOR UPDATE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS delivery_couriers_delete_tenant ON public.delivery_couriers;
CREATE POLICY delivery_couriers_delete_tenant
  ON public.delivery_couriers
  FOR DELETE TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );
