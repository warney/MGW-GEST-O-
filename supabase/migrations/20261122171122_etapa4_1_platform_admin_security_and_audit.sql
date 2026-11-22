-- ============================================================================
-- MGW ADMIN — ETAPA 4 / FASE 4.1: SEGURANCA, AUDITORIA E CONSOLE DA PLATAFORMA
-- Migration: 20261122000001_etapa4_1_platform_admin_security_and_audit.sql
--
-- Regras obrigatorias:
--   * Migration 100% ADITIVA sobre o schema existente do MGW Gestao SaaS.
--   * NAO altera dados existentes, NAO altera policies RLS operacionais de
--     tenants/vendas/cardapio e NAO cria usuarios ficticios.
--   * Toda operacao administrativa passa por public.platform_admins, verificacao
--     de email confirmado em auth.users, papel RBAC (super_admin, support,
--     finance), MFA AAL2 para mutacoes criticas e trilha imutavel em
--     public.platform_audit_logs.
--   * NAO executar automaticamente sem revisao e regularizacao previa do
--     historico de migrations no Supabase remoto.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. TABELAS DE ADMINISTRACAO DA PLATAFORMA, AUDITORIA, SUPORTE E PAGAMENTOS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE
    CONSTRAINT chk_platform_admins_email_normalized CHECK (
      email = lower(btrim(email))
      AND position('@' IN email) > 1
    ),
  full_name text NOT NULL DEFAULT ''
    CONSTRAINT chk_platform_admins_name_len CHECK (char_length(full_name) <= 120),
  role text NOT NULL
    CONSTRAINT chk_platform_admins_role CHECK (role IN ('super_admin', 'support', 'finance')),
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT ''
    CONSTRAINT chk_platform_admins_notes_len CHECK (char_length(notes) <= 500),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_admins IS
  'Administradores autorizados do painel MGW Admin. Fonte unica de verdade para autorizacao da plataforma.';

CREATE INDEX IF NOT EXISTS idx_platform_admins_active_role
  ON public.platform_admins (active, role);

CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email text NOT NULL DEFAULT '',
  admin_role text NOT NULL DEFAULT '',
  action text NOT NULL
    CONSTRAINT chk_platform_audit_action_nonempty CHECK (char_length(btrim(action)) > 0),
  target_type text NOT NULL
    CONSTRAINT chk_platform_audit_target_type_nonempty CHECK (char_length(btrim(target_type)) > 0),
  target_id text NOT NULL DEFAULT '',
  before_data jsonb,
  after_data jsonb,
  reason text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT chk_platform_audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_audit_logs IS
  'Trilha imutavel (append-only) de acoes administrativas criticas executadas no MGW Admin.';

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_created
  ON public.platform_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_action_target
  ON public.platform_audit_logs (action, target_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id integer PRIMARY KEY DEFAULT 1
    CONSTRAINT chk_platform_settings_singleton CHECK (id = 1),
  platform_name text NOT NULL DEFAULT 'MGW Gestão'
    CONSTRAINT chk_platform_settings_name_nonempty CHECK (char_length(btrim(platform_name)) > 0),
  default_plan_code text NOT NULL DEFAULT 'mgw_mensal_49' REFERENCES public.plans(code),
  default_plan_amount_cents integer NOT NULL DEFAULT 4990
    CONSTRAINT chk_platform_settings_amount CHECK (default_plan_amount_cents >= 0),
  trial_days integer NOT NULL DEFAULT 3
    CONSTRAINT chk_platform_settings_trial_days CHECK (trial_days >= 1 AND trial_days <= 90),
  grace_days integer NOT NULL DEFAULT 3
    CONSTRAINT chk_platform_settings_grace_days CHECK (grace_days >= 0 AND grace_days <= 30),
  retention_months integer NOT NULL DEFAULT 6
    CONSTRAINT chk_platform_settings_retention_months CHECK (retention_months >= 1 AND retention_months <= 24),
  support_email text NOT NULL DEFAULT '',
  support_whatsapp text NOT NULL DEFAULT '',
  allow_public_signup boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_settings IS
  'Configuracoes globais da plataforma MGW Gestao SaaS (registro singleton id = 1).';

INSERT INTO public.platform_settings (
  id,
  platform_name,
  default_plan_code,
  default_plan_amount_cents,
  trial_days,
  grace_days,
  retention_months,
  allow_public_signup,
  maintenance_mode
)
VALUES (
  1,
  'MGW Gestão',
  'mgw_mensal_49',
  4990,
  3,
  3,
  6,
  true,
  false
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'mercadopago'
    CONSTRAINT chk_platform_payments_provider CHECK (provider IN ('mercadopago', 'manual_adjustment')),
  mp_payment_id text UNIQUE,
  mp_preapproval_id text,
  amount_cents integer NOT NULL
    CONSTRAINT chk_platform_payments_amount CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'BRL'
    CONSTRAINT chk_platform_payments_currency CHECK (currency = 'BRL'),
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_platform_payments_status CHECK (
      status IN ('pending', 'approved', 'rejected', 'refunded', 'cancelled', 'in_process')
    ),
  payment_method text NOT NULL DEFAULT '',
  payer_email text NOT NULL DEFAULT '',
  failure_reason text NOT NULL DEFAULT '',
  paid_at timestamptz,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_payments IS
  'Historico estruturado de cobrancas e pagamentos de assinaturas SaaS (compatibilidade futura com Mercado Pago).';

CREATE INDEX IF NOT EXISTS idx_platform_payments_tenant_created
  ON public.platform_payments (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_payments_status_created
  ON public.platform_payments (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  requester_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_email text NOT NULL DEFAULT '',
  subject text NOT NULL
    CONSTRAINT chk_support_tickets_subject_nonempty CHECK (char_length(btrim(subject)) >= 3),
  category text NOT NULL DEFAULT 'technical'
    CONSTRAINT chk_support_tickets_category CHECK (
      category IN ('billing', 'technical', 'onboarding', 'digital_menu', 'other')
    ),
  priority text NOT NULL DEFAULT 'medium'
    CONSTRAINT chk_support_tickets_priority CHECK (
      priority IN ('low', 'medium', 'high', 'urgent')
    ),
  status text NOT NULL DEFAULT 'open'
    CONSTRAINT chk_support_tickets_status CHECK (
      status IN ('open', 'in_progress', 'waiting_client', 'resolved', 'closed')
    ),
  assigned_admin_id uuid REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  resolution_note text NOT NULL DEFAULT '',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority
  ON public.support_tickets (status, priority, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant
  ON public.support_tickets (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL
    CONSTRAINT chk_support_messages_sender_type CHECK (
      sender_type IN ('platform_admin', 'client', 'system')
    ),
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_email text NOT NULL DEFAULT '',
  message text NOT NULL
    CONSTRAINT chk_support_messages_nonempty CHECK (char_length(btrim(message)) > 0),
  is_internal_note boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
  ON public.support_ticket_messages (ticket_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- 2. TRIGGERS DE INTEGRIDADE, IMUTABILIDADE E PROTECAO CONTRA AUTO-ESCALACAO
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Registros em platform_audit_logs sao imutaveis e nao podem ser alterados ou excluidos.';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_audit_log_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_platform_audit_logs_immutable ON public.platform_audit_logs;
CREATE TRIGGER trg_platform_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

CREATE OR REPLACE FUNCTION public.guard_platform_admin_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_remaining_super_admins integer;
BEGIN
  -- Impede edicao direta fora de role privilegiado ou RPC auditado da plataforma
  IF NOT public.is_privileged_db_role()
     AND coalesce(current_setting('mgw.admin_rpc_active', true), '') <> 'platform_admins' THEN
    RAISE EXCEPTION 'Alteracao direta de platform_admins nao e permitida. Utilize os fluxos administrativos autorizados.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'super_admin' AND OLD.active = true THEN
      SELECT count(*) INTO v_remaining_super_admins
      FROM public.platform_admins
      WHERE role = 'super_admin' AND active = true AND id <> OLD.id;

      IF v_remaining_super_admins = 0 THEN
        RAISE EXCEPTION 'Nao e permitido remover o ultimo super_admin ativo da plataforma.';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'super_admin' AND OLD.active = true
       AND (NEW.role <> 'super_admin' OR NEW.active = false) THEN
      SELECT count(*) INTO v_remaining_super_admins
      FROM public.platform_admins
      WHERE role = 'super_admin' AND active = true AND id <> OLD.id;

      IF v_remaining_super_admins = 0 THEN
        RAISE EXCEPTION 'Nao e permitido rebaixar ou desativar o ultimo super_admin ativo da plataforma.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_platform_admin_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_platform_admins_updated_at ON public.platform_admins;
CREATE TRIGGER trg_platform_admins_updated_at
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_platform_admins_guard ON public.platform_admins;
CREATE TRIGGER trg_platform_admins_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.guard_platform_admin_changes();

DROP TRIGGER IF EXISTS trg_platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER trg_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_platform_payments_updated_at ON public.platform_payments;
CREATE TRIGGER trg_platform_payments_updated_at
  BEFORE UPDATE ON public.platform_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. FUNCOES AUXILIARES DE AUTORIZACAO E AUDITORIA DA PLATAFORMA
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_admin(
  p_allowed_roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins pa
    JOIN auth.users u ON u.id = pa.user_id
    WHERE pa.user_id = auth.uid()
      AND pa.active = true
      AND u.email_confirmed_at IS NOT NULL
      AND (
        p_allowed_roles IS NULL
        OR pa.role = ANY(p_allowed_roles)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_mfa_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

CREATE OR REPLACE FUNCTION public.assert_platform_admin(
  p_allowed_roles text[] DEFAULT ARRAY['super_admin', 'support', 'finance'],
  p_require_mfa boolean DEFAULT false
)
RETURNS public.platform_admins
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid uuid;
  v_confirmed_at timestamptz;
  v_admin public.platform_admins%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.';
  END IF;

  SELECT u.email_confirmed_at
  INTO v_confirmed_at
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'E-mail administrativo nao verificado.';
  END IF;

  SELECT pa.*
  INTO v_admin
  FROM public.platform_admins pa
  WHERE pa.user_id = v_uid
    AND pa.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso restrito a administradores autorizados do MGW Admin.';
  END IF;

  IF p_allowed_roles IS NOT NULL AND NOT (v_admin.role = ANY(p_allowed_roles)) THEN
    RAISE EXCEPTION 'Seu papel administrativo (%) nao possui permissao para esta operacao.', v_admin.role;
  END IF;

  IF p_require_mfa AND NOT public.is_platform_mfa_aal2() THEN
    RAISE EXCEPTION 'Autenticacao multifator (MFA/AAL2) obrigatoria para esta acao critica.';
  END IF;

  RETURN v_admin;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_platform_audit_log(
  p_admin public.platform_admins,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_reason text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.platform_audit_logs (
    admin_user_id,
    admin_email,
    admin_role,
    action,
    target_type,
    target_id,
    before_data,
    after_data,
    reason,
    metadata
  )
  VALUES (
    p_admin.user_id,
    p_admin.email,
    p_admin.role,
    btrim(p_action),
    btrim(p_target_type),
    coalesce(p_target_id, ''),
    p_before_data,
    p_after_data,
    left(btrim(coalesce(p_reason, '')), 500),
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_platform_mfa_aal2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_mfa_aal2() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assert_platform_admin(text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_platform_admin(text[], boolean) TO service_role;

REVOKE ALL ON FUNCTION public.write_platform_audit_log(public.platform_admins, text, text, text, jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) E PRIVILEGIOS DAS NOVAS TABELAS
-- ----------------------------------------------------------------------------

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.platform_admins,
  public.platform_audit_logs,
  public.platform_settings,
  public.platform_payments,
  public.support_tickets,
  public.support_ticket_messages
FROM PUBLIC, anon, authenticated;

-- Leitura restrita aos proprios admins da plataforma via RLS + RPCs auditados
GRANT SELECT ON TABLE
  public.platform_admins,
  public.platform_audit_logs,
  public.platform_settings,
  public.platform_payments,
  public.support_tickets,
  public.support_ticket_messages
TO authenticated;

-- platform_admins: super_admin ve todos; demais admins veem apenas seu proprio registro
DROP POLICY IF EXISTS platform_admins_select_authorized ON public.platform_admins;
CREATE POLICY platform_admins_select_authorized
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(ARRAY['super_admin'])
    OR (user_id = auth.uid() AND public.is_platform_admin(NULL))
  );

-- platform_audit_logs: leitura exclusiva de administradores ativos da plataforma
DROP POLICY IF EXISTS platform_audit_logs_select_admin ON public.platform_audit_logs;
CREATE POLICY platform_audit_logs_select_admin
  ON public.platform_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(ARRAY['super_admin', 'support', 'finance']));

-- platform_settings: leitura exclusiva de administradores ativos
DROP POLICY IF EXISTS platform_settings_select_admin ON public.platform_settings;
CREATE POLICY platform_settings_select_admin
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(ARRAY['super_admin', 'support', 'finance']));

-- platform_payments: leitura para super_admin e finance
DROP POLICY IF EXISTS platform_payments_select_finance ON public.platform_payments;
CREATE POLICY platform_payments_select_finance
  ON public.platform_payments
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(ARRAY['super_admin', 'finance']));

-- support_tickets & messages: leitura para admins da plataforma ou membros do tenant vinculado (nao internas)
DROP POLICY IF EXISTS support_tickets_select_authorized ON public.support_tickets;
CREATE POLICY support_tickets_select_authorized
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(ARRAY['super_admin', 'support', 'finance'])
    OR (
      tenant_id IS NOT NULL
      AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin'])
    )
  );

DROP POLICY IF EXISTS support_ticket_messages_select_authorized ON public.support_ticket_messages;
CREATE POLICY support_ticket_messages_select_authorized
  ON public.support_ticket_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(ARRAY['super_admin', 'support', 'finance'])
    OR (
      is_internal_note = false
      AND EXISTS (
        SELECT 1
        FROM public.support_tickets st
        WHERE st.id = support_ticket_messages.ticket_id
          AND st.tenant_id IS NOT NULL
          AND public.has_tenant_role(st.tenant_id, ARRAY['owner', 'admin'])
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 5. RPCS AUDITADOS DO CONSOLE MGW ADMIN (MODULOS 1 A 10)
-- ----------------------------------------------------------------------------

-- Perfil do administrador autenticado + nivel MFA atual
CREATE OR REPLACE FUNCTION public.admin_get_my_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_confirmed_at timestamptz;
  v_admin public.platform_admins%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.email_confirmed_at INTO v_confirmed_at
  FROM auth.users u WHERE u.id = v_uid;

  IF v_confirmed_at IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT pa.* INTO v_admin
  FROM public.platform_admins pa
  WHERE pa.user_id = v_uid AND pa.active = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_admin.id,
    'userId', v_admin.user_id,
    'email', v_admin.email,
    'fullName', v_admin.full_name,
    'role', v_admin.role,
    'active', v_admin.active,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'mfaVerified', public.is_platform_mfa_aal2(),
    'createdAt', v_admin.created_at
  );
END;
$$;

-- Modulo 1: Dashboard executivo da plataforma
CREATE OR REPLACE FUNCTION public.admin_get_platform_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_now timestamptz := now();
  v_30d timestamptz := now() - interval '30 days';
  v_total_clients integer;
  v_total_tenants integer;
  v_active_tenants integer;
  v_suspended_tenants integer;
  v_founder_tenants integer;
  v_trial_active integer;
  v_paid_active integer;
  v_past_due integer;
  v_cancelled_or_expired integer;
  v_retention_active integer;
  v_mrr_cents bigint;
  v_approved_payments_cents bigint;
  v_pending_payments_count integer;
  v_failed_payments_count integer;
  v_open_tickets_count integer;
  v_webhook_failed_count integer;
  v_total_sales_30d integer;
  v_total_online_orders_30d integer;
  v_monthly_series jsonb;
  v_recent_tenants jsonb;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'support', 'finance'], false);

  SELECT count(DISTINCT u.id)::integer INTO v_total_clients
  FROM auth.users u
  WHERE u.deleted_at IS NULL;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE status = 'active')::integer,
    count(*) FILTER (WHERE status = 'suspended')::integer,
    count(*) FILTER (WHERE is_founder_account = true)::integer
  INTO v_total_tenants, v_active_tenants, v_suspended_tenants, v_founder_tenants
  FROM public.tenants;

  SELECT
    count(*) FILTER (WHERE s.status = 'trialing' AND (s.trial_ends_at IS NULL OR s.trial_ends_at > v_now))::integer,
    count(*) FILTER (WHERE s.status IN ('authorized', 'active'))::integer,
    count(*) FILTER (WHERE s.status IN ('past_due', 'paused'))::integer,
    count(*) FILTER (WHERE s.status IN ('cancelled', 'expired', 'suspended'))::integer,
    count(*) FILTER (WHERE s.retention_status = 'active_retention')::integer,
    coalesce(sum(s.plan_amount_cents) FILTER (WHERE s.status IN ('authorized', 'active') AND t.billing_exempt = false), 0)::bigint
  INTO
    v_trial_active,
    v_paid_active,
    v_past_due,
    v_cancelled_or_expired,
    v_retention_active,
    v_mrr_cents
  FROM public.subscriptions s
  JOIN public.tenants t ON t.id = s.tenant_id;

  SELECT
    coalesce(sum(amount_cents) FILTER (WHERE status = 'approved'), 0)::bigint,
    count(*) FILTER (WHERE status IN ('pending', 'in_process'))::integer,
    count(*) FILTER (WHERE status = 'rejected')::integer
  INTO v_approved_payments_cents, v_pending_payments_count, v_failed_payments_count
  FROM public.platform_payments;

  SELECT count(*) FILTER (WHERE status IN ('open', 'in_progress', 'waiting_client'))::integer
  INTO v_open_tickets_count
  FROM public.support_tickets;

  SELECT count(*) FILTER (WHERE processing_status = 'failed')::integer
  INTO v_webhook_failed_count
  FROM public.mp_webhook_events;

  SELECT count(*)::integer INTO v_total_sales_30d
  FROM public.sales WHERE created_at >= v_30d;

  SELECT count(*)::integer INTO v_total_online_orders_30d
  FROM public.online_orders WHERE created_at >= v_30d;

  SELECT coalesce(jsonb_agg(row_to_json(m) ORDER BY m.month_key), '[]'::jsonb)
  INTO v_monthly_series
  FROM (
    SELECT
      to_char(gs.month_start, 'YYYY-MM') AS month_key,
      to_char(gs.month_start, 'Mon/YY') AS label,
      (SELECT count(*)::integer FROM public.tenants t WHERE date_trunc('month', t.created_at) = gs.month_start) AS new_tenants,
      (SELECT count(*)::integer FROM public.subscriptions s WHERE date_trunc('month', s.created_at) = gs.month_start AND s.status IN ('authorized', 'active')) AS new_paid,
      (SELECT count(*)::integer FROM public.sales sa WHERE date_trunc('month', sa.created_at) = gs.month_start) AS sales_count
    FROM generate_series(
      date_trunc('month', v_now) - interval '5 months',
      date_trunc('month', v_now),
      interval '1 month'
    ) AS gs(month_start)
  ) m;

  SELECT coalesce(jsonb_agg(row_to_json(rt)), '[]'::jsonb)
  INTO v_recent_tenants
  FROM (
    SELECT
      t.id,
      t.slug,
      t.name,
      t.status,
      t.is_founder_account AS is_founder,
      t.billing_exempt,
      t.onboarding_completed,
      t.created_at,
      s.status AS subscription_status,
      s.plan_code,
      s.trial_ends_at
    FROM public.tenants t
    LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
    ORDER BY t.created_at DESC
    LIMIT 6
  ) rt;

  RETURN jsonb_build_object(
    'totalClients', v_total_clients,
    'totalTenants', v_total_tenants,
    'activeTenants', v_active_tenants,
    'suspendedTenants', v_suspended_tenants,
    'founderTenants', v_founder_tenants,
    'trialActive', v_trial_active,
    'paidActive', v_paid_active,
    'pastDue', v_past_due,
    'cancelledOrExpired', v_cancelled_or_expired,
    'retentionActive', v_retention_active,
    'mrrCents', v_mrr_cents,
    'approvedPaymentsCents', v_approved_payments_cents,
    'pendingPaymentsCount', v_pending_payments_count,
    'failedPaymentsCount', v_failed_payments_count,
    'openTicketsCount', v_open_tickets_count,
    'webhookFailedCount', v_webhook_failed_count,
    'salesCount30d', v_total_sales_30d,
    'onlineOrdersCount30d', v_total_online_orders_30d,
    'monthlySeries', v_monthly_series,
    'recentTenants', v_recent_tenants
  );
END;
$$;

-- Modulo 2: Gestao de Clientes / Usuarios
CREATE OR REPLACE FUNCTION public.admin_list_clients(
  p_search text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_search text := '%' || lower(btrim(coalesce(p_search, ''))) || '%';
  v_limit integer := greatest(1, least(200, coalesce(p_limit, 50)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_items jsonb;
  v_total integer;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'support', 'finance'], false);

  SELECT count(*)::integer INTO v_total
  FROM auth.users u
  LEFT JOIN public.user_profiles up ON up.user_id = u.id
  WHERE u.deleted_at IS NULL
    AND (
      v_search = '%%'
      OR lower(coalesce(u.email, '')) LIKE v_search
      OR lower(coalesce(up.full_name, '')) LIKE v_search
    );

  SELECT coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      u.id AS user_id,
      lower(btrim(coalesce(u.email, ''))) AS email,
      coalesce(nullif(up.full_name, ''), coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')) AS full_name,
      u.email_confirmed_at,
      u.last_sign_in_at,
      u.created_at,
      u.banned_until,
      up.default_tenant_id,
      coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'memberId', tm.id,
          'tenantId', t.id,
          'tenantName', t.name,
          'tenantSlug', t.slug,
          'tenantStatus', t.status,
          'role', tm.role,
          'memberActive', tm.active,
          'isFounder', tm.is_founder,
          'subscriptionStatus', s.status,
          'planCode', s.plan_code
        ) ORDER BY tm.created_at ASC)
        FROM public.tenant_members tm
        JOIN public.tenants t ON t.id = tm.tenant_id
        LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
        WHERE tm.user_id = u.id
      ), '[]'::jsonb) AS memberships,
      EXISTS (
        SELECT 1 FROM public.platform_admins pa
        WHERE pa.user_id = u.id AND pa.active = true
      ) AS is_platform_admin
    FROM auth.users u
    LEFT JOIN public.user_profiles up ON up.user_id = u.id
    WHERE u.deleted_at IS NULL
      AND (
        v_search = '%%'
        OR lower(coalesce(u.email, '')) LIKE v_search
        OR lower(coalesce(up.full_name, '')) LIKE v_search
      )
    ORDER BY u.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) c;

  RETURN jsonb_build_object(
    'total', v_total,
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_member_active(
  p_member_id uuid,
  p_active boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_member public.tenant_members%ROWTYPE;
  v_clean_reason text := left(btrim(coalesce(p_reason, '')), 500);
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin'], true);

  IF char_length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo administrativo (minimo 3 caracteres).';
  END IF;

  SELECT * INTO v_member FROM public.tenant_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vinculo de usuario nao encontrado.';
  END IF;

  IF v_member.user_id = v_admin.user_id AND p_active = false THEN
    RAISE EXCEPTION 'Nao e permitido desativar seu proprio vinculo por esta acao.';
  END IF;

  UPDATE public.tenant_members
  SET active = p_active, updated_at = now()
  WHERE id = p_member_id;

  PERFORM public.write_platform_audit_log(
    v_admin,
    CASE WHEN p_active THEN 'member_reactivated' ELSE 'member_suspended' END,
    'tenant_member',
    p_member_id::text,
    jsonb_build_object('active', v_member.active, 'role', v_member.role, 'tenantId', v_member.tenant_id),
    jsonb_build_object('active', p_active, 'role', v_member.role, 'tenantId', v_member.tenant_id),
    v_clean_reason
  );

  RETURN jsonb_build_object('memberId', p_member_id, 'active', p_active);
END;
$$;

-- Modulo 3: Gestao de Estabelecimentos (Tenants)
CREATE OR REPLACE FUNCTION public.admin_list_establishments(
  p_search text DEFAULT '',
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_search text := '%' || lower(btrim(coalesce(p_search, ''))) || '%';
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
  v_limit integer := greatest(1, least(200, coalesce(p_limit, 50)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_items jsonb;
  v_total integer;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'support', 'finance'], false);

  SELECT count(*)::integer INTO v_total
  FROM public.tenants t
  LEFT JOIN public.shop_settings ss ON ss.tenant_id = t.id
  WHERE (v_status = 'all' OR t.status = v_status)
    AND (
      v_search = '%%'
      OR lower(t.name) LIKE v_search
      OR lower(t.slug) LIKE v_search
      OR lower(coalesce(ss.owner_email, '')) LIKE v_search
    );

  SELECT coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      t.id,
      t.slug,
      t.name,
      t.status,
      t.is_founder_account,
      t.billing_exempt,
      t.onboarding_completed,
      t.created_at,
      t.updated_at,
      ss.owner_email,
      ss.timezone,
      s.plan_code,
      s.plan_amount_cents,
      s.status AS subscription_status,
      s.trial_ends_at,
      s.current_period_end,
      s.grace_until,
      s.retention_status,
      s.retention_ends_at,
      coalesce(dm.is_active, false) AS digital_menu_active,
      dm.slug AS digital_menu_slug,
      (SELECT count(*)::integer FROM public.tenant_members tm WHERE tm.tenant_id = t.id AND tm.active = true) AS active_members_count,
      (SELECT count(*)::integer FROM public.products p WHERE p.tenant_id = t.id AND p.active = true) AS products_count,
      (SELECT count(*)::integer FROM public.sales sa WHERE sa.tenant_id = t.id) AS sales_count,
      (SELECT count(*)::integer FROM public.online_orders oo WHERE oo.tenant_id = t.id) AS online_orders_count,
      (SELECT max(sa.created_at) FROM public.sales sa WHERE sa.tenant_id = t.id) AS last_sale_at
    FROM public.tenants t
    LEFT JOIN public.shop_settings ss ON ss.tenant_id = t.id
    LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
    LEFT JOIN public.digital_menu_settings dm ON dm.tenant_id = t.id
    WHERE (v_status = 'all' OR t.status = v_status)
      AND (
        v_search = '%%'
        OR lower(t.name) LIKE v_search
        OR lower(t.slug) LIKE v_search
        OR lower(coalesce(ss.owner_email, '')) LIKE v_search
      )
    ORDER BY t.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) e;

  RETURN jsonb_build_object('total', v_total, 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_establishment_status(
  p_tenant_id uuid,
  p_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_clean_reason text := left(btrim(coalesce(p_reason, '')), 500);
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin'], true);

  IF p_status NOT IN ('active', 'suspended', 'archived') THEN
    RAISE EXCEPTION 'Status de estabelecimento invalido: %', p_status;
  END IF;

  IF char_length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da alteracao (minimo 3 caracteres).';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento nao encontrado.';
  END IF;

  IF v_tenant.is_founder_account = true AND p_status = 'archived' THEN
    RAISE EXCEPTION 'Estabelecimento fundador nao pode ser arquivado por seguranca.';
  END IF;

  UPDATE public.tenants
  SET status = p_status, updated_at = now()
  WHERE id = p_tenant_id;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'tenant_status_' || p_status,
    'tenant',
    p_tenant_id::text,
    jsonb_build_object('status', v_tenant.status, 'name', v_tenant.name),
    jsonb_build_object('status', p_status, 'name', v_tenant.name),
    v_clean_reason
  );

  RETURN jsonb_build_object('tenantId', p_tenant_id, 'status', p_status);
END;
$$;

-- Modulo 4: Planos e Assinaturas
CREATE OR REPLACE FUNCTION public.admin_list_plans_and_subscriptions(
  p_status text DEFAULT 'all',
  p_search text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
  v_search text := '%' || lower(btrim(coalesce(p_search, ''))) || '%';
  v_plans jsonb;
  v_subscriptions jsonb;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'support', 'finance'], false);

  SELECT coalesce(jsonb_agg(row_to_json(p) ORDER BY p.amount_cents ASC, p.code ASC), '[]'::jsonb)
  INTO v_plans
  FROM (
    SELECT code, name, description, amount_cents, currency, billing_interval, max_members, active, updated_at
    FROM public.plans
  ) p;

  SELECT coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb)
  INTO v_subscriptions
  FROM (
    SELECT
      sub.id,
      sub.tenant_id,
      t.name AS tenant_name,
      t.slug AS tenant_slug,
      t.status AS tenant_status,
      t.is_founder_account,
      t.billing_exempt,
      sub.plan_code,
      sub.plan_amount_cents,
      sub.currency,
      sub.status,
      sub.mp_preapproval_id,
      sub.mp_payer_email,
      sub.trial_ends_at,
      sub.current_period_start,
      sub.current_period_end,
      sub.grace_until,
      sub.ended_at,
      sub.retention_status,
      sub.retention_started_at,
      sub.retention_ends_at,
      sub.cancelled_at,
      sub.updated_at
    FROM public.subscriptions sub
    JOIN public.tenants t ON t.id = sub.tenant_id
    WHERE (v_status = 'all' OR sub.status = v_status)
      AND (
        v_search = '%%'
        OR lower(t.name) LIKE v_search
        OR lower(t.slug) LIKE v_search
        OR lower(coalesce(sub.mp_payer_email, '')) LIKE v_search
      )
    ORDER BY sub.updated_at DESC
  ) s;

  RETURN jsonb_build_object(
    'plans', v_plans,
    'subscriptions', v_subscriptions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_plan(
  p_code text,
  p_name text,
  p_description text,
  p_amount_cents integer,
  p_max_members integer,
  p_active boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_clean_reason text := left(btrim(coalesce(p_reason, '')), 500);
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin'], true);

  IF char_length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da alteracao do plano (minimo 3 caracteres).';
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano nao encontrado: %', p_code;
  END IF;

  IF p_code = 'founder_exempt' AND (p_amount_cents <> 0 OR p_active = false) THEN
    RAISE EXCEPTION 'O plano founder_exempt deve permanecer ativo e com valor zero.';
  END IF;

  IF p_amount_cents < 0 THEN
    RAISE EXCEPTION 'Valor do plano nao pode ser negativo.';
  END IF;

  IF p_max_members < 1 OR p_max_members > 100 THEN
    RAISE EXCEPTION 'Limite de membros deve estar entre 1 e 100.';
  END IF;

  UPDATE public.plans
  SET
    name = left(btrim(p_name), 100),
    description = left(btrim(coalesce(p_description, '')), 300),
    amount_cents = p_amount_cents,
    max_members = p_max_members,
    active = p_active,
    updated_at = now()
  WHERE code = p_code;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'plan_updated',
    'plan',
    p_code,
    to_jsonb(v_plan),
    jsonb_build_object('name', p_name, 'amount_cents', p_amount_cents, 'max_members', p_max_members, 'active', p_active),
    v_clean_reason
  );

  RETURN jsonb_build_object('code', p_code, 'updated', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_manage_subscription(
  p_tenant_id uuid,
  p_action text,
  p_days integer DEFAULT NULL,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_clean_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_days integer := greatest(1, least(90, coalesce(p_days, 7)));
  v_now timestamptz := now();
  v_end timestamptz;
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin', 'finance'], true);

  IF char_length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo administrativo (minimo 3 caracteres).';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento nao encontrado.';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura nao encontrada para este estabelecimento.';
  END IF;

  IF p_action = 'extend_trial' THEN
    v_end := greatest(coalesce(v_sub.trial_ends_at, v_now), v_now) + make_interval(days => v_days);
    UPDATE public.tenants SET status = 'active', updated_at = v_now WHERE id = p_tenant_id;
    UPDATE public.subscriptions
    SET
      status = 'trialing',
      plan_code = 'trial',
      trial_ends_at = v_end,
      current_period_end = v_end,
      ended_at = NULL,
      retention_started_at = NULL,
      retention_ends_at = NULL,
      retention_status = 'none',
      updated_at = v_now
    WHERE tenant_id = p_tenant_id;

  ELSIF p_action = 'grant_exempt' THEN
    IF v_admin.role <> 'super_admin' THEN
      RAISE EXCEPTION 'Apenas super_admin pode conceder isencao administrativa.';
    END IF;
    UPDATE public.tenants SET billing_exempt = true, status = 'active', updated_at = v_now WHERE id = p_tenant_id;
    UPDATE public.subscriptions
    SET
      status = 'exempt',
      ended_at = NULL,
      retention_started_at = NULL,
      retention_ends_at = NULL,
      retention_status = 'none',
      updated_at = v_now
    WHERE tenant_id = p_tenant_id;

  ELSIF p_action = 'revoke_exempt' THEN
    IF v_admin.role <> 'super_admin' THEN
      RAISE EXCEPTION 'Apenas super_admin pode revogar isencao.';
    END IF;
    IF v_tenant.is_founder_account THEN
      RAISE EXCEPTION 'A isencao da conta fundadora nao pode ser removida.';
    END IF;
    UPDATE public.tenants SET billing_exempt = false, updated_at = v_now WHERE id = p_tenant_id;
    UPDATE public.subscriptions
    SET
      plan_code = 'mgw_mensal_49',
      plan_amount_cents = 4990,
      status = 'pending',
      ended_at = NULL,
      retention_started_at = NULL,
      retention_ends_at = NULL,
      retention_status = 'none',
      updated_at = v_now
    WHERE tenant_id = p_tenant_id;

  ELSIF p_action = 'activate_manual' THEN
    UPDATE public.tenants SET status = 'active', updated_at = v_now WHERE id = p_tenant_id;
    UPDATE public.subscriptions
    SET
      plan_code = 'mgw_mensal_49',
      plan_amount_cents = 4990,
      status = 'active',
      current_period_start = v_now,
      current_period_end = v_now + interval '30 days',
      grace_until = NULL,
      ended_at = NULL,
      retention_started_at = NULL,
      retention_ends_at = NULL,
      retention_status = 'none',
      updated_at = v_now
    WHERE tenant_id = p_tenant_id;

  ELSIF p_action = 'suspend_nonpayment' THEN
    IF v_tenant.is_founder_account THEN
      RAISE EXCEPTION 'Conta fundadora nao pode ser suspensa por cobranca.';
    END IF;
    v_end := greatest(v_now, coalesce(v_sub.current_period_end, v_now), coalesce(v_sub.trial_ends_at, v_now), coalesce(v_sub.grace_until, v_now));
    UPDATE public.tenants SET status = 'suspended', updated_at = v_now WHERE id = p_tenant_id;
    UPDATE public.subscriptions
    SET
      status = 'suspended',
      ended_at = v_end,
      retention_started_at = v_end,
      retention_ends_at = ((v_end AT TIME ZONE 'UTC' + interval '6 months') AT TIME ZONE 'UTC'),
      retention_status = 'active_retention',
      updated_at = v_now
    WHERE tenant_id = p_tenant_id;

  ELSIF p_action = 'reactivate_tenant' THEN
    UPDATE public.tenants SET status = 'active', updated_at = v_now WHERE id = p_tenant_id;
    UPDATE public.subscriptions
    SET
      status = CASE WHEN v_tenant.billing_exempt THEN 'exempt' ELSE 'active' END,
      ended_at = NULL,
      retention_started_at = NULL,
      retention_ends_at = NULL,
      retention_status = 'none',
      updated_at = v_now
    WHERE tenant_id = p_tenant_id;

  ELSE
    RAISE EXCEPTION 'Acao de assinatura desconhecida: %', p_action;
  END IF;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'subscription_' || p_action,
    'subscription',
    p_tenant_id::text,
    jsonb_build_object('status', v_sub.status, 'billingExempt', v_tenant.billing_exempt, 'trialEndsAt', v_sub.trial_ends_at),
    jsonb_build_object('action', p_action, 'days', p_days),
    v_clean_reason
  );

  RETURN jsonb_build_object('tenantId', p_tenant_id, 'action', p_action, 'ok', true);
END;
$$;

-- Modulo 5: Financeiro da Plataforma
CREATE OR REPLACE FUNCTION public.admin_get_finance_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_mrr_cents bigint;
  v_arr_cents bigint;
  v_approved_month_cents bigint;
  v_approved_total_cents bigint;
  v_pending_cents bigint;
  v_rejected_count integer;
  v_paying_tenants integer;
  v_trial_tenants integer;
  v_exempt_tenants integer;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'finance'], false);

  SELECT
    coalesce(sum(s.plan_amount_cents) FILTER (WHERE s.status IN ('authorized', 'active') AND t.billing_exempt = false), 0)::bigint,
    count(*) FILTER (WHERE s.status IN ('authorized', 'active') AND t.billing_exempt = false)::integer,
    count(*) FILTER (WHERE s.status = 'trialing')::integer,
    count(*) FILTER (WHERE t.billing_exempt = true OR s.status = 'exempt')::integer
  INTO v_mrr_cents, v_paying_tenants, v_trial_tenants, v_exempt_tenants
  FROM public.subscriptions s
  JOIN public.tenants t ON t.id = s.tenant_id;

  v_arr_cents := v_mrr_cents * 12;

  SELECT
    coalesce(sum(amount_cents) FILTER (WHERE status = 'approved' AND date_trunc('month', coalesce(paid_at, created_at)) = date_trunc('month', now())), 0)::bigint,
    coalesce(sum(amount_cents) FILTER (WHERE status = 'approved'), 0)::bigint,
    coalesce(sum(amount_cents) FILTER (WHERE status IN ('pending', 'in_process')), 0)::bigint,
    count(*) FILTER (WHERE status = 'rejected')::integer
  INTO v_approved_month_cents, v_approved_total_cents, v_pending_cents, v_rejected_count
  FROM public.platform_payments;

  RETURN jsonb_build_object(
    'mrrCents', v_mrr_cents,
    'arrCents', v_arr_cents,
    'approvedMonthCents', v_approved_month_cents,
    'approvedTotalCents', v_approved_total_cents,
    'pendingCents', v_pending_cents,
    'rejectedCount', v_rejected_count,
    'payingTenants', v_paying_tenants,
    'trialTenants', v_trial_tenants,
    'exemptTenants', v_exempt_tenants
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_payments(
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
  v_limit integer := greatest(1, least(300, coalesce(p_limit, 100)));
  v_items jsonb;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'finance'], false);

  SELECT coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      pay.id,
      pay.tenant_id,
      t.name AS tenant_name,
      t.slug AS tenant_slug,
      pay.provider,
      pay.mp_payment_id,
      pay.mp_preapproval_id,
      pay.amount_cents,
      pay.currency,
      pay.status,
      pay.payment_method,
      pay.payer_email,
      pay.failure_reason,
      pay.paid_at,
      pay.due_at,
      pay.created_at
    FROM public.platform_payments pay
    JOIN public.tenants t ON t.id = pay.tenant_id
    WHERE (v_status = 'all' OR pay.status = v_status)
    ORDER BY pay.created_at DESC
    LIMIT v_limit
  ) p;

  RETURN v_items;
END;
$$;

-- Modulo 6: Monitoramento de Webhooks (projecao higienizada sem payload sensivel)
CREATE OR REPLACE FUNCTION public.admin_list_webhook_events(
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
  v_limit integer := greatest(1, least(300, coalesce(p_limit, 100)));
  v_items jsonb;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'support', 'finance'], false);

  SELECT coalesce(jsonb_agg(row_to_json(w)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      ev.id,
      ev.event_type,
      ev.action,
      ev.resource_id,
      ev.tenant_id,
      t.name AS tenant_name,
      ev.signature_verified,
      ev.processing_status,
      ev.error_message,
      ev.received_at,
      ev.processed_at
    FROM public.mp_webhook_events ev
    LEFT JOIN public.tenants t ON t.id = ev.tenant_id
    WHERE (v_status = 'all' OR ev.processing_status = v_status)
    ORDER BY ev.received_at DESC
    LIMIT v_limit
  ) w;

  RETURN v_items;
END;
$$;

-- Modulo 7: Suporte e Chamados
CREATE OR REPLACE FUNCTION public.admin_list_tickets(
  p_status text DEFAULT 'all',
  p_priority text DEFAULT 'all',
  p_search text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
  v_priority text := coalesce(nullif(btrim(p_priority), ''), 'all');
  v_search text := '%' || lower(btrim(coalesce(p_search, ''))) || '%';
  v_items jsonb;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'support', 'finance'], false);

  SELECT coalesce(jsonb_agg(row_to_json(tk)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      st.id,
      st.ticket_number,
      st.tenant_id,
      t.name AS tenant_name,
      st.requester_email,
      st.subject,
      st.category,
      st.priority,
      st.status,
      st.assigned_admin_id,
      pa.email AS assigned_admin_email,
      st.resolution_note,
      st.resolved_at,
      st.created_at,
      st.updated_at,
      (SELECT count(*)::integer FROM public.support_ticket_messages m WHERE m.ticket_id = st.id) AS messages_count
    FROM public.support_tickets st
    LEFT JOIN public.tenants t ON t.id = st.tenant_id
    LEFT JOIN public.platform_admins pa ON pa.id = st.assigned_admin_id
    WHERE (v_status = 'all' OR st.status = v_status)
      AND (v_priority = 'all' OR st.priority = v_priority)
      AND (
        v_search = '%%'
        OR lower(st.subject) LIKE v_search
        OR lower(st.requester_email) LIKE v_search
        OR lower(coalesce(t.name, '')) LIKE v_search
      )
    ORDER BY st.updated_at DESC
    LIMIT 200
  ) tk;

  RETURN v_items;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_ticket(
  p_tenant_id uuid,
  p_requester_email text,
  p_subject text,
  p_category text,
  p_priority text,
  p_initial_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_ticket_id uuid;
  v_number bigint;
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin', 'support'], false);

  INSERT INTO public.support_tickets (
    tenant_id,
    requester_email,
    subject,
    category,
    priority,
    status,
    assigned_admin_id
  )
  VALUES (
    p_tenant_id,
    lower(btrim(coalesce(p_requester_email, ''))),
    left(btrim(p_subject), 160),
    p_category,
    p_priority,
    'open',
    v_admin.id
  )
  RETURNING id, ticket_number INTO v_ticket_id, v_number;

  INSERT INTO public.support_ticket_messages (
    ticket_id, sender_type, sender_user_id, sender_email, message, is_internal_note
  )
  VALUES (
    v_ticket_id, 'platform_admin', v_admin.user_id, v_admin.email, btrim(p_initial_message), false
  );

  PERFORM public.write_platform_audit_log(
    v_admin,
    'ticket_created',
    'support_ticket',
    v_ticket_id::text,
    NULL,
    jsonb_build_object('ticketNumber', v_number, 'subject', p_subject, 'priority', p_priority),
    'Abertura de chamado administrativo'
  );

  RETURN jsonb_build_object('id', v_ticket_id, 'ticketNumber', v_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_ticket_messages(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_items jsonb;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'support', 'finance'], false);

  SELECT coalesce(jsonb_agg(row_to_json(m) ORDER BY m.created_at ASC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT id, ticket_id, sender_type, sender_email, message, is_internal_note, created_at
    FROM public.support_ticket_messages
    WHERE ticket_id = p_ticket_id
  ) m;

  RETURN v_items;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reply_or_update_ticket(
  p_ticket_id uuid,
  p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_is_internal_note boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_ticket public.support_tickets%ROWTYPE;
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin', 'support'], false);

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado nao encontrado.';
  END IF;

  IF p_status IS NOT NULL OR p_priority IS NOT NULL THEN
    UPDATE public.support_tickets
    SET
      status = coalesce(p_status, status),
      priority = coalesce(p_priority, priority),
      resolved_at = CASE
        WHEN coalesce(p_status, status) IN ('resolved', 'closed') THEN coalesce(resolved_at, now())
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = p_ticket_id;
  END IF;

  IF p_message IS NOT NULL AND char_length(btrim(p_message)) > 0 THEN
    INSERT INTO public.support_ticket_messages (
      ticket_id, sender_type, sender_user_id, sender_email, message, is_internal_note
    )
    VALUES (
      p_ticket_id, 'platform_admin', v_admin.user_id, v_admin.email, btrim(p_message), coalesce(p_is_internal_note, false)
    );
    UPDATE public.support_tickets SET updated_at = now() WHERE id = p_ticket_id;
  END IF;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'ticket_updated',
    'support_ticket',
    p_ticket_id::text,
    jsonb_build_object('status', v_ticket.status, 'priority', v_ticket.priority),
    jsonb_build_object('status', coalesce(p_status, v_ticket.status), 'priority', coalesce(p_priority, v_ticket.priority)),
    CASE WHEN p_message IS NOT NULL THEN 'Interacao no chamado' ELSE 'Atualizacao de status/prioridade' END
  );

  RETURN jsonb_build_object('ticketId', p_ticket_id, 'ok', true);
END;
$$;

-- Modulo 8: Configuracoes Globais da Plataforma
CREATE OR REPLACE FUNCTION public.admin_get_platform_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_row public.platform_settings%ROWTYPE;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'support', 'finance'], false);
  SELECT * INTO v_row FROM public.platform_settings WHERE id = 1;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_platform_settings(
  p_platform_name text,
  p_trial_days integer,
  p_grace_days integer,
  p_retention_months integer,
  p_support_email text,
  p_support_whatsapp text,
  p_allow_public_signup boolean,
  p_maintenance_mode boolean,
  p_maintenance_message text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_before public.platform_settings%ROWTYPE;
  v_after public.platform_settings%ROWTYPE;
  v_clean_reason text := left(btrim(coalesce(p_reason, '')), 500);
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin'], true);

  IF char_length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da alteracao das configuracoes (minimo 3 caracteres).';
  END IF;

  SELECT * INTO v_before FROM public.platform_settings WHERE id = 1 FOR UPDATE;

  UPDATE public.platform_settings
  SET
    platform_name = left(btrim(p_platform_name), 80),
    trial_days = p_trial_days,
    grace_days = p_grace_days,
    retention_months = p_retention_months,
    support_email = lower(btrim(coalesce(p_support_email, ''))),
    support_whatsapp = left(btrim(coalesce(p_support_whatsapp, '')), 32),
    allow_public_signup = p_allow_public_signup,
    maintenance_mode = p_maintenance_mode,
    maintenance_message = left(btrim(coalesce(p_maintenance_message, '')), 400),
    updated_by = v_admin.user_id,
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO v_after;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'platform_settings_updated',
    'platform_settings',
    '1',
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_clean_reason
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- Modulo 9: Usuarios Administrativos da Plataforma
CREATE OR REPLACE FUNCTION public.admin_list_platform_admins()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_items jsonb;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin'], false);

  SELECT coalesce(jsonb_agg(row_to_json(a) ORDER BY a.created_at ASC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT id, user_id, email, full_name, role, active, notes, created_by, created_at, updated_at
    FROM public.platform_admins
  ) a;

  RETURN v_items;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_platform_admin(
  p_email text,
  p_role text,
  p_full_name text,
  p_active boolean,
  p_notes text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_clean_email text := lower(btrim(coalesce(p_email, '')));
  v_clean_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_target_user_id uuid;
  v_confirmed_at timestamptz;
  v_existing public.platform_admins%ROWTYPE;
  v_result public.platform_admins%ROWTYPE;
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin'], true);

  IF p_role NOT IN ('super_admin', 'support', 'finance') THEN
    RAISE EXCEPTION 'Papel administrativo invalido: %', p_role;
  END IF;

  IF char_length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da operacao (minimo 3 caracteres).';
  END IF;

  SELECT u.id, u.email_confirmed_at
  INTO v_target_user_id, v_confirmed_at
  FROM auth.users u
  WHERE lower(btrim(u.email)) = v_clean_email
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF v_target_user_id IS NULL OR v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'O e-mail % deve possuir uma conta real e confirmada no Supabase Auth antes de receber acesso administrativo.', v_clean_email;
  END IF;

  SELECT * INTO v_existing FROM public.platform_admins WHERE user_id = v_target_user_id;

  IF v_target_user_id = v_admin.user_id AND (p_active = false OR p_role <> v_admin.role) THEN
    RAISE EXCEPTION 'Por seguranca, nao e permitido alterar seu proprio papel ou desativar seu proprio acesso.';
  END IF;

  PERFORM set_config('mgw.admin_rpc_active', 'platform_admins', true);

  INSERT INTO public.platform_admins (
    user_id, email, full_name, role, active, notes, created_by
  )
  VALUES (
    v_target_user_id,
    v_clean_email,
    left(btrim(coalesce(p_full_name, '')), 120),
    p_role,
    p_active,
    left(btrim(coalesce(p_notes, '')), 500),
    v_admin.user_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    active = EXCLUDED.active,
    notes = EXCLUDED.notes,
    updated_at = now()
  RETURNING * INTO v_result;

  PERFORM public.write_platform_audit_log(
    v_admin,
    CASE WHEN v_existing.id IS NULL THEN 'platform_admin_added' ELSE 'platform_admin_updated' END,
    'platform_admin',
    v_result.id::text,
    CASE WHEN v_existing.id IS NULL THEN NULL ELSE to_jsonb(v_existing) END,
    to_jsonb(v_result),
    v_clean_reason
  );

  RETURN to_jsonb(v_result);
END;
$$;

-- Modulo 10: Logs de Auditoria
CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(
  p_action text DEFAULT 'all',
  p_target_type text DEFAULT 'all',
  p_limit integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_action text := coalesce(nullif(btrim(p_action), ''), 'all');
  v_target_type text := coalesce(nullif(btrim(p_target_type), ''), 'all');
  v_limit integer := greatest(1, least(500, coalesce(p_limit, 120)));
  v_items jsonb;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'support', 'finance'], false);

  SELECT coalesce(jsonb_agg(row_to_json(l)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT id, admin_user_id, admin_email, admin_role, action, target_type, target_id, before_data, after_data, reason, metadata, created_at
    FROM public.platform_audit_logs
    WHERE (v_action = 'all' OR action = v_action)
      AND (v_target_type = 'all' OR target_type = v_target_type)
    ORDER BY created_at DESC
    LIMIT v_limit
  ) l;

  RETURN v_items;
END;
$$;

-- Permissoes estritas nos RPCs administrativos (nunca anon, nunca PUBLIC)
REVOKE ALL ON FUNCTION public.admin_get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_my_profile() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_platform_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_overview() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_clients(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_clients(text, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_member_active(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_member_active(uuid, boolean, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_establishments(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_establishments(text, text, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_establishment_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_establishment_status(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_plans_and_subscriptions(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_plans_and_subscriptions(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_update_plan(text, text, text, integer, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_plan(text, text, text, integer, integer, boolean, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_manage_subscription(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_subscription(uuid, text, integer, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_finance_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_finance_summary() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_payments(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payments(text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_webhook_events(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_webhook_events(text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_tickets(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_tickets(text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_create_ticket(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_ticket(uuid, text, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_ticket_messages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_ticket_messages(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_reply_or_update_ticket(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reply_or_update_ticket(uuid, text, text, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_platform_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_settings() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_update_platform_settings(text, integer, integer, integer, text, text, boolean, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_platform_settings(text, integer, integer, integer, text, text, boolean, boolean, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_platform_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_admins() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_upsert_platform_admin(text, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_platform_admin(text, text, text, boolean, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_audit_logs(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(text, text, integer) TO authenticated, service_role;

COMMIT;
