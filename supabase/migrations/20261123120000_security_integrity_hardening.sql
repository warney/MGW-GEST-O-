-- MGW security and lifecycle hardening.
-- This migration is intentionally staged in Git only; reconcile remote migration history
-- before applying it to any Supabase environment.

BEGIN;

-- Revalidate both related records against the tenant of the linking row.
DROP POLICY IF EXISTS product_addon_groups_manager_update ON public.product_addon_groups;
CREATE POLICY product_addon_groups_manager_update ON public.product_addon_groups
FOR UPDATE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']))
WITH CHECK (
  public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager'])
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_addon_groups.product_id
      AND p.tenant_id = product_addon_groups.tenant_id
  )
  AND EXISTS (
    SELECT 1 FROM public.addon_groups g
    WHERE g.id = product_addon_groups.group_id
      AND g.tenant_id = product_addon_groups.tenant_id
  )
);

-- Trigger-only function: callers must not be able to invoke it as an RPC.
REVOKE ALL ON FUNCTION public.guard_mgw_menu_addon_tenant() FROM PUBLIC, anon, authenticated;

-- Keep the legacy retention_until column synchronized with the fields consumed by
-- the application, and make the retention state deterministic on every lifecycle change.
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
  IF NEW.status IN ('authorized','trialing','exempt','free') THEN
    NEW.ended_at := NULL;
    NEW.retention_until := NULL;
    NEW.retention_started_at := NULL;
    NEW.retention_ends_at := NULL;
    NEW.retention_status := 'none';
  ELSIF NEW.status IN ('cancelled','expired','suspended') THEN
    IF NEW.status = 'cancelled' THEN
      v_ended_at := COALESCE(NEW.current_period_end, NEW.trial_ends_at, NEW.ended_at, now());
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
    NEW.retention_status := CASE
      WHEN now() < v_retention_end THEN 'active_retention'
      ELSE 'expired'
    END;
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

-- Backfill only the derived retention fields; no tenant or payment data is changed.
UPDATE public.subscriptions
SET retention_started_at = ended_at,
    retention_ends_at = retention_until,
    retention_status = CASE
      WHEN retention_until IS NULL THEN 'none'
      WHEN retention_until > now() THEN 'active_retention'
      ELSE 'expired'
    END
WHERE status IN ('cancelled','expired','suspended')
  AND (
    retention_started_at IS DISTINCT FROM ended_at
    OR retention_ends_at IS DISTINCT FROM retention_until
    OR retention_status IS DISTINCT FROM CASE
      WHEN retention_until IS NULL THEN 'none'
      WHEN retention_until > now() THEN 'active_retention'
      ELSE 'expired'
    END
  );

-- The tracking RPC must never return the stored SHA-256 hash. It is not the bearer
-- token, but returning it exposes an unnecessary internal identifier.
DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_public_order_by_token(text)'::regprocedure
  ) INTO v_definition;

  IF position('''tokenHash'',o.tracking_token_hash' IN v_definition) = 0 THEN
    RAISE NOTICE 'Tracking RPC already omits tokenHash; no replacement needed.';
  ELSE
    v_definition := replace(v_definition, ',''tokenHash'',o.tracking_token_hash', '');
    IF position('''tokenHash'',o.tracking_token_hash' IN v_definition) > 0 THEN
      RAISE EXCEPTION 'Could not remove tokenHash from tracking RPC definition';
    END IF;
    EXECUTE v_definition;
  END IF;
END;
$$;

COMMIT;
