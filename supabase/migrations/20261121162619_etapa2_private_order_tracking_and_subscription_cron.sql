-- Close direct public access to tracking hashes and remove the shared table from Realtime.
-- Public tracking now polls get_public_order_by_token(token), which requires the unguessable order token.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

DROP POLICY IF EXISTS online_order_pings_public_read ON public.online_order_realtime_pings;
REVOKE ALL ON TABLE public.online_order_realtime_pings FROM anon, authenticated;
ALTER PUBLICATION supabase_realtime DROP TABLE public.online_order_realtime_pings;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='mgw-refresh-subscription-lifecycle') THEN
    PERFORM cron.schedule(
      'mgw-refresh-subscription-lifecycle',
      '*/15 * * * *',
      'SELECT public.refresh_subscription_lifecycle();'
    );
  END IF;
END;
$$;
