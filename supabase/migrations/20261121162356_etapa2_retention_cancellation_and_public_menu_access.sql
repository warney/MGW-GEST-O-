-- Retention, cancellation access, and public menu subscription enforcement.
-- Additive and safe for existing tenant data. No data is deleted.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_until timestamptz;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS chk_subscriptions_status;
ALTER TABLE public.subscriptions ADD CONSTRAINT chk_subscriptions_status
  CHECK (status = ANY (ARRAY['pending','trialing','free','authorized','paused','past_due','cancelled','exempt','expired','suspended']::text[]));

COMMENT ON COLUMN public.subscriptions.ended_at IS 'Data em que o acesso contratado terminou definitivamente.';
COMMENT ON COLUMN public.subscriptions.retention_until IS 'Retenção mínima de seis meses após ended_at; não executa exclusão automática.';

CREATE OR REPLACE FUNCTION public.set_subscription_retention_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status IN ('authorized','trialing','exempt','free') THEN
    NEW.ended_at := NULL; NEW.retention_until := NULL;
  ELSIF NEW.status = 'cancelled' THEN
    NEW.ended_at := COALESCE(NEW.current_period_end,NEW.trial_ends_at,now());
    NEW.retention_until := NEW.ended_at + interval '6 months';
  ELSIF NEW.status = 'expired' THEN
    NEW.ended_at := COALESCE(NEW.trial_ends_at,NEW.current_period_end,now());
    NEW.retention_until := NEW.ended_at + interval '6 months';
  ELSIF NEW.status = 'suspended' THEN
    NEW.ended_at := COALESCE(NEW.grace_until,now());
    NEW.retention_until := NEW.ended_at + interval '6 months';
  ELSE
    NEW.ended_at := NULL; NEW.retention_until := NULL;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.set_subscription_retention_window() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS trg_subscription_retention_window ON public.subscriptions;
CREATE TRIGGER trg_subscription_retention_window
BEFORE INSERT OR UPDATE OF status,current_period_end,trial_ends_at,grace_until
ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_subscription_retention_window();

UPDATE public.subscriptions
SET ended_at = CASE
      WHEN status='cancelled' THEN COALESCE(current_period_end,trial_ends_at,now())
      WHEN status='expired' THEN COALESCE(trial_ends_at,current_period_end,now())
      WHEN status='suspended' THEN COALESCE(grace_until,now()) ELSE ended_at END,
    retention_until = CASE
      WHEN status IN ('cancelled','expired','suspended') THEN
        (CASE WHEN status='cancelled' THEN COALESCE(current_period_end,trial_ends_at,now())
              WHEN status='expired' THEN COALESCE(trial_ends_at,current_period_end,now())
              ELSE COALESCE(grace_until,now()) END) + interval '6 months'
      ELSE retention_until END
WHERE status IN ('cancelled','expired','suspended') AND (ended_at IS NULL OR retention_until IS NULL);

CREATE OR REPLACE FUNCTION public.refresh_subscription_lifecycle()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE v_count integer := 0; v_rows integer := 0;
BEGIN
  UPDATE public.subscriptions SET status='expired',updated_at=now()
  WHERE status='trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at<=now();
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count := v_count + v_rows;
  UPDATE public.subscriptions SET status='suspended',updated_at=now()
  WHERE status IN ('paused','past_due') AND grace_until IS NOT NULL AND grace_until<=now();
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_count := v_count + v_rows;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_subscription_lifecycle() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_subscription_lifecycle() TO service_role;

CREATE OR REPLACE FUNCTION public.has_active_tenant_access(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    JOIN public.tenants t ON t.id=tm.tenant_id
    LEFT JOIN public.subscriptions s ON s.tenant_id=t.id
    WHERE tm.tenant_id=p_tenant_id AND tm.user_id=auth.uid() AND tm.active=true AND t.status='active'
    AND (
      t.billing_exempt=true OR s.status IN ('authorized','exempt')
      OR (s.status='trialing' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at>now())
      OR (s.status IN ('paused','past_due') AND s.grace_until IS NOT NULL AND s.grace_until>now())
      OR (s.status='cancelled' AND s.current_period_end IS NOT NULL AND s.current_period_end>now())
    )
  );
$$;

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb)'::regprocedure) INTO v_def;
  IF position('v_sub.status = ''paused''' IN v_def)=0 THEN RAISE EXCEPTION 'Regra paused não encontrada na RPC de pedidos'; END IF;
  v_def := replace(v_def,'v_sub.status = ''paused''','v_sub.status IN (''paused'',''past_due'')');
  v_def := replace(v_def,
    'OR (v_sub.status IN (''paused'',''past_due'') AND v_sub.grace_until IS NOT NULL AND v_sub.grace_until > now())',
    'OR (v_sub.status IN (''paused'',''past_due'') AND v_sub.grace_until IS NOT NULL AND v_sub.grace_until > now()) OR (v_sub.status = ''cancelled'' AND v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > now())');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.get_public_digital_menu(text)'::regprocedure) INTO v_def;
  IF position('WHERE d.slug = p_slug' IN v_def)=0 THEN RAISE EXCEPTION 'Filtro de slug não encontrado na RPC do cardápio'; END IF;
  v_def := replace(v_def,
    'WHERE d.slug = p_slug' || chr(10) || '    AND d.is_active = true' || chr(10) || '    AND t.status = ''active''' || chr(10) || '  LIMIT 1;',
    'WHERE d.slug = p_slug' || chr(10) || '    AND d.is_active = true' || chr(10) || '    AND t.status = ''active''' || chr(10) ||
    '    AND (t.billing_exempt = true OR EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id=t.id AND (s.status IN (''authorized'',''exempt'') OR (s.status=''trialing'' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at>now()) OR (s.status IN (''paused'',''past_due'') AND s.grace_until IS NOT NULL AND s.grace_until>now()) OR (s.status=''cancelled'' AND s.current_period_end IS NOT NULL AND s.current_period_end>now()))))' || chr(10) ||
    '  LIMIT 1;');
  EXECUTE v_def;
END; $$;
