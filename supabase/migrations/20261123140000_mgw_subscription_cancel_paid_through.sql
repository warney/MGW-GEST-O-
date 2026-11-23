-- Preserve access until the paid-through date after a Mercado Pago cancellation.
-- Staged only: reconcile existing remote migration history before applying.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_subscription_retention_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ended_at timestamptz;
  v_retention_end timestamptz;
BEGIN
  IF NEW.status IN ('authorized','active','trialing','exempt','free') THEN
    NEW.ended_at := NULL;
    NEW.retention_until := NULL;
    NEW.retention_started_at := NULL;
    NEW.retention_ends_at := NULL;
    NEW.retention_status := 'none';
  ELSIF NEW.status = 'cancelled' AND NEW.current_period_end IS NOT NULL AND NEW.current_period_end > now() THEN
    NEW.ended_at := NEW.current_period_end;
    NEW.retention_until := NULL;
    NEW.retention_started_at := NULL;
    NEW.retention_ends_at := NULL;
    NEW.retention_status := 'none';
  ELSIF NEW.status IN ('cancelled','expired','suspended') THEN
    IF NEW.status = 'cancelled' THEN
      v_ended_at := COALESCE(NEW.current_period_end, NEW.ended_at, now());
    ELSIF NEW.status = 'expired' THEN
      v_ended_at := COALESCE(NEW.trial_ends_at, NEW.current_period_end, NEW.ended_at, now());
    ELSE
      v_ended_at := COALESCE(NEW.grace_until, NEW.ended_at, now());
    END IF;
    v_retention_end := v_ended_at + interval '6 months';
    NEW.ended_at := v_ended_at;
    NEW.retention_until := v_retention_end;
    NEW.retention_started_at := v_ended_at;
    NEW.retention_ends_at := v_retention_end;
    NEW.retention_status := CASE WHEN now() < v_retention_end THEN 'active_retention' ELSE 'expired' END;
  ELSE
    NEW.ended_at := NULL;
    NEW.retention_until := NULL;
    NEW.retention_started_at := NULL;
    NEW.retention_ends_at := NULL;
    NEW.retention_status := 'none';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_subscription_retention_window() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_subscriptions_retention_window ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_retention_window
  BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_subscription_retention_window();

CREATE OR REPLACE FUNCTION public.refresh_subscription_lifecycle()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer := 0;
  v_rows integer := 0;
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired', updated_at = now()
  WHERE status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at <= now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_count := v_count + v_rows;

  UPDATE public.subscriptions
  SET status = 'suspended', updated_at = now()
  WHERE status IN ('paused','past_due') AND grace_until IS NOT NULL AND grace_until <= now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_count := v_count + v_rows;

  UPDATE public.subscriptions
  SET status = 'expired', updated_at = now()
  WHERE status = 'cancelled' AND current_period_end IS NOT NULL AND current_period_end <= now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_count := v_count + v_rows;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_subscription_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_subscription_lifecycle() TO service_role;

COMMIT;
