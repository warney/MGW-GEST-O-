-- ============================================================================
-- MGW GESTAO — ETAPA 1: SCHEMA SAAS MULTI-TENANT SUPABASE (POSTGRESQL)
-- Migration: 20261114000001_initial_saas_schema.sql
--
-- Regras estruturais:
--   * Isolamento estrito por tenant_id em todas as tabelas de negocio.
--   * Datas de vendas, despesas e inicio de operacao preservadas como DATE
--     (YYYY-MM-DD), sem conversao indevida de fuso horario.
--   * Campos legacy_id e owner_email para rastreabilidade da migracao futura.
--   * Row Level Security (RLS) habilitado em 100% das tabelas.
--   * Nenhuma politica usa user_metadata ou tenant_id nao verificado.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. TABELAS PRINCIPAIS DE SAAS E MULTI-TENANCY
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE
    CONSTRAINT chk_tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  name text NOT NULL
    CONSTRAINT chk_tenants_name_nonempty CHECK (char_length(btrim(name)) > 0),
  is_founder_account boolean NOT NULL DEFAULT false,
  billing_exempt boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT chk_tenants_status CHECK (status IN ('active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenants IS
  'Estabelecimentos cadastrados no SaaS MGW Gestao.';

CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL
    CONSTRAINT chk_tenant_members_email_normalized CHECK (
      email = lower(btrim(email))
      AND position('@' IN email) > 1
    ),
  role text NOT NULL DEFAULT 'admin'
    CONSTRAINT chk_tenant_members_role CHECK (role IN ('owner', 'admin')),
  is_founder boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_members_tenant_email UNIQUE (tenant_id, email),
  CONSTRAINT uq_tenant_members_tenant_user UNIQUE (tenant_id, user_id)
);

COMMENT ON TABLE public.tenant_members IS
  'Vinculos entre usuarios autenticados e estabelecimentos. user_id pode permanecer NULL ate a primeira autenticacao verificada do usuario fundador/convidado.';

CREATE INDEX IF NOT EXISTS idx_tenant_members_user_active
  ON public.tenant_members (user_id, tenant_id)
  WHERE active = true AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_members_email_active
  ON public.tenant_members (email, tenant_id)
  WHERE active = true;

-- ----------------------------------------------------------------------------
-- 2. ASSINATURAS E EVENTOS DE WEBHOOK (MERCADO PAGO — R$ 49,00/MES)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_code text NOT NULL DEFAULT 'mgw_mensal_49'
    CONSTRAINT chk_subscriptions_plan_code CHECK (plan_code = 'mgw_mensal_49'),
  plan_amount_cents integer NOT NULL DEFAULT 4900
    CONSTRAINT chk_subscriptions_amount CHECK (plan_amount_cents = 4900),
  currency text NOT NULL DEFAULT 'BRL'
    CONSTRAINT chk_subscriptions_currency CHECK (currency = 'BRL'),
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_subscriptions_status CHECK (
      status IN ('pending', 'authorized', 'paused', 'cancelled', 'exempt')
    ),
  mp_preapproval_id text UNIQUE,
  mp_preapproval_plan_id text,
  mp_payer_email text,
  mp_init_point text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscriptions IS
  'Status da assinatura unica (R$ 49,00/mes) ou isencao fundadora por estabelecimento.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status);

CREATE TABLE IF NOT EXISTS public.mp_webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  action text,
  resource_id text,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  processing_status text NOT NULL DEFAULT 'received'
    CONSTRAINT chk_mp_webhook_processing_status CHECK (
      processing_status IN ('received', 'processed', 'ignored', 'failed')
    ),
  payload jsonb NOT NULL,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

COMMENT ON TABLE public.mp_webhook_events IS
  'Log idempotente de eventos webhook do Mercado Pago. Acesso exclusivo de service_role.';

CREATE INDEX IF NOT EXISTS idx_mp_webhook_events_resource
  ON public.mp_webhook_events (resource_id)
  WHERE resource_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mp_webhook_events_tenant_received
  ON public.mp_webhook_events (tenant_id, received_at DESC)
  WHERE tenant_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. CONFIGURACOES DO ESTABELECIMENTO, CATALOGO, VENDAS E DESPESAS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shop_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_email text,
  establishment_name text NOT NULL DEFAULT 'MGW Lanches'
    CONSTRAINT chk_shop_settings_name_nonempty CHECK (char_length(btrim(establishment_name)) > 0),
  x_salada_price numeric(12, 2) NOT NULL DEFAULT 22.00
    CONSTRAINT chk_shop_settings_xsalada_price CHECK (x_salada_price >= 0),
  daily_goal numeric(12, 2) NOT NULL DEFAULT 800.00
    CONSTRAINT chk_shop_settings_daily_goal CHECK (daily_goal >= 0),
  monthly_goal numeric(12, 2) NOT NULL DEFAULT 18000.00
    CONSTRAINT chk_shop_settings_monthly_goal CHECK (monthly_goal >= 0),
  start_date date NOT NULL DEFAULT DATE '2026-01-01',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shop_settings IS
  'Configuracoes operacionais de cada estabelecimento (espelho de ShopSettings).';

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legacy_id text,
  owner_email text,
  name text NOT NULL
    CONSTRAINT chk_products_name_nonempty CHECK (char_length(btrim(name)) > 0),
  category text NOT NULL
    CONSTRAINT chk_products_category CHECK (
      category IN ('Lanche', 'Bebida', 'Adicional', 'Outro')
    ),
  unit_price numeric(12, 2) NOT NULL
    CONSTRAINT chk_products_unit_price CHECK (unit_price >= 0),
  counts_as_x_salada boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_products_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_active
  ON public.products (tenant_id, active, name);

CREATE TABLE IF NOT EXISTS public.combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legacy_id text,
  owner_email text,
  name text NOT NULL
    CONSTRAINT chk_combos_name_nonempty CHECK (char_length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  items jsonb NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT chk_combos_items_array CHECK (jsonb_typeof(items) = 'array'),
  sale_price numeric(12, 2) NOT NULL
    CONSTRAINT chk_combos_sale_price CHECK (sale_price >= 0),
  estimated_cost numeric(12, 2) NOT NULL DEFAULT 0
    CONSTRAINT chk_combos_estimated_cost CHECK (estimated_cost >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_combos_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_combos_tenant_active
  ON public.combos (tenant_id, active, name);

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legacy_id text,
  owner_email text,
  date date NOT NULL,
  quantity integer NOT NULL
    CONSTRAINT chk_sales_quantity CHECK (quantity >= 0),
  unit_price numeric(12, 2) NOT NULL
    CONSTRAINT chk_sales_unit_price CHECK (unit_price >= 0),
  total_amount numeric(12, 2) NOT NULL
    CONSTRAINT chk_sales_total_amount CHECK (total_amount >= 0),
  payment_method text NOT NULL
    CONSTRAINT chk_sales_payment_method CHECK (
      payment_method IN (
        'Pix',
        'Dinheiro',
        'Cartão de débito',
        'Cartão de crédito',
        'Outros',
        'Crédito'
      )
    ),
  note text NOT NULL DEFAULT '',
  sale_mode text
    CONSTRAINT chk_sales_mode CHECK (
      sale_mode IS NULL OR sale_mode IN ('individual', 'combo', 'mixed')
    ),
  x_salada_count integer
    CONSTRAINT chk_sales_xsalada_count CHECK (
      x_salada_count IS NULL OR x_salada_count >= 0
    ),
  combos_count integer
    CONSTRAINT chk_sales_combos_count CHECK (
      combos_count IS NULL OR combos_count >= 0
    ),
  items jsonb
    CONSTRAINT chk_sales_items_array CHECK (
      items IS NULL OR jsonb_typeof(items) = 'array'
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sales_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

COMMENT ON COLUMN public.sales.date IS
  'Data local da venda em YYYY-MM-DD (tipo DATE puro, sem deslocamento de timezone).';

COMMENT ON COLUMN public.sales.items IS
  'Snapshot historico imutavel dos itens/componentes da venda (SaleLineItemSnapshot[]).';

CREATE INDEX IF NOT EXISTS idx_sales_tenant_date
  ON public.sales (tenant_id, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_payment
  ON public.sales (tenant_id, payment_method);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legacy_id text,
  owner_email text,
  description text NOT NULL
    CONSTRAINT chk_expenses_description_nonempty CHECK (char_length(btrim(description)) > 0),
  amount numeric(12, 2) NOT NULL
    CONSTRAINT chk_expenses_amount CHECK (amount >= 0),
  category text NOT NULL
    CONSTRAINT chk_expenses_category CHECK (
      category IN (
        'Ingredientes',
        'Carnes e hambúrgueres',
        'Pães',
        'Queijos e frios',
        'Bebidas',
        'Embalagens',
        'Gás',
        'Energia',
        'Transporte',
        'Outros'
      )
    ),
  date date NOT NULL,
  payment_method text NOT NULL
    CONSTRAINT chk_expenses_payment_method CHECK (
      payment_method IN (
        'Pix',
        'Dinheiro',
        'Cartão de débito',
        'Cartão de crédito',
        'Outros',
        'Crédito'
      )
    ),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_expenses_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

COMMENT ON COLUMN public.expenses.date IS
  'Data local da despesa em YYYY-MM-DD (tipo DATE puro, sem deslocamento de timezone).';

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date
  ON public.expenses (tenant_id, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_category
  ON public.expenses (tenant_id, category);

-- ----------------------------------------------------------------------------
-- 4. TRIGGERS DE INTEGRIDADE E TIMESTAMPS (SECURITY INVOKER)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_tenant_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Alteracao de tenant_id nao e permitida.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_privileged_db_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin', 'service_role');
$$;

CREATE OR REPLACE FUNCTION public.guard_tenant_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_privileged_db_role() THEN
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'Alteracao de slug nao e permitida.';
    END IF;
    IF NEW.is_founder_account IS DISTINCT FROM OLD.is_founder_account THEN
      RAISE EXCEPTION 'Alteracao de is_founder_account nao e permitida.';
    END IF;
    IF NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt THEN
      RAISE EXCEPTION 'Alteracao de billing_exempt nao e permitida.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Alteracao de status do tenant nao e permitida.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_tenant_member_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_privileged_db_role() THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'Alteracao de tenant_id nao e permitida.';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Alteracao direta de user_id nao e permitida.';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Alteracao de email do vinculo nao e permitida.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Alteracao de papel (role) nao e permitida para usuarios.';
    END IF;
    IF NEW.is_founder IS DISTINCT FROM OLD.is_founder THEN
      RAISE EXCEPTION 'Alteracao de is_founder nao e permitida.';
    END IF;
    IF OLD.role = 'owner' AND NEW.active IS DISTINCT FROM OLD.active THEN
      RAISE EXCEPTION 'Nao e permitido desativar o owner principal.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers updated_at
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_members_updated_at ON public.tenant_members;
CREATE TRIGGER trg_tenant_members_updated_at
  BEFORE UPDATE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_shop_settings_updated_at ON public.shop_settings;
CREATE TRIGGER trg_shop_settings_updated_at
  BEFORE UPDATE ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_combos_updated_at ON public.combos;
CREATE TRIGGER trg_combos_updated_at
  BEFORE UPDATE ON public.combos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_updated_at ON public.sales;
CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Triggers protecao contra adulteracao de tenant_id e escalacao de privilegio
DROP TRIGGER IF EXISTS trg_tenants_guard_protected ON public.tenants;
CREATE TRIGGER trg_tenants_guard_protected
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_protected_fields();

DROP TRIGGER IF EXISTS trg_tenant_members_guard_changes ON public.tenant_members;
CREATE TRIGGER trg_tenant_members_guard_changes
  BEFORE UPDATE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_member_changes();

DROP TRIGGER IF EXISTS trg_shop_settings_lock_tenant ON public.shop_settings;
CREATE TRIGGER trg_shop_settings_lock_tenant
  BEFORE UPDATE ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_products_lock_tenant ON public.products;
CREATE TRIGGER trg_products_lock_tenant
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_combos_lock_tenant ON public.combos;
CREATE TRIGGER trg_combos_lock_tenant
  BEFORE UPDATE ON public.combos
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_sales_lock_tenant ON public.sales;
CREATE TRIGGER trg_sales_lock_tenant
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_expenses_lock_tenant ON public.expenses;
CREATE TRIGGER trg_expenses_lock_tenant
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

-- ----------------------------------------------------------------------------
-- 5. FUNCOES AUXILIARES DE AUTORIZACAO E VINCULO POR TENANT
--
-- Analise de seguranca do uso minimo de SECURITY DEFINER:
--   1. get_my_tenant_ids(): zero parametros; usa exclusivamente auth.uid()
--      para evitar recursao infinita de RLS ao consultar tenant_members.
--   2. is_tenant_member(p_tenant_id): valida p_tenant_id contra auth.uid().
--   3. is_tenant_owner(p_tenant_id): valida papel 'owner' contra auth.uid().
--   4. has_active_tenant_access(p_tenant_id): valida vinculo ativo +
--      status do tenant + assinatura/isencao, sem expor subscriptions/tenants.
--   5. claim_pending_memberships(): vincula user_id = auth.uid() apenas quando
--      auth.users.email_confirmed_at IS NOT NULL (nunca usa user_metadata).
-- Todas fixam search_path = pg_catalog, public (e auth onde aplicavel) e
-- tem EXECUTE revogado de PUBLIC/anon.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT tm.tenant_id
  FROM public.tenant_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = auth.uid()
    AND tm.active = true
    AND t.status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.active = true
      AND t.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_owner(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.active = true
      AND tm.role = 'owner'
      AND t.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_tenant_access(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.active = true
      AND t.status = 'active'
      AND (
        t.billing_exempt = true
        OR s.status IN ('authorized', 'exempt')
        OR (s.status = 'paused' AND s.grace_until IS NOT NULL AND s.grace_until > now())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.claim_pending_memberships()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_confirmed_at timestamptz;
  v_claimed_count integer := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.';
  END IF;

  SELECT lower(btrim(u.email)), u.email_confirmed_at
  INTO v_email, v_confirmed_at
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR v_confirmed_at IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.tenant_members tm
  SET
    user_id = v_uid,
    claimed_at = now(),
    updated_at = now()
  WHERE tm.user_id IS NULL
    AND tm.active = true
    AND tm.email = v_email
    AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_members existing
      WHERE existing.tenant_id = tm.tenant_id
        AND existing.user_id = v_uid
    );

  GET DIAGNOSTICS v_claimed_count = ROW_COUNT;
  RETURN v_claimed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_tenant_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_ids() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_tenant_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_tenant_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_active_tenant_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_tenant_access(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_pending_memberships() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_pending_memberships() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) E POLITICAS DE ISOLAMENTO POR TENANT
-- ----------------------------------------------------------------------------

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Revoga acesso anonimo direto em todas as tabelas
REVOKE ALL ON TABLE
  public.tenants,
  public.tenant_members,
  public.subscriptions,
  public.mp_webhook_events,
  public.shop_settings,
  public.products,
  public.combos,
  public.sales,
  public.expenses
FROM anon;

-- Garante privilegios minimos necessarios a authenticated (filtrados por RLS)
REVOKE ALL ON TABLE public.mp_webhook_events FROM authenticated;
REVOKE ALL ON TABLE public.subscriptions FROM authenticated;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;
REVOKE INSERT, DELETE ON TABLE public.tenants FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_members TO authenticated;
REVOKE DELETE ON TABLE public.shop_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.shop_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.products,
  public.combos,
  public.sales,
  public.expenses
TO authenticated;

-- ---- tenants ----
DROP POLICY IF EXISTS tenants_select_member ON public.tenants;
CREATE POLICY tenants_select_member
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS tenants_update_owner ON public.tenants;
CREATE POLICY tenants_update_owner
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (public.is_tenant_owner(id))
  WITH CHECK (public.is_tenant_owner(id));

-- ---- tenant_members ----
DROP POLICY IF EXISTS tenant_members_select_same_tenant ON public.tenant_members;
CREATE POLICY tenant_members_select_same_tenant
  ON public.tenant_members
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS tenant_members_insert_owner_only ON public.tenant_members;
CREATE POLICY tenant_members_insert_owner_only
  ON public.tenant_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_tenant_owner(tenant_id)
    AND role = 'admin'
    AND is_founder = false
    AND user_id IS NULL
  );

DROP POLICY IF EXISTS tenant_members_update_owner_only ON public.tenant_members;
CREATE POLICY tenant_members_update_owner_only
  ON public.tenant_members
  FOR UPDATE
  TO authenticated
  USING (
    public.is_tenant_owner(tenant_id)
    AND user_id IS DISTINCT FROM auth.uid()
    AND role = 'admin'
  )
  WITH CHECK (
    public.is_tenant_owner(tenant_id)
    AND role = 'admin'
    AND is_founder = false
  );

DROP POLICY IF EXISTS tenant_members_delete_owner_only ON public.tenant_members;
CREATE POLICY tenant_members_delete_owner_only
  ON public.tenant_members
  FOR DELETE
  TO authenticated
  USING (
    public.is_tenant_owner(tenant_id)
    AND user_id IS DISTINCT FROM auth.uid()
    AND role = 'admin'
    AND is_founder = false
  );

-- ---- subscriptions (somente leitura pelo membro; escrita exclusiva service_role) ----
DROP POLICY IF EXISTS subscriptions_select_member ON public.subscriptions;
CREATE POLICY subscriptions_select_member
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- ---- mp_webhook_events (nenhuma policy para authenticated/anon) ----

-- ---- shop_settings ----
DROP POLICY IF EXISTS shop_settings_select_member ON public.shop_settings;
CREATE POLICY shop_settings_select_member
  ON public.shop_settings
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS shop_settings_insert_active_member ON public.shop_settings;
CREATE POLICY shop_settings_insert_active_member
  ON public.shop_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS shop_settings_update_active_member ON public.shop_settings;
CREATE POLICY shop_settings_update_active_member
  ON public.shop_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id))
  WITH CHECK (public.has_active_tenant_access(tenant_id));

-- ---- products ----
DROP POLICY IF EXISTS products_select_member ON public.products;
CREATE POLICY products_select_member
  ON public.products
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS products_insert_active_member ON public.products;
CREATE POLICY products_insert_active_member
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS products_update_active_member ON public.products;
CREATE POLICY products_update_active_member
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id))
  WITH CHECK (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS products_delete_active_member ON public.products;
CREATE POLICY products_delete_active_member
  ON public.products
  FOR DELETE
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

-- ---- combos ----
DROP POLICY IF EXISTS combos_select_member ON public.combos;
CREATE POLICY combos_select_member
  ON public.combos
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS combos_insert_active_member ON public.combos;
CREATE POLICY combos_insert_active_member
  ON public.combos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS combos_update_active_member ON public.combos;
CREATE POLICY combos_update_active_member
  ON public.combos
  FOR UPDATE
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id))
  WITH CHECK (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS combos_delete_active_member ON public.combos;
CREATE POLICY combos_delete_active_member
  ON public.combos
  FOR DELETE
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

-- ---- sales ----
DROP POLICY IF EXISTS sales_select_member ON public.sales;
CREATE POLICY sales_select_member
  ON public.sales
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS sales_insert_active_member ON public.sales;
CREATE POLICY sales_insert_active_member
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS sales_update_active_member ON public.sales;
CREATE POLICY sales_update_active_member
  ON public.sales
  FOR UPDATE
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id))
  WITH CHECK (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS sales_delete_active_member ON public.sales;
CREATE POLICY sales_delete_active_member
  ON public.sales
  FOR DELETE
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

-- ---- expenses ----
DROP POLICY IF EXISTS expenses_select_member ON public.expenses;
CREATE POLICY expenses_select_member
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS expenses_insert_active_member ON public.expenses;
CREATE POLICY expenses_insert_active_member
  ON public.expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS expenses_update_active_member ON public.expenses;
CREATE POLICY expenses_update_active_member
  ON public.expenses
  FOR UPDATE
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id))
  WITH CHECK (public.has_active_tenant_access(tenant_id));

DROP POLICY IF EXISTS expenses_delete_active_member ON public.expenses;
CREATE POLICY expenses_delete_active_member
  ON public.expenses
  FOR DELETE
  TO authenticated
  USING (public.has_active_tenant_access(tenant_id));

COMMIT;
