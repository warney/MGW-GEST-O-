-- ============================================================================
-- MGW ADMIN — FASE 3: OPERAÇÃO, FINANCEIRO, MONITORAMENTO E AUDITORIA EXPANDIDA
-- Migration: 20261126140000_mgw_admin_phase3_operations_finance_and_audit.sql
--
-- Regras obrigatorias:
--   * 100% ADITIVA e idempotente sobre o schema existente.
--   * Toda leitura exige assert_platform_admin ativo e verificado.
--   * Toda mutacao financeira/parceiros exige assert_platform_admin + MFA AAL2
--     e grava trilha imutavel em public.platform_audit_logs.
--   * Nunca altera policies operacionais de tenants/vendas/cardapio.
-- ============================================================================

BEGIN;

-- 1. Detalhe completo de um estabelecimento especifico (independente de paginacao)
CREATE OR REPLACE FUNCTION public.admin_get_establishment_detail(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_tenant jsonb;
  v_recent_payments jsonb;
  v_recent_audit jsonb;
  v_open_tickets integer;
BEGIN
  PERFORM public.assert_platform_admin(ARRAY['super_admin', 'support', 'finance'], false);

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Informe o identificador do estabelecimento.';
  END IF;

  SELECT row_to_json(e)::jsonb
  INTO v_tenant
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
    WHERE t.id = p_tenant_id
  ) e;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento nao encontrado.';
  END IF;

  SELECT count(*)::integer
  INTO v_open_tickets
  FROM public.support_tickets st
  WHERE st.tenant_id = p_tenant_id
    AND st.status IN ('open', 'in_progress', 'waiting_client');

  SELECT coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb)
  INTO v_recent_payments
  FROM (
    SELECT
      pay.id,
      pay.provider,
      pay.amount_cents,
      pay.status,
      pay.payment_method,
      pay.payer_email,
      pay.paid_at,
      pay.created_at
    FROM public.platform_payments pay
    WHERE pay.tenant_id = p_tenant_id
    ORDER BY pay.created_at DESC
    LIMIT 5
  ) p;

  SELECT coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb)
  INTO v_recent_audit
  FROM (
    SELECT
      l.id,
      l.admin_email,
      l.action,
      l.reason,
      l.created_at
    FROM public.platform_audit_logs l
    WHERE l.target_id = p_tenant_id::text
    ORDER BY l.created_at DESC
    LIMIT 6
  ) a;

  RETURN jsonb_build_object(
    'establishment', v_tenant,
    'openTicketsCount', coalesce(v_open_tickets, 0),
    'recentPayments', v_recent_payments,
    'recentAuditLogs', v_recent_audit
  );
END;
$$;

-- 2. Registro auditado de recebimento/ajuste manual na tabela platform_payments
CREATE OR REPLACE FUNCTION public.admin_record_manual_payment(
  p_tenant_id uuid,
  p_amount_cents integer,
  p_payment_method text DEFAULT 'pix',
  p_payer_email text DEFAULT '',
  p_status text DEFAULT 'approved',
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
  v_clean_method text := left(lower(btrim(coalesce(nullif(p_payment_method, ''), 'pix'))), 60);
  v_clean_email text := left(lower(btrim(coalesce(p_payer_email, ''))), 160);
  v_status text := lower(btrim(coalesce(p_status, 'approved')));
  v_now timestamptz := now();
  v_payment public.platform_payments%ROWTYPE;
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin', 'finance'], true);

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o estabelecimento do pagamento.';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents < 100 OR p_amount_cents > 10000000 THEN
    RAISE EXCEPTION 'Informe um valor valido entre R$ 1,00 e R$ 100.000,00.';
  END IF;

  IF v_status NOT IN ('approved', 'pending', 'refunded') THEN
    RAISE EXCEPTION 'Status de lancamento manual invalido: %', p_status;
  END IF;

  IF char_length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo ou comprovante administrativo (minimo 3 caracteres).';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento nao encontrado.';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE tenant_id = p_tenant_id;

  IF v_clean_email = '' THEN
    SELECT coalesce(ss.owner_email, '') INTO v_clean_email
    FROM public.shop_settings ss
    WHERE ss.tenant_id = p_tenant_id;
  END IF;

  INSERT INTO public.platform_payments (
    tenant_id,
    subscription_id,
    provider,
    mp_payment_id,
    amount_cents,
    currency,
    status,
    payment_method,
    payer_email,
    paid_at,
    created_at,
    updated_at
  )
  VALUES (
    p_tenant_id,
    v_sub.id,
    'manual_adjustment',
    'manual_' || replace(gen_random_uuid()::text, '-', ''),
    p_amount_cents,
    'BRL',
    v_status,
    v_clean_method,
    coalesce(v_clean_email, ''),
    CASE WHEN v_status = 'approved' THEN v_now ELSE NULL END,
    v_now,
    v_now
  )
  RETURNING * INTO v_payment;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'payment_manual_recorded',
    'payment',
    v_payment.id::text,
    NULL,
    jsonb_build_object(
      'tenantId', p_tenant_id,
      'tenantName', v_tenant.name,
      'amountCents', p_amount_cents,
      'status', v_status,
      'paymentMethod', v_clean_method,
      'payerEmail', v_clean_email
    ),
    v_clean_reason
  );

  RETURN jsonb_build_object(
    'id', v_payment.id,
    'tenantId', p_tenant_id,
    'amountCents', v_payment.amount_cents,
    'status', v_payment.status,
    'ok', true
  );
END;
$$;

-- 3. Auditoria completa nas mutacoes de campanhas e materiais do programa de parceiros
CREATE OR REPLACE FUNCTION public.admin_create_mgw_partner_campaign(
  p_slug text,
  p_name text,
  p_objective text DEFAULT '',
  p_target_segment text DEFAULT 'all',
  p_instructions text DEFAULT '',
  p_starts_at timestamptz DEFAULT now(),
  p_ends_at timestamptz DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_row public.mgw_partner_campaigns%ROWTYPE;
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin'], true);

  INSERT INTO public.mgw_partner_campaigns(
    slug, name, objective, target_segment, instructions, status, starts_at, ends_at, created_by
  )
  VALUES (
    lower(btrim(p_slug)),
    btrim(p_name),
    left(coalesce(p_objective, ''), 300),
    left(coalesce(p_target_segment, 'all'), 80),
    left(coalesce(p_instructions, ''), 3000),
    'active',
    p_starts_at,
    p_ends_at,
    auth.uid()
  )
  RETURNING * INTO v_row;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'partner_campaign_created',
    'partner',
    v_row.id::text,
    NULL,
    jsonb_build_object('slug', v_row.slug, 'name', v_row.name, 'targetSegment', v_row.target_segment),
    'Criacao de campanha no programa de parceiros'
  );

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_mgw_partner_campaign_status(
  p_campaign_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_prev public.mgw_partner_campaigns%ROWTYPE;
  v_row public.mgw_partner_campaigns%ROWTYPE;
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin'], true);

  IF p_status NOT IN ('active', 'ended', 'archived') THEN
    RAISE EXCEPTION 'Status de campanha invalido.';
  END IF;

  SELECT * INTO v_prev FROM public.mgw_partner_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha nao encontrada.';
  END IF;

  UPDATE public.mgw_partner_campaigns
  SET status = p_status, updated_at = now()
  WHERE id = p_campaign_id
  RETURNING * INTO v_row;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'partner_campaign_status_updated',
    'partner',
    v_row.id::text,
    jsonb_build_object('status', v_prev.status, 'name', v_prev.name),
    jsonb_build_object('status', v_row.status, 'name', v_row.name),
    'Alteracao de status de campanha de parceiros'
  );

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_mgw_partner_material(
  p_title text,
  p_description text,
  p_category text,
  p_resource_url text,
  p_resource_type text,
  p_campaign_id uuid DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_row public.mgw_partner_materials%ROWTYPE;
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin'], true);

  INSERT INTO public.mgw_partner_materials(
    title, description, category, resource_url, resource_type, created_by, active
  )
  VALUES (
    btrim(p_title),
    left(coalesce(p_description, ''), 1000),
    p_category,
    btrim(p_resource_url),
    p_resource_type,
    auth.uid(),
    true
  )
  RETURNING * INTO v_row;

  IF p_campaign_id IS NOT NULL THEN
    INSERT INTO public.mgw_partner_campaign_materials(campaign_id, material_id)
    VALUES (p_campaign_id, v_row.id);
  END IF;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'partner_material_created',
    'partner',
    v_row.id::text,
    NULL,
    jsonb_build_object('title', v_row.title, 'category', v_row.category, 'resourceType', v_row.resource_type),
    'Cadastro de material na biblioteca de parceiros'
  );

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_mgw_partner_material_active(
  p_material_id uuid,
  p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin public.platform_admins%ROWTYPE;
  v_prev public.mgw_partner_materials%ROWTYPE;
  v_row public.mgw_partner_materials%ROWTYPE;
BEGIN
  v_admin := public.assert_platform_admin(ARRAY['super_admin'], true);

  SELECT * INTO v_prev FROM public.mgw_partner_materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material nao encontrado.';
  END IF;

  UPDATE public.mgw_partner_materials
  SET active = p_active, updated_at = now()
  WHERE id = p_material_id
  RETURNING * INTO v_row;

  PERFORM public.write_platform_audit_log(
    v_admin,
    'partner_material_status_updated',
    'partner',
    v_row.id::text,
    jsonb_build_object('active', v_prev.active, 'title', v_prev.title),
    jsonb_build_object('active', v_row.active, 'title', v_row.title),
    'Alteracao de disponibilidade de material de parceiros'
  );

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_establishment_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_establishment_detail(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_record_manual_payment(uuid, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_manual_payment(uuid, integer, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_create_mgw_partner_campaign(text, text, text, text, text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_mgw_partner_campaign(text, text, text, text, text, timestamptz, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_mgw_partner_campaign_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_mgw_partner_campaign_status(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_create_mgw_partner_material(text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_mgw_partner_material(text, text, text, text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_mgw_partner_material_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_mgw_partner_material_active(uuid, boolean) TO authenticated, service_role;

COMMIT;
