-- MGW Gestao: identificacao opcional do cliente na Nova Venda Rapida (public.sales)
-- Preserva integridade multi-tenant, compatibilidade com vendas antigas e RLS existente.

BEGIN;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.delivery_customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_neighborhood text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_complement text NOT NULL DEFAULT '';

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sales_customer_name_len;
ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_customer_name_len CHECK (char_length(customer_name) <= 120);

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sales_customer_address_len;
ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_customer_address_len CHECK (char_length(customer_address) <= 200);

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sales_customer_number_len;
ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_customer_number_len CHECK (char_length(customer_number) <= 40);

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sales_customer_neighborhood_len;
ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_customer_neighborhood_len CHECK (char_length(customer_neighborhood) <= 120);

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sales_customer_complement_len;
ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_customer_complement_len CHECK (char_length(customer_complement) <= 160);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_customer_id
  ON public.sales (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_sale_customer_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.delivery_customers dc
      WHERE dc.id = NEW.customer_id
        AND dc.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'Cliente informado nao pertence ao estabelecimento da venda.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_validate_customer_tenant ON public.sales;
CREATE TRIGGER trg_sales_validate_customer_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, customer_id
  ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_sale_customer_tenant();

COMMENT ON COLUMN public.sales.customer_id IS
  'Vinculo opcional com cliente cadastrado em delivery_customers do mesmo tenant.';
COMMENT ON COLUMN public.sales.customer_name IS
  'Nome opcional do cliente informado na venda rapida.';
COMMENT ON COLUMN public.sales.customer_address IS
  'Logradouro/endereco opcional do cliente na venda rapida.';
COMMENT ON COLUMN public.sales.customer_number IS
  'Numero do endereco opcional do cliente na venda rapida.';
COMMENT ON COLUMN public.sales.customer_neighborhood IS
  'Bairro opcional do cliente na venda rapida.';
COMMENT ON COLUMN public.sales.customer_complement IS
  'Complemento opcional do endereco do cliente na venda rapida.';

COMMIT;
