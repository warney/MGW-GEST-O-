BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_suspended boolean NOT NULL DEFAULT false;

-- Only classify existing suspended tenants whose subscription lifecycle proves
-- billing suspension. Administrative suspensions remain false.
UPDATE public.tenants AS t
SET billing_suspended = true
FROM public.subscriptions AS s
WHERE s.tenant_id = t.id
  AND t.status = 'suspended'
  AND s.status IN ('expired', 'cancelled', 'paused', 'past_due', 'suspended', 'pending')
  AND COALESCE(s.retention_status, 'none') IN ('none', 'active_retention');

CREATE OR REPLACE FUNCTION public.get_my_billing_recovery_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT tm.tenant_id
  FROM public.tenant_members AS tm
  JOIN public.tenants AS t ON t.id = tm.tenant_id
  JOIN public.subscriptions AS s ON s.tenant_id = tm.tenant_id
  WHERE tm.user_id = auth.uid()
    AND tm.active = true
    AND tm.role = 'owner'
    AND t.status = 'suspended'
    AND t.billing_suspended = true
    AND s.status IN ('expired', 'cancelled', 'paused', 'past_due', 'suspended', 'pending')
    AND COALESCE(s.retention_status, 'none') IN ('none', 'active_retention');
$$;

REVOKE ALL ON FUNCTION public.get_my_billing_recovery_tenant_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_billing_recovery_tenant_ids() TO authenticated;

COMMENT ON COLUMN public.tenants.billing_suspended IS
'True only when access was suspended automatically due to subscription billing; permits restricted checkout recovery, never operational data access.';

COMMIT;