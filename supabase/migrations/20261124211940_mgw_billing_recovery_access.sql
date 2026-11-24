-- Allow owners of billing-suspended establishments to read only the minimal
-- tenant, membership and subscription rows needed to recover billing access.
-- Operational tenant data remains protected by get_my_tenant_ids().

BEGIN;

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

DROP POLICY IF EXISTS tenant_members_select_billing_recovery ON public.tenant_members;
CREATE POLICY tenant_members_select_billing_recovery
ON public.tenant_members FOR SELECT TO authenticated
USING (tenant_id IN (SELECT public.get_my_billing_recovery_tenant_ids()));

DROP POLICY IF EXISTS tenants_select_billing_recovery ON public.tenants;
CREATE POLICY tenants_select_billing_recovery
ON public.tenants FOR SELECT TO authenticated
USING (id IN (SELECT public.get_my_billing_recovery_tenant_ids()));

DROP POLICY IF EXISTS subscriptions_select_billing_recovery ON public.subscriptions;
CREATE POLICY subscriptions_select_billing_recovery
ON public.subscriptions FOR SELECT TO authenticated
USING (tenant_id IN (SELECT public.get_my_billing_recovery_tenant_ids()));

COMMENT ON FUNCTION public.get_my_billing_recovery_tenant_ids() IS
'Returns only billing-suspended tenant IDs owned by the current authenticated user for subscription recovery. Does not grant access to operational tenant data.';

COMMIT;