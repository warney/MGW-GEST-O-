-- ============================================================================
-- MGW GESTAO — ETAPA 4 / FASE 4.1: MULTI-TENANCY COMERCIAL, RBAC E PLANOS
-- Migration: 20261116000001_etapa4_multi_tenant_rbac_and_plans.sql
--
-- ATENCAO:
--   * Migration ADITIVA sobre 20261114000001_initial_saas_schema.sql.
--   * NAO apaga dados, NAO altera contas fundadoras e NAO altera snapshots.
--   * NAO executar automaticamente em producao sem aprovacao especifica.
--
-- Objetivos:
--   1. Catalogo de planos (plans) suportando contas fundadoras isentas,
--      plano gratuito/trial e plano comercial R$ 49,00/mes (mgw_mensal_49).
--   2. Perfis minimos de usuario (user_profiles) separados de dados de tenant.
--   3. Sistema seguro de convites por token com hash SHA-256 (tenant_invitations).
--   4. Expansao de papeis RBAC em tenant_members: owner, admin, manager, staff.
--   5. Funcoes SECURITY DEFINER auditadas para onboarding atomico de empresa
--      (create_tenant_with_owner) e aceite de convite (accept_tenant_invitation).
--   6. Politicas RLS granulares por empresa (tenant_id) e papel (role),
--      nunca confiando em company_id/tenant_id enviado sem verificacao no banco.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. CATALOGO DE PLANOS E EXPANSAO CONTROLADA DE ASSINATURAS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plans (
  code text PRIMARY KEY
    CONSTRAINT chk_plans_code_format CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,48}$'),
  name text NOT NULL
    CONSTRAINT chk_plans_name_nonempty CHECK (char_length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  amount_cents integer NOT NULL DEFAULT 0
    CONSTRAINT chk_plans_amount_nonnegative CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'BRL'
    CONSTRAINT chk_plans_currency_brl CHECK (currency = 'BRL'),
  billing_interval text NOT NULL DEFAULT 'monthly'
    CONSTRAINT chk_plans_interval CHECK (billing_interval IN ('none', 'trial', 'monthly')),
  max_members integer NOT NULL DEFAULT 5
    CONSTRAINT chk_plans_max_members CHECK (max_members >= 1 AND max_members <= 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plans IS
  'Catalogo oficial de planos do MGW Gestao (isento fundador, gratuito, trial e mensal R$ 49,00).';

INSERT INTO public.plans (code, name, description, amount_cents, currency, billing_interval, max_members, active)
VALUES
  (
    'founder_exempt',
    'Conta Fundadora Isenta',
    'Isencao vitalicia reservada exclusivamente as contas fundadoras do sistema.',
    0,
    'BRL',
    'none',
    20,
    true
  ),
  (
    'free',
    'Plano Gratuito',
    'Acesso gratuito para operacao inicial com isolamento multi-tenant.',
    0,
    'BRL',
    'none',
    3,
    true
  ),
  (
    'trial',
    'Periodo de Teste',
    'Avaliacao completa por tempo determinado antes da assinatura mensal.',
    0,
    'BRL',
    'trial',
    5,
    true
  ),
  (
    'mgw_mensal_49',
    'MGW Gestao Mensal',
    'Plano comercial unico com faturamento mensal recorrente de R$ 49,00.',
    4900,
    'BRL',
    'monthly',
    15,
    true
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  amount_cents = EXCLUDED.amount_cents,
  billing_interval = EXCLUDED.billing_interval,
  max_members = EXCLUDED.max_members,
  active = EXCLUDED.active;

-- Remove constraints fixas da Etapa 1 para suportar planos free/trial/founder_exempt/mgw_mensal_49
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS chk_subscriptions_plan_code,
  DROP CONSTRAINT IF EXISTS chk_subscriptions_amount,
  DROP CONSTRAINT IF EXISTS chk_subscriptions_status;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT chk_subscriptions_amount CHECK (plan_amount_cents >= 0),
  ADD CONSTRAINT chk_subscriptions_status CHECK (
    status IN ('pending', 'trialing', 'free', 'authorized', 'paused', 'cancelled', 'exempt')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_subscriptions_plan_code'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT fk_subscriptions_plan_code
      FOREIGN KEY (plan_code) REFERENCES public.plans(code);
  END IF;
END;
$$;

-- Atualiza apenas assinaturas ja isentas de contas fundadoras para referenciar founder_exempt
UPDATE public.subscriptions s
SET
  plan_code = 'founder_exempt',
  plan_amount_cents = 0,
  updated_at = now()
FROM public.tenants t
WHERE t.id = s.tenant_id
  AND t.is_founder_account = true
  AND t.billing_exempt = true
  AND s.status = 'exempt';

-- ----------------------------------------------------------------------------
-- 2. PERFIS DE USUARIO E EXPANSAO DE PAPEIS (RBAC)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL
    CONSTRAINT chk_user_profiles_email_normalized CHECK (
      email = lower(btrim(email))
      AND position('@' IN email) > 1
    ),
  full_name text NOT NULL DEFAULT ''
    CONSTRAINT chk_user_profiles_name_length CHECK (char_length(full_name) <= 120),
  default_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_profiles IS
  'Perfil basico do usuario autenticado. Nunca armazena papel (role) ou autorizacao de tenant.';

-- Expande tenant_members.role para suportar owner, admin, manager e staff
ALTER TABLE public.tenant_members
  DROP CONSTRAINT IF EXISTS chk_tenant_members_role;

ALTER TABLE public.tenant_members
  ADD CONSTRAINT chk_tenant_members_role CHECK (
    role IN ('owner', 'admin', 'manager', 'staff')
  );

-- ----------------------------------------------------------------------------
-- 3. CONVITES SEGUROS POR ESTABELECIMENTO (TOKEN COM HASH SHA-256)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL
    CONSTRAINT chk_tenant_invitations_email_normalized CHECK (
      email = lower(btrim(email))
      AND position('@' IN email) > 1
    ),
  role text NOT NULL DEFAULT 'staff'
    CONSTRAINT chk_tenant_invitations_role CHECK (
      role IN ('admin', 'manager', 'staff')
    ),
  token_hash text NOT NULL UNIQUE
    CONSTRAINT chk_tenant_invitations_token_hash CHECK (char_length(token_hash) = 64),
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_tenant_invitations_status CHECK (
      status IN ('pending', 'accepted', 'revoked', 'expired')
    ),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_invitations IS
  'Convites por empresa. Apenas o hash SHA-256 do token e armazenado; o segredo bruto nunca e persistido.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_invitations_pending_email
  ON public.tenant_invitations (tenant_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant_status
  ON public.tenant_invitations (tenant_id, status, expires_at DESC);

-- ----------------------------------------------------------------------------
-- 4. TRIGGERS DE INTEGRIDADE E PROTECAO CONTRA ESCALACAO DE PRIVILEGIO
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_user_profile_default_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.default_tenant_id IS NOT NULL AND NOT public.is_privileged_db_role() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      JOIN public.tenants t ON t.id = tm.tenant_id
      WHERE tm.tenant_id = NEW.default_tenant_id
        AND tm.user_id = NEW.user_id
        AND tm.active = true
        AND t.status = 'active'
    ) THEN
      RAISE EXCEPTION 'default_tenant_id deve pertencer a uma empresa ativa vinculada ao usuario.';
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
    IF NEW.is_founder IS DISTINCT FROM OLD.is_founder THEN
      RAISE EXCEPTION 'Alteracao de is_founder nao e permitida.';
    END IF;
    IF OLD.role = 'owner' OR OLD.is_founder = true THEN
      RAISE EXCEPTION 'Nao e permitido alterar papel ou status de proprietario ou membro fundador via cliente.';
    END IF;
    IF OLD.user_id IS NOT NULL AND OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'Nao e permitido auto-elevar ou alterar o proprio vinculo.';
    END IF;
    IF NEW.role NOT IN ('admin', 'manager', 'staff') THEN
      RAISE EXCEPTION 'Papel invalido. Apenas service_role pode atribuir owner.';
    END IF;
    IF NOT public.is_tenant_owner(OLD.tenant_id) THEN
      RAISE EXCEPTION 'Apenas o proprietario da empresa pode alterar membros.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plans_updated_at ON public.plans;
CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_profiles_validate_tenant ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_validate_tenant
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_profile_default_tenant();

DROP TRIGGER IF EXISTS trg_tenant_invitations_updated_at ON public.tenant_invitations;
CREATE TRIGGER trg_tenant_invitations_updated_at
  BEFORE UPDATE ON public.tenant_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_invitations_lock_tenant ON public.tenant_invitations;
CREATE TRIGGER trg_tenant_invitations_lock_tenant
  BEFORE UPDATE ON public.tenant_invitations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

-- ----------------------------------------------------------------------------
-- 5. FUNCOES AUXILIARES DE AUTORIZACAO, ONBOARDING E ACEITE DE CONVITE
-- ----------------------------------------------------------------------------

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
        OR s.status IN ('authorized', 'exempt', 'free')
        OR (
          s.status = 'trialing'
          AND (s.trial_ends_at IS NULL OR s.trial_ends_at > now())
        )
        OR (
          s.status = 'paused'
          AND s.grace_until IS NOT NULL
          AND s.grace_until > now()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_role(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT tm.role
  FROM public.tenant_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.tenant_id = p_tenant_id
    AND tm.user_id = auth.uid()
    AND tm.active = true
    AND t.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(
  p_tenant_id uuid,
  p_allowed_roles text[]
)
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
      AND tm.role = ANY(p_allowed_roles)
      AND public.has_active_tenant_access(p_tenant_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(
  p_name text,
  p_slug text DEFAULT NULL,
  p_plan_code text DEFAULT 'trial'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_confirmed_at timestamptz;
  v_clean_name text;
  v_base_slug text;
  v_final_slug text;
  v_plan_code text;
  v_sub_status text;
  v_trial_end timestamptz;
  v_tenant_id uuid;
  v_suffix integer := 0;
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
    RAISE EXCEPTION 'E-mail precisa estar verificado para criar estabelecimento.';
  END IF;

  v_clean_name := left(btrim(coalesce(p_name, '')), 80);
  IF char_length(v_clean_name) = 0 THEN
    RAISE EXCEPTION 'Informe o nome do estabelecimento.';
  END IF;

  v_plan_code := coalesce(nullif(btrim(p_plan_code), ''), 'trial');
  IF v_plan_code NOT IN ('free', 'trial', 'mgw_mensal_49') THEN
    RAISE EXCEPTION 'Plano inicial nao permitido no cadastro comercial.';
  END IF;

  IF v_plan_code = 'free' THEN
    v_sub_status := 'free';
    v_trial_end := NULL;
  ELSIF v_plan_code = 'trial' THEN
    v_sub_status := 'trialing';
    v_trial_end := now() + interval '14 days';
  ELSE
    -- Plano pago inicia pendente ate confirmacao oficial de pagamento via webhook Mercado Pago
    v_sub_status := 'pending';
    v_trial_end := NULL;
  END IF;

  v_base_slug := lower(regexp_replace(coalesce(nullif(btrim(p_slug), ''), v_clean_name), '[^a-zA-Z0-9_-]+', '-', 'g'));
  v_base_slug := trim(both '-_' FROM v_base_slug);
  IF char_length(v_base_slug) < 2 THEN
    v_base_slug := 'lanche';
  END IF;
  v_base_slug := left(v_base_slug, 54);
  v_final_slug := v_base_slug;

  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_final_slug) LOOP
    v_suffix := v_suffix + 1;
    v_final_slug := left(v_base_slug, 48) || '-' || v_suffix::text;
    IF v_suffix > 50 THEN
      v_final_slug := left(v_base_slug, 42) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.tenants (slug, name, is_founder_account, billing_exempt, status)
  VALUES (v_final_slug, v_clean_name, false, false, 'active')
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.subscriptions (
    tenant_id,
    plan_code,
    plan_amount_cents,
    currency,
    status,
    trial_ends_at
  )
  SELECT
    v_tenant_id,
    p.code,
    p.amount_cents,
    p.currency,
    v_sub_status,
    v_trial_end
  FROM public.plans p
  WHERE p.code = v_plan_code;

  INSERT INTO public.tenant_members (
    tenant_id,
    user_id,
    email,
    role,
    is_founder,
    active,
    invited_by,
    claimed_at
  )
  VALUES (
    v_tenant_id,
    v_uid,
    v_email,
    'owner',
    false,
    true,
    v_uid,
    now()
  );

  INSERT INTO public.shop_settings (
    tenant_id,
    owner_email,
    establishment_name,
    x_salada_price,
    daily_goal,
    monthly_goal,
    start_date
  )
  VALUES (
    v_tenant_id,
    v_email,
    v_clean_name,
    22.00,
    800.00,
    18000.00,
    CURRENT_DATE
  );

  INSERT INTO public.user_profiles (user_id, email, default_tenant_id)
  VALUES (v_uid, v_email, v_tenant_id)
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    default_tenant_id = COALESCE(public.user_profiles.default_tenant_id, EXCLUDED.default_tenant_id),
    updated_at = now();

  RETURN v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(p_raw_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, auth
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_confirmed_at timestamptz;
  v_token_hash text;
  v_inv public.tenant_invitations%ROWTYPE;
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
    RAISE EXCEPTION 'Confirme seu e-mail antes de aceitar um convite.';
  END IF;

  IF coalesce(btrim(p_raw_token), '') = '' THEN
    RAISE EXCEPTION 'Token de convite invalido.';
  END IF;

  v_token_hash := encode(digest(btrim(p_raw_token), 'sha256'), 'hex');

  SELECT *
  INTO v_inv
  FROM public.tenant_invitations
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite nao encontrado.';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Este convite nao esta mais disponivel.';
  END IF;

  IF v_inv.expires_at <= now() THEN
    UPDATE public.tenant_invitations
    SET status = 'expired', updated_at = now()
    WHERE id = v_inv.id;
    RAISE EXCEPTION 'Este convite expirou.';
  END IF;

  IF v_inv.email <> v_email THEN
    RAISE EXCEPTION 'Este convite foi emitido para outro e-mail.';
  END IF;

  INSERT INTO public.tenant_members (
    tenant_id,
    user_id,
    email,
    role,
    is_founder,
    active,
    invited_by,
    claimed_at
  )
  VALUES (
    v_inv.tenant_id,
    v_uid,
    v_email,
    v_inv.role,
    false,
    true,
    v_inv.invited_by,
    now()
  )
  ON CONFLICT (tenant_id, email) DO UPDATE
  SET
    user_id = EXCLUDED.user_id,
    role = CASE
      WHEN public.tenant_members.role = 'owner' OR public.tenant_members.is_founder = true
        THEN public.tenant_members.role
      ELSE EXCLUDED.role
    END,
    active = true,
    claimed_at = COALESCE(public.tenant_members.claimed_at, now()),
    updated_at = now();

  UPDATE public.tenant_invitations
  SET
    status = 'accepted',
    accepted_by = v_uid,
    accepted_at = now(),
    updated_at = now()
  WHERE id = v_inv.id;

  RETURN v_inv.tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_tenant_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_role(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_tenant_role(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(uuid, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_tenant_with_owner(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accept_tenant_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) E PRIVILEGIOS POR EMPRESA E PAPEL
-- ----------------------------------------------------------------------------

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.plans,
  public.user_profiles,
  public.tenant_invitations
FROM anon, authenticated;

GRANT SELECT ON TABLE public.plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_profiles TO authenticated;

-- Protecao de coluna: authenticated nunca pode ler token_hash em tenant_invitations
GRANT SELECT (
  id,
  tenant_id,
  email,
  role,
  status,
  invited_by,
  accepted_by,
  expires_at,
  accepted_at,
  created_at,
  updated_at
) ON TABLE public.tenant_invitations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.tenant_invitations TO authenticated;

-- ---- plans ----
DROP POLICY IF EXISTS plans_select_active ON public.plans;
CREATE POLICY plans_select_active
  ON public.plans
  FOR SELECT
  TO authenticated
  USING (active = true);

-- ---- user_profiles ----
DROP POLICY IF EXISTS user_profiles_select_self ON public.user_profiles;
CREATE POLICY user_profiles_select_self
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_profiles_insert_self ON public.user_profiles;
CREATE POLICY user_profiles_insert_self
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_profiles_update_self ON public.user_profiles;
CREATE POLICY user_profiles_update_self
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---- tenant_invitations ----
DROP POLICY IF EXISTS tenant_invitations_select_managers ON public.tenant_invitations;
CREATE POLICY tenant_invitations_select_managers
  ON public.tenant_invitations
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS tenant_invitations_insert_managers ON public.tenant_invitations;
CREATE POLICY tenant_invitations_insert_managers
  ON public.tenant_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_tenant_role(tenant_id, ARRAY['owner', 'admin'])
    AND role IN ('admin', 'manager', 'staff')
    AND status = 'pending'
    AND invited_by = auth.uid()
  );

DROP POLICY IF EXISTS tenant_invitations_update_managers ON public.tenant_invitations;
CREATE POLICY tenant_invitations_update_managers
  ON public.tenant_invitations
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
  WITH CHECK (
    public.has_tenant_role(tenant_id, ARRAY['owner', 'admin'])
    AND status IN ('pending', 'revoked')
  );

DROP POLICY IF EXISTS tenant_invitations_delete_managers ON public.tenant_invitations;
CREATE POLICY tenant_invitations_delete_managers
  ON public.tenant_invitations
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- ---- tenant_members (refina policies da Etapa 1 para suportar admin/manager/staff sem auto-escalacao) ----
DROP POLICY IF EXISTS tenant_members_insert_owner_only ON public.tenant_members;
CREATE POLICY tenant_members_insert_owner_only
  ON public.tenant_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_tenant_owner(tenant_id)
    AND role IN ('admin', 'manager', 'staff')
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
    AND role <> 'owner'
    AND is_founder = false
  )
  WITH CHECK (
    public.is_tenant_owner(tenant_id)
    AND user_id IS DISTINCT FROM auth.uid()
    AND role IN ('admin', 'manager', 'staff')
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
    AND role <> 'owner'
    AND is_founder = false
  );

-- ---- shop_settings (somente owner/admin alteram configuracoes e metas) ----
DROP POLICY IF EXISTS shop_settings_insert_active_member ON public.shop_settings;
CREATE POLICY shop_settings_insert_active_member
  ON public.shop_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS shop_settings_update_active_member ON public.shop_settings;
CREATE POLICY shop_settings_update_active_member
  ON public.shop_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- ---- products (manager edita catalogo; delete restrito a owner/admin) ----
DROP POLICY IF EXISTS products_insert_active_member ON public.products;
CREATE POLICY products_insert_active_member
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS products_update_active_member ON public.products;
CREATE POLICY products_update_active_member
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS products_delete_active_member ON public.products;
CREATE POLICY products_delete_active_member
  ON public.products
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- ---- combos (manager edita catalogo; delete restrito a owner/admin) ----
DROP POLICY IF EXISTS combos_insert_active_member ON public.combos;
CREATE POLICY combos_insert_active_member
  ON public.combos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS combos_update_active_member ON public.combos;
CREATE POLICY combos_update_active_member
  ON public.combos
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS combos_delete_active_member ON public.combos;
CREATE POLICY combos_delete_active_member
  ON public.combos
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- ---- sales (staff pode registrar vendas; manager edita; delete restrito a owner/admin) ----
DROP POLICY IF EXISTS sales_insert_active_member ON public.sales;
CREATE POLICY sales_insert_active_member
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager', 'staff']));

DROP POLICY IF EXISTS sales_update_active_member ON public.sales;
CREATE POLICY sales_update_active_member
  ON public.sales
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS sales_delete_active_member ON public.sales;
CREATE POLICY sales_delete_active_member
  ON public.sales
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- ---- expenses (leitura/escrita para owner, admin e manager; delete para owner/admin) ----
DROP POLICY IF EXISTS expenses_select_member ON public.expenses;
CREATE POLICY expenses_select_member
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS expenses_insert_active_member ON public.expenses;
CREATE POLICY expenses_insert_active_member
  ON public.expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS expenses_update_active_member ON public.expenses;
CREATE POLICY expenses_update_active_member
  ON public.expenses
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS expenses_delete_active_member ON public.expenses;
CREATE POLICY expenses_delete_active_member
  ON public.expenses
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

COMMIT;
