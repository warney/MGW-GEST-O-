-- MGW DELIVERY: hardening for region normalization and dispatch sync trigger.
-- Keep the trigger function executable by the database trigger, but not callable via PostgREST.
ALTER FUNCTION public.normalize_delivery_geo_text(text) SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.sync_delivery_dispatch_from_online_order() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
