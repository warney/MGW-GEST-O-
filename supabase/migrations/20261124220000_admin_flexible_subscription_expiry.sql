-- Controle administrativo de validade flexível por estabelecimento.
-- A alteração é protegida por MFA/AAL2 e registrada na auditoria da plataforma.

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
  v_now timestamptz := now();
  v_end timestamptz;
  v_base timestamptz;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin', 'finance'], true);

  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo administrativo (minimo 3 caracteres).';
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento nao encontrado.';
  END IF;
  IF v_tenant.is_founder_account THEN
    RAISE EXCEPTION 'A validade da conta fundadora nao pode ser alterada por esta acao.';
  END IF;

  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura nao encontrada para este estabelecimento.';
  END IF;

  IF p_mode = 'expire' THEN
    UPDATE public.tenants
    SET status = 'suspended', updated_at = v_now
    WHERE id = p_tenant_id;

    UPDATE public.subscriptions
    SET status = 'expired',
        trial_ends_at = v_now,
        current_period_end = v_now,
        ended_at = v_now,
        retention_started_at = v_now,
        retention_ends_at = ((v_now AT TIME ZONE 'UTC' + interval '6 months') AT TIME ZONE 'UTC'),
        retention_status = 'active_retention',
        updated_at = v_now
    WHERE tenant_id = p_tenant_id;

  ELSIF p_mode IN ('extend', 'set') THEN
    IF p_mode = 'extend' THEN
      IF coalesce(p_duration, 0) < 1 OR p_duration > 3650 THEN
        RAISE EXCEPTION 'Informe um prazo entre 1 e 3650 unidades.';
      END IF;
      IF p_unit NOT IN ('days', 'months', 'years') THEN
        RAISE EXCEPTION 'Unidade de prazo invalida.';
      END IF;
      v_base := greatest(v_now, coalesce(v_sub.trial_ends_at, v_sub.current_period_end, v_now));
      v_end := v_base + CASE p_unit
        WHEN 'days' THEN make_interval(days => p_duration)
        WHEN 'months' THEN make_interval(months => p_duration)
        WHEN 'years' THEN make_interval(years => p_duration)
      END;
    ELSE
      IF p_expires_at IS NULL OR p_expires_at <= v_now THEN
        RAISE EXCEPTION 'A nova data de vencimento deve estar no futuro.';
      END IF;
      v_end := p_expires_at;
    END IF;

    UPDATE public.tenants
    SET status = 'active', updated_at = v_now
    WHERE id = p_tenant_id;

    UPDATE public.subscriptions
    SET status = 'trialing',
        trial_ends_at = v_end,
        current_period_start = coalesce(current_period_start, v_now),
        current_period_end = v_end,
        ended_at = NULL,
        retention_started_at = NULL,
        retention_ends_at = NULL,
        retention_status = 'none',
        updated_at = v_now
    WHERE tenant_id = p_tenant_id;
  ELSE
    RAISE EXCEPTION 'Modo de validade desconhecido.';
  END IF;

  PERFORM public.write_platform_audit_log(
    v_admin,
    CASE WHEN p_mode = 'expire' THEN 'subscription_expire_manual' ELSE 'subscription_set_manual_expiry' END,
    'subscription',
    p_tenant_id::text,
    jsonb_build_object(
      'status', v_sub.status,
      'trialEndsAt', v_sub.trial_ends_at,
      'currentPeriodEnd', v_sub.current_period_end,
      'tenantStatus', v_tenant.status
    ),
    jsonb_build_object(
      'mode', p_mode,
      'duration', p_duration,
      'unit', p_unit,
      'expiresAt', v_end
    ),
    v_reason
  );

  RETURN jsonb_build_object(
    'tenantId', p_tenant_id,
    'action', p_mode,
    'ok', true,
    'expiresAt', v_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_subscription_expiry(uuid, text, integer, text, timestamptz, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription_expiry(uuid, text, integer, text, timestamptz, text)
TO authenticated, service_role;
