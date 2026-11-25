-- Billing consistency hardening for Super Admin operations.
-- Administrative suspension is kept separate from financial suspension.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_tenant_billing_suspension()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_valid boolean:=false;
BEGIN
 IF NEW.status IN ('authorized','free','exempt') THEN v_valid:=true;
 ELSIF NEW.status='trialing' THEN v_valid:=NEW.trial_ends_at IS NOT NULL AND NEW.trial_ends_at>now();
 ELSIF NEW.status IN ('paused','past_due') THEN v_valid:=NEW.grace_until IS NOT NULL AND NEW.grace_until>now();
 ELSIF NEW.status='cancelled' THEN v_valid:=NEW.current_period_end IS NOT NULL AND NEW.current_period_end>now();
 END IF;
 IF v_valid THEN
  UPDATE public.tenants SET status=CASE WHEN billing_suspended THEN 'active' ELSE status END,billing_suspended=false,updated_at=now()
  WHERE id=NEW.tenant_id AND billing_suspended=true;
 ELSIF NEW.status IN ('expired','suspended','cancelled','paused','past_due') THEN
  UPDATE public.tenants SET status=CASE WHEN status='active' THEN 'suspended' ELSE status END,
   billing_suspended=CASE WHEN status IN ('active','suspended') THEN true ELSE billing_suspended END,updated_at=now()
  WHERE id=NEW.tenant_id AND billing_exempt=false;
 END IF;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_establishment_status(p_tenant_id uuid,p_status text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','auth' AS $$
DECLARE v_admin public.platform_admins%ROWTYPE; v_tenant public.tenants%ROWTYPE; v_sub public.subscriptions%ROWTYPE;
 v_clean_reason text:=left(btrim(coalesce(p_reason,'')),500); v_billing_valid boolean:=false;
BEGIN
 v_admin:=public.assert_platform_admin(ARRAY['super_admin'],true);
 IF p_status NOT IN ('active','suspended','archived') THEN RAISE EXCEPTION 'Status de estabelecimento invalido: %',p_status; END IF;
 IF char_length(v_clean_reason)<3 THEN RAISE EXCEPTION 'Informe o motivo da alteracao (minimo 3 caracteres).'; END IF;
 SELECT * INTO v_tenant FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Estabelecimento nao encontrado.'; END IF;
 SELECT * INTO v_sub FROM public.subscriptions WHERE tenant_id=p_tenant_id FOR UPDATE;
 IF v_tenant.is_founder_account AND p_status='archived' THEN RAISE EXCEPTION 'Estabelecimento fundador nao pode ser arquivado por seguranca.'; END IF;
 IF p_status='active' THEN
  v_billing_valid:=v_tenant.billing_exempt OR coalesce(v_sub.status='authorized',false)
   OR coalesce(v_sub.status IN ('free','exempt'),false)
   OR coalesce(v_sub.status='trialing' AND v_sub.trial_ends_at>now(),false)
   OR coalesce(v_sub.status IN ('paused','past_due') AND v_sub.grace_until>now(),false)
   OR coalesce(v_sub.status='cancelled' AND v_sub.current_period_end>now(),false);
  IF NOT v_billing_valid THEN RAISE EXCEPTION 'Nao e possivel reativar: assinatura sem cobertura vigente. Regularize a assinatura ou conceda isencao antes.'; END IF;
  UPDATE public.tenants SET status='active',billing_suspended=false,updated_at=now() WHERE id=p_tenant_id;
 ELSIF p_status='suspended' THEN
  UPDATE public.tenants SET status='suspended',billing_suspended=false,updated_at=now() WHERE id=p_tenant_id;
 ELSE
  UPDATE public.tenants SET status='archived',billing_suspended=false,updated_at=now() WHERE id=p_tenant_id;
 END IF;
 PERFORM public.write_platform_audit_log(v_admin,'tenant_status_'||p_status,'tenant',p_tenant_id::text,
  jsonb_build_object('status',v_tenant.status,'name',v_tenant.name,'billingSuspended',v_tenant.billing_suspended),
  jsonb_build_object('status',p_status,'billingSuspended',false,'name',v_tenant.name),v_clean_reason);
 RETURN jsonb_build_object('tenantId',p_tenant_id,'status',p_status,'ok',true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_manage_subscription(p_tenant_id uuid,p_action text,p_days integer DEFAULT NULL,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','auth' AS $$
DECLARE v_admin public.platform_admins%ROWTYPE; v_tenant public.tenants%ROWTYPE; v_sub public.subscriptions%ROWTYPE;
 v_clean_reason text:=left(btrim(coalesce(p_reason,'')),500); v_days integer:=greatest(1,least(90,coalesce(p_days,7)));
 v_now timestamptz:=now(); v_end timestamptz; v_valid boolean:=false;
BEGIN
 v_admin:=public.assert_platform_admin(ARRAY['super_admin','finance'],true);
 IF char_length(v_clean_reason)<3 THEN RAISE EXCEPTION 'Informe o motivo administrativo (minimo 3 caracteres).'; END IF;
 SELECT * INTO v_tenant FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Estabelecimento nao encontrado.'; END IF;
 SELECT * INTO v_sub FROM public.subscriptions WHERE tenant_id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura nao encontrada para este estabelecimento.'; END IF;
 IF p_action='extend_trial' THEN
  v_end:=greatest(coalesce(v_sub.trial_ends_at,v_now),v_now)+make_interval(days=>v_days);
  UPDATE public.subscriptions SET status='trialing',plan_code='trial',trial_ends_at=v_end,current_period_end=v_end,ended_at=NULL,
   retention_started_at=NULL,retention_ends_at=NULL,retention_status='none',updated_at=v_now WHERE tenant_id=p_tenant_id;
  UPDATE public.tenants SET status='active',billing_suspended=false,updated_at=v_now WHERE id=p_tenant_id;
 ELSIF p_action='grant_exempt' THEN
  IF v_admin.role<>'super_admin' THEN RAISE EXCEPTION 'Apenas super_admin pode conceder isencao administrativa.'; END IF;
  UPDATE public.tenants SET billing_exempt=true,status='active',billing_suspended=false,updated_at=v_now WHERE id=p_tenant_id;
  UPDATE public.subscriptions SET status='exempt',ended_at=NULL,retention_started_at=NULL,retention_ends_at=NULL,retention_status='none',updated_at=v_now WHERE tenant_id=p_tenant_id;
 ELSIF p_action='revoke_exempt' THEN
  IF v_admin.role<>'super_admin' THEN RAISE EXCEPTION 'Apenas super_admin pode revogar isencao.'; END IF;
  IF v_tenant.is_founder_account THEN RAISE EXCEPTION 'A isencao da conta fundadora nao pode ser removida.'; END IF;
  UPDATE public.tenants SET billing_exempt=false,status='suspended',billing_suspended=true,updated_at=v_now WHERE id=p_tenant_id;
  UPDATE public.subscriptions SET plan_code='mgw_mensal_49',plan_amount_cents=4990,status='pending',ended_at=NULL,
   retention_started_at=NULL,retention_ends_at=NULL,retention_status='none',updated_at=v_now WHERE tenant_id=p_tenant_id;
 ELSIF p_action='activate_manual' THEN
  UPDATE public.subscriptions SET plan_code='mgw_mensal_49',plan_amount_cents=4990,status='authorized',current_period_start=v_now,
   current_period_end=v_now+interval '30 days',grace_until=NULL,ended_at=NULL,retention_started_at=NULL,
   retention_ends_at=NULL,retention_status='none',updated_at=v_now WHERE tenant_id=p_tenant_id;
  UPDATE public.tenants SET status='active',billing_suspended=false,updated_at=v_now WHERE id=p_tenant_id;
 ELSIF p_action='suspend_nonpayment' THEN
  IF v_tenant.is_founder_account THEN RAISE EXCEPTION 'Conta fundadora nao pode ser suspensa por cobranca.'; END IF;
  v_end:=greatest(v_now,coalesce(v_sub.current_period_end,v_now),coalesce(v_sub.trial_ends_at,v_now),coalesce(v_sub.grace_until,v_now));
  UPDATE public.subscriptions SET status='suspended',ended_at=v_end,retention_started_at=v_end,
   retention_ends_at=((v_end AT TIME ZONE 'UTC'+interval '6 months') AT TIME ZONE 'UTC'),retention_status='active_retention',updated_at=v_now
   WHERE tenant_id=p_tenant_id;
  UPDATE public.tenants SET status='suspended',billing_suspended=true,updated_at=v_now WHERE id=p_tenant_id;
 ELSIF p_action='reactivate_tenant' THEN
  v_valid:=v_tenant.billing_exempt OR v_sub.status IN ('authorized','free','exempt')
   OR (v_sub.status='trialing' AND v_sub.trial_ends_at>v_now)
   OR (v_sub.status IN ('paused','past_due') AND v_sub.grace_until>v_now)
   OR (v_sub.status='cancelled' AND v_sub.current_period_end>v_now);
  IF NOT v_valid THEN RAISE EXCEPTION 'Reativacao bloqueada: assinatura sem cobertura vigente. Estenda o teste, conceda isencao ou regularize o pagamento.'; END IF;
  UPDATE public.tenants SET status='active',billing_suspended=false,updated_at=v_now WHERE id=p_tenant_id;
  UPDATE public.subscriptions SET ended_at=NULL,retention_started_at=NULL,retention_ends_at=NULL,retention_status='none',updated_at=v_now WHERE tenant_id=p_tenant_id;
 ELSE RAISE EXCEPTION 'Acao de assinatura desconhecida: %',p_action;
 END IF;
 PERFORM public.write_platform_audit_log(v_admin,'subscription_'||p_action,'subscription',p_tenant_id::text,
  jsonb_build_object('status',v_sub.status,'billingExempt',v_tenant.billing_exempt,'trialEndsAt',v_sub.trial_ends_at),
  jsonb_build_object('action',p_action,'days',p_days),v_clean_reason);
 RETURN jsonb_build_object('tenantId',p_tenant_id,'action',p_action,'ok',true);
END; $$;

REVOKE ALL ON FUNCTION public.admin_set_establishment_status(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_establishment_status(uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_manage_subscription(uuid,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_subscription(uuid,text,integer,text) TO authenticated,service_role;
COMMIT;