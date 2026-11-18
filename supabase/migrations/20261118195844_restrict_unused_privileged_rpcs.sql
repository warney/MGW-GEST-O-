-- Remove public client access to unused privileged onboarding RPCs.
-- Tenant creation is performed only by the auth.users provisioning trigger;
-- invitation acceptance remains disabled until a verified invite UI is implemented.
BEGIN;

REVOKE ALL ON FUNCTION public.create_tenant_with_owner(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.accept_tenant_invitation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(text) TO service_role;

-- This helper is not called by the frontend or any RLS policy.
REVOKE ALL ON FUNCTION public.get_my_tenant_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_role(uuid) TO service_role;

COMMIT;
