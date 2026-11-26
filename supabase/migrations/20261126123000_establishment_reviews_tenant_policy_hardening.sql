-- Tighten establishment review and reply visibility to active management roles.
BEGIN;
DROP POLICY IF EXISTS establishment_reviews_tenant_read ON public.establishment_reviews;
CREATE POLICY establishment_reviews_tenant_read
  ON public.establishment_reviews FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']::text[])
  );

DROP POLICY IF EXISTS review_replies_tenant_read ON public.review_replies;
CREATE POLICY review_replies_tenant_read
  ON public.review_replies FOR SELECT TO authenticated
  USING (
    public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']::text[])
  );

REVOKE ALL ON public.review_invitation_tokens, public.review_moderation_logs
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_establishment_review_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_review_invitation_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_review_reply_tenant() FROM PUBLIC, anon, authenticated;
COMMIT;