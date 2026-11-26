-- ============================================================================
-- MGW ADMIN — FASE 1: ESTABILIDADE DE RPCS (VALIDADE DE ASSINATURA E MEMBROS)
-- Migration: 20261126120000_mgw_admin_phase1_stability_and_rpcs.sql
--
-- Regras obrigatorias:
--   * 100% ADITIVA sobre o schema existente.
--   * Toda mutacao administrativa exige assert_platform_admin + MFA AAL2
--     e registra trilha imutavel em public.platform_audit_logs.
--   * Nunca altera dados existentes automaticamente nem cria usuarios ficticios.
-- ============================================================================

BEGIN;

-- 1. Listagem direta de membros de um estabelecimento especifico (sem limite global de 200 usuarios)
CREATE OR REPLACE FUNCTION public.admin_list_establishment_members(
  p_tenant_id uuid
)
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

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Informe o identificador do estabelecimento.';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      tm.id AS "memberId",
      tm.user_id AS "userId",
      lower(btrim(coalesce(u.email, ''))) AS email,
      coalesce(
        nullif(up.full_name, ''),
        coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')
      ) AS "fullName",
      u.email_confirmed_at AS "emailConfirmedAt",
      u.last_sign_in_at AS "lastSignInAt",
      tm.role,
      tm.active AS "memberActive",
      tm.is_founder AS "isFounder"
    FROM public.tenant_members tm
    JOIN auth.users u ON u.id = tm.user_id
    LEFT JOIN public.user_profiles up ON up.user_id = u.id
    WHERE tm.tenant_id = p_tenant_id
      AND u.deleted_at IS NULL
    ORDER BY
      CASE tm.role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'staff' THEN 3
        ELSE 9
      END ASC,
      tm.created_at ASC
  ) m;

  RETURN v_items;
END;
$$;

-- 2. Ajuste auditado de validade / vencimento / expiracao imediata de assinatura
CREATE OR REPLACE FUNCTION public.admin_set_subscription_expiry(
  p_tenant_id uuid,
  p_mode text,
  p_duration integer DEFAULT NULL,
  p_unit text DEFAULT 'days',
  p_expires_at timestamptz DEFAULT NULL,
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
  v_mode text := lower(btrim(coalesce(p_mode, '')));
  v_unit text := lower(btrim(coalesce(p_unit, 'days')));
  v_duration integer := greatest(1, least(3650, coalesce(p_duration, 1)));
  v_now timestamptz := now();
  v_base_end timestamptz;
  v_target_end timestamptz;
  v_next_sub_status text;
  v_interval interval;
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin', 'finance'], true);

  IF v_mode NOT IN ('extend', 'set', 'expire') THEN
    RAISE EXCEPTION 'Modo de alteracao de validade invalido: %', p_mode;
  END IF;

  IF v_unit NOT IN ('days', 'months', 'years') THEN
    RAISE EXCEPTION 'Unidade de prazo invalida: %', p_unit;
  END IF;

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

  IF v_mode = 'expire' THEN
    IF v_tenant.is_founder_account THEN
      RAISE EXCEPTION 'Conta fundadora nao pode ser expirada administrativamente.';
    END IF;

    v_target_end := v_now;
    v_next_sub_status := 'expired';

    UPDATE public.subscriptions
    SET
      status = 'expired',
      trial_ends_at = CASE WHEN status = 'trialing' THEN v_now ELSE trial_ends_at END,
      current_period_end = v_now,
      grace_until = NULL,
      ended_at = v_now,
      retention_started_at = v_now,
      retention_ends_at = ((v_now AT TIME ZONE 'UTC' + interval '6 months') AT TIME ZONE 'UTC'),
      retention_status = 'active_retention',
      updated_at = v_now
    WHERE tenant_id = p_tenant_id;

    IF v_tenant.billing_exempt = false THEN
      UPDATE public.tenants
      SET
        status = 'suspended',
        billing_suspended = true,
        updated_at = v_now
      WHERE id = p_tenant_id;
    END IF;

  ELSE
    IF v_mode = 'extend' THEN
      IF p_duration IS NULL OR p_duration < 1 OR p_duration > 3650 THEN
        RAISE EXCEPTION 'Informe um prazo adicional valido entre 1 e 3650.';
      END IF;

      v_interval := CASE
        WHEN v_unit = 'days' THEN make_interval(days => v_duration)
        WHEN v_unit = 'months' THEN make_interval(months => v_duration)
        ELSE make_interval(years => v_duration)
      END;

      IF v_sub.status = 'trialing' THEN
        v_base_end := greatest(coalesce(v_sub.trial_ends_at, v_sub.current_period_end, v_now), v_now);
      ELSE
        v_base_end := greatest(coalesce(v_sub.current_period_end, v_sub.trial_ends_at, v_now), v_now);
      END IF;

      v_target_end := v_base_end + v_interval;
    ELSE
      IF p_expires_at IS NULL THEN
        RAISE EXCEPTION 'Informe a nova data e horario de vencimento.';
      END IF;
      v_target_end := p_expires_at;
    END IF;

    IF v_target_end <= v_now THEN
      IF v_tenant.is_founder_account THEN
        RAISE EXCEPTION 'Conta fundadora nao pode receber vencimento retroativo.';
      END IF;

      v_next_sub_status := 'expired';

      UPDATE public.subscriptions
      SET
        status = 'expired',
        trial_ends_at = CASE WHEN status = 'trialing' THEN v_target_end ELSE trial_ends_at END,
        current_period_end = v_target_end,
        grace_until = NULL,
        ended_at = v_target_end,
        retention_started_at = v_target_end,
        retention_ends_at = ((v_target_end AT TIME ZONE 'UTC' + interval '6 months') AT TIME ZONE 'UTC'),
        retention_status = 'active_retention',
        updated_at = v_now
      WHERE tenant_id = p_tenant_id;

      IF v_tenant.billing_exempt = false THEN
        UPDATE public.tenants
        SET
          status = 'suspended',
          billing_suspended = true,
          updated_at = v_now
        WHERE id = p_tenant_id;
      END IF;
    ELSE
      v_next_sub_status := CASE
        WHEN v_tenant.billing_exempt OR v_sub.status = 'exempt' THEN 'exempt'
        WHEN v_sub.status = 'trialing' THEN 'trialing'
        ELSE 'authorized'
      END;

      UPDATE public.subscriptions
      SET
        status = v_next_sub_status,
        plan_code = CASE
          WHEN v_next_sub_status = 'authorized' AND plan_code = 'trial' THEN 'mgw_mensal_49'
          ELSE plan_code
        END,
        plan_amount_cents = CASE
          WHEN v_next_sub_status = 'authorized' AND plan_amount_cents = 0 THEN 4990
          ELSE plan_amount_cents
        END,
        trial_ends_at = CASE WHEN v_next_sub_status = 'trialing' THEN v_target_end ELSE trial_ends_at END,
        current_period_start = coalesce(current_period_start, v_now),
        current_period_end = v_target_end,
        grace_until = NULL,
        ended_at = NULL,
        retention_started_at = NULL,
        retention_ends_at = NULL,
        retention_status = 'none',
        updated_at = v_now
      WHERE tenant_id = p_tenant_id;

      UPDATE public.tenants
      SET
        status = CASE WHEN status = 'archived' THEN status ELSE 'active' END,
        billing_suspended = false,
        updated_at = v_now
      WHERE id = p_tenant_id;
    END IF;
  END IF;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'subscription_expiry_' || v_mode,
    'subscription',
    p_tenant_id::text,
    jsonb_build_object(
      'status', v_sub.status,
      'trialEndsAt', v_sub.trial_ends_at,
      'currentPeriodEnd', v_sub.current_period_end
    ),
    jsonb_build_object(
      'mode', v_mode,
      'duration', p_duration,
      'unit', v_unit,
      'nextStatus', v_next_sub_status,
      'expiresAt', v_target_end
    ),
    v_clean_reason
  );

  RETURN jsonb_build_object(
    'tenantId', p_tenant_id,
    'action', 'expiry_' || v_mode,
    'ok', true,
    'expiresAt', v_target_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_establishment_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_establishment_members(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_subscription_expiry(uuid, text, integer, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription_expiry(uuid, text, integer, text, timestamptz, text) TO authenticated, service_role;

COMMIT;
