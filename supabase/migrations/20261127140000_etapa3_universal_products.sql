-- ============================================================================
-- ETAPA 3 — PRODUTOS UNIVERSAIS (BASE PROFISSIONAL PARA ADEGAS + PRESERVACAO LANCHONETES)
-- Migration estritamente aditiva e idempotente.
-- Regras cumpridas:
--   - Nao remove nem renomeia colunas ou tabelas existentes.
--   - Nao altera nem sobrescreve produtos existentes de lanchonetes.
--   - Nao altera politicas RLS nem funcoes de seguranca existentes.
--   - Nao cria categorias nem produtos artificiais.
--   - Nao implementa modulo de estoque (reservado para a Etapa 4).
-- ============================================================================

BEGIN;

-- 1) Evolucao aditiva da tabela public.products com defaults seguros retrocompativeis
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS internal_code text,
  ADD COLUMN IF NOT EXISTS cost_price numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS volume_value numeric(10, 3),
  ADD COLUMN IF NOT EXISTS volume_unit text,
  ADD COLUMN IF NOT EXISTS sale_unit text NOT NULL DEFAULT 'unidade',
  ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS units_per_package integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.products.description IS
  'Descricao comercial opcional do produto.';
COMMENT ON COLUMN public.products.internal_code IS
  'Codigo interno/SKU opcional por estabelecimento.';
COMMENT ON COLUMN public.products.cost_price IS
  'Custo de aquisicao unitario (>= 0). Padrao 0 quando nao informado.';
COMMENT ON COLUMN public.products.brand IS
  'Marca do produto vinculada livremente ao cadastro do item no tenant.';
COMMENT ON COLUMN public.products.notes IS
  'Observacoes internas opcionais sobre o produto.';
COMMENT ON COLUMN public.products.barcode IS
  'Codigo de barras opcional (8 a 14 digitos numericos), unico por estabelecimento quando preenchido.';
COMMENT ON COLUMN public.products.volume_value IS
  'Quantidade ou volume numerico padronizado (ex: 350, 473, 1, 2).';
COMMENT ON COLUMN public.products.volume_unit IS
  'Unidade de medida do volume/peso (ml | l | g | kg | un).';
COMMENT ON COLUMN public.products.sale_unit IS
  'Unidade de venda do produto (unidade | garrafa | lata | pacote | caixa | fardo).';
COMMENT ON COLUMN public.products.package_type IS
  'Tipo estrutural de embalagem (individual | pacote | caixa | fardo). Sem conversao de estoque nesta etapa.';
COMMENT ON COLUMN public.products.units_per_package IS
  'Quantidade estrutural de unidades por embalagem (>= 1). Preparacao para etapa futura de estoque.';

-- 2) Constraints de integridade e faixas numericas no backend
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_description_len'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_description_len
      CHECK (char_length(description) <= 400);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_internal_code_len'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_internal_code_len
      CHECK (
        internal_code IS NULL
        OR char_length(btrim(internal_code)) BETWEEN 1 AND 40
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_cost_price'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_cost_price
      CHECK (cost_price >= 0 AND cost_price <= 100000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_unit_price_max'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_unit_price_max
      CHECK (unit_price <= 100000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_brand_len'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_brand_len
      CHECK (char_length(brand) <= 80);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_notes_len'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_notes_len
      CHECK (char_length(notes) <= 400);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_barcode_format'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_barcode_format
      CHECK (barcode IS NULL OR barcode ~ '^[0-9]{8,14}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_volume_value'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_volume_value
      CHECK (
        volume_value IS NULL
        OR (volume_value > 0 AND volume_value <= 100000)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_volume_unit'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_volume_unit
      CHECK (
        volume_unit IS NULL
        OR volume_unit IN ('ml', 'l', 'g', 'kg', 'un')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_volume_pair'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_volume_pair
      CHECK (
        (volume_value IS NULL AND volume_unit IS NULL)
        OR (volume_value IS NOT NULL AND volume_unit IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_sale_unit'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_sale_unit
      CHECK (
        sale_unit IN ('unidade', 'garrafa', 'lata', 'pacote', 'caixa', 'fardo')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_package_type'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_package_type
      CHECK (package_type IN ('individual', 'pacote', 'caixa', 'fardo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_units_per_package'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_units_per_package
      CHECK (units_per_package BETWEEN 1 AND 1000);
  END IF;
END
$$;

-- 3) Unicidade de codigo de barras isolada por tenant (permite null/vazio e repeticao entre tenants distintos)
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_barcode
  ON public.products (tenant_id, barcode)
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

-- Indice auxiliar para busca/sugestao de marcas dentro do mesmo tenant
CREATE INDEX IF NOT EXISTS idx_products_tenant_brand
  ON public.products (tenant_id, lower(brand))
  WHERE btrim(brand) <> '';

-- 4) Trigger dedicado de normalizacao e validacao backend antes de gravar
--    Nao substitui nem altera trg_products_lock_tenant nem politicas RLS.
CREATE OR REPLACE FUNCTION public.validate_product_universal_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_segment text;
BEGIN
  SELECT coalesce(nullif(btrim(t.business_segment), ''), 'lanchonete')
  INTO v_segment
  FROM public.tenants t
  WHERE t.id = NEW.tenant_id;

  IF v_segment IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento nao encontrado para este produto.';
  END IF;

  IF v_segment NOT IN ('lanchonete', 'adega') THEN
    RAISE EXCEPTION 'Segmento comercial do estabelecimento invalido.';
  END IF;

  NEW.name := left(btrim(coalesce(NEW.name, '')), 80);
  IF char_length(NEW.name) = 0 THEN
    RAISE EXCEPTION 'Informe o nome do produto.';
  END IF;

  NEW.category := left(btrim(coalesce(NEW.category, '')), 60);
  IF char_length(NEW.category) = 0 THEN
    RAISE EXCEPTION 'Informe a categoria do produto.';
  END IF;

  IF NEW.unit_price IS NULL OR NEW.unit_price < 0 OR NEW.unit_price > 100000 THEN
    RAISE EXCEPTION 'Preco de venda invalido. Deve estar entre 0 e 100000.';
  END IF;

  NEW.cost_price := coalesce(NEW.cost_price, 0);
  IF NEW.cost_price < 0 OR NEW.cost_price > 100000 THEN
    RAISE EXCEPTION 'Custo de aquisicao invalido. Deve estar entre 0 e 100000.';
  END IF;

  NEW.description := left(btrim(coalesce(NEW.description, '')), 400);
  NEW.internal_code := nullif(left(btrim(coalesce(NEW.internal_code, '')), 40), '');
  NEW.brand := left(btrim(coalesce(NEW.brand, '')), 80);
  NEW.notes := left(btrim(coalesce(NEW.notes, '')), 400);
  NEW.barcode := nullif(regexp_replace(btrim(coalesce(NEW.barcode, '')), '\s+', '', 'g'), '');

  IF NEW.barcode IS NOT NULL AND NEW.barcode !~ '^[0-9]{8,14}$' THEN
    RAISE EXCEPTION 'Codigo de barras invalido. Informe de 8 a 14 digitos numericos.';
  END IF;

  NEW.volume_unit := nullif(lower(btrim(coalesce(NEW.volume_unit, ''))), '');

  IF NEW.volume_value IS NOT NULL AND NEW.volume_value <= 0 THEN
    RAISE EXCEPTION 'Volume ou quantidade deve ser maior que zero.';
  END IF;

  IF (NEW.volume_value IS NULL) <> (NEW.volume_unit IS NULL) THEN
    RAISE EXCEPTION 'Informe valor e unidade de medida juntos para o volume.';
  END IF;

  IF NEW.volume_unit IS NOT NULL AND NEW.volume_unit NOT IN ('ml', 'l', 'g', 'kg', 'un') THEN
    RAISE EXCEPTION 'Unidade de volume invalida.';
  END IF;

  NEW.sale_unit := coalesce(nullif(lower(btrim(coalesce(NEW.sale_unit, ''))), ''), 'unidade');
  IF NEW.sale_unit NOT IN ('unidade', 'garrafa', 'lata', 'pacote', 'caixa', 'fardo') THEN
    RAISE EXCEPTION 'Unidade de venda invalida.';
  END IF;

  NEW.package_type := coalesce(nullif(lower(btrim(coalesce(NEW.package_type, ''))), ''), 'individual');
  IF NEW.package_type NOT IN ('individual', 'pacote', 'caixa', 'fardo') THEN
    RAISE EXCEPTION 'Tipo de embalagem invalido.';
  END IF;

  NEW.units_per_package := coalesce(NEW.units_per_package, 1);
  IF NEW.units_per_package < 1 OR NEW.units_per_package > 1000 THEN
    RAISE EXCEPTION 'Unidades por embalagem deve estar entre 1 e 1000.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_product_universal_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_products_validate_universal_fields ON public.products;
CREATE TRIGGER trg_products_validate_universal_fields
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_universal_fields();

COMMIT;

-- ============================================================================
-- ROLLBACK MANUAL (NAO EXECUTADO AUTOMATICAMENTE)
-- Caso seja necessario reverter esta migration no futuro:
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_products_validate_universal_fields ON public.products;
--   DROP FUNCTION IF EXISTS public.validate_product_universal_fields();
--   DROP INDEX IF EXISTS public.uq_products_tenant_barcode;
--   DROP INDEX IF EXISTS public.idx_products_tenant_brand;
--   ALTER TABLE public.products
--     DROP CONSTRAINT IF EXISTS chk_products_description_len,
--     DROP CONSTRAINT IF EXISTS chk_products_internal_code_len,
--     DROP CONSTRAINT IF EXISTS chk_products_cost_price,
--     DROP CONSTRAINT IF EXISTS chk_products_unit_price_max,
--     DROP CONSTRAINT IF EXISTS chk_products_brand_len,
--     DROP CONSTRAINT IF EXISTS chk_products_notes_len,
--     DROP CONSTRAINT IF EXISTS chk_products_barcode_format,
--     DROP CONSTRAINT IF EXISTS chk_products_volume_value,
--     DROP CONSTRAINT IF EXISTS chk_products_volume_unit,
--     DROP CONSTRAINT IF EXISTS chk_products_volume_pair,
--     DROP CONSTRAINT IF EXISTS chk_products_sale_unit,
--     DROP CONSTRAINT IF EXISTS chk_products_package_type,
--     DROP CONSTRAINT IF EXISTS chk_products_units_per_package;
--   ALTER TABLE public.products
--     DROP COLUMN IF EXISTS description,
--     DROP COLUMN IF EXISTS internal_code,
--     DROP COLUMN IF EXISTS cost_price,
--     DROP COLUMN IF EXISTS brand,
--     DROP COLUMN IF EXISTS notes,
--     DROP COLUMN IF EXISTS barcode,
--     DROP COLUMN IF EXISTS volume_value,
--     DROP COLUMN IF EXISTS volume_unit,
--     DROP COLUMN IF EXISTS sale_unit,
--     DROP COLUMN IF EXISTS package_type,
--     DROP COLUMN IF EXISTS units_per_package;
-- COMMIT;
-- ============================================================================
