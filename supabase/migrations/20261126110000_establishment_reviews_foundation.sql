-- MGW Cardapio Digital: base do sistema de avaliacoes e reputacao.
-- Convites e avaliacoes sao vinculados a pedidos concluidos; dados publicos serao
-- disponibilizados futuramente por RPCs seguros, nunca por leitura anonima direta.
BEGIN;

CREATE TABLE IF NOT EXISTS public.review_invitation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.online_orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > issued_at),
  CHECK (consumed_at IS NULL OR consumed_at >= issued_at)
);
CREATE INDEX IF NOT EXISTS idx_review_invitation_tokens_tenant
  ON public.review_invitation_tokens (tenant_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS public.establishment_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.online_orders(id) ON DELETE CASCADE,
  customer_name_snapshot text NOT NULL DEFAULT '',
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1200),
  publication_status text NOT NULL DEFAULT 'published'
    CHECK (publication_status IN ('published', 'hidden', 'removed')),
  is_verified_purchase boolean NOT NULL DEFAULT true CHECK (is_verified_purchase),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_establishment_reviews_tenant_submitted
  ON public.establishment_reviews (tenant_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_establishment_reviews_tenant_rating
  ON public.establishment_reviews (tenant_id, rating, submitted_at DESC)
  WHERE publication_status = 'published';

CREATE TABLE IF NOT EXISTS public.review_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  review_id uuid NOT NULL UNIQUE REFERENCES public.establishment_reviews(id) ON DELETE CASCADE,
  reply_text text NOT NULL CHECK (char_length(btrim(reply_text)) BETWEEN 1 AND 1200),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_replies_tenant_created
  ON public.review_replies (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.review_moderation_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES public.establishment_reviews(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('hidden','restored','removed','flagged','reply_created','reply_updated','reply_removed')),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 1000),
  previous_status text,
  new_status text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_moderation_logs_review
  ON public.review_moderation_logs (tenant_id, review_id, occurred_at DESC);

ALTER TABLE public.review_invitation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_moderation_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.review_invitation_tokens, public.review_moderation_logs,
  public.establishment_reviews, public.review_replies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.establishment_reviews, public.review_replies TO authenticated;
GRANT INSERT, UPDATE ON public.review_replies TO authenticated;

CREATE POLICY establishment_reviews_tenant_read ON public.establishment_reviews
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY review_replies_tenant_read ON public.review_replies
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY review_replies_tenant_insert ON public.review_replies
  FOR INSERT TO authenticated
  WITH CHECK (public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']::text[])
    AND created_by = (SELECT auth.uid()));

CREATE POLICY review_replies_tenant_update ON public.review_replies
  FOR UPDATE TO authenticated
  USING (public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']::text[]))
  WITH CHECK (public.has_active_tenant_access(tenant_id)
    AND public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']::text[])
    AND created_by = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_establishment_review_order()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_order public.online_orders%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.customer_name_snapshot IS DISTINCT FROM OLD.customer_name_snapshot
    OR NEW.is_verified_purchase IS DISTINCT FROM OLD.is_verified_purchase
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
  ) THEN RAISE EXCEPTION 'A origem da avaliação é imutável.'; END IF;
  SELECT * INTO v_order FROM public.online_orders WHERE id = NEW.order_id FOR KEY SHARE;
  IF NOT FOUND OR v_order.tenant_id <> NEW.tenant_id THEN RAISE EXCEPTION 'Pedido não encontrado para este estabelecimento.'; END IF;
  IF v_order.status <> 'completed' OR v_order.completed_at IS NULL THEN RAISE EXCEPTION 'Somente pedidos concluídos podem receber avaliação.'; END IF;
  NEW.customer_name_snapshot := left(btrim(v_order.customer_name), 120);
  NEW.is_verified_purchase := true;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_establishment_review_order
  BEFORE INSERT OR UPDATE ON public.establishment_reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_establishment_review_order();

CREATE OR REPLACE FUNCTION public.validate_review_invitation_order()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_order public.online_orders%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
  ) THEN RAISE EXCEPTION 'A origem do convite é imutável.'; END IF;
  SELECT * INTO v_order FROM public.online_orders WHERE id = NEW.order_id FOR KEY SHARE;
  IF NOT FOUND OR v_order.tenant_id <> NEW.tenant_id THEN RAISE EXCEPTION 'Pedido não encontrado para este estabelecimento.'; END IF;
  IF v_order.status <> 'completed' OR v_order.completed_at IS NULL THEN RAISE EXCEPTION 'Convites só podem ser emitidos após a conclusão do pedido.'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_review_invitation_order
  BEFORE INSERT OR UPDATE ON public.review_invitation_tokens
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_invitation_order();

CREATE OR REPLACE FUNCTION public.validate_review_reply_tenant()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_review public.establishment_reviews%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.review_id IS DISTINCT FROM OLD.review_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN RAISE EXCEPTION 'A origem da resposta é imutável.'; END IF;
  SELECT * INTO v_review FROM public.establishment_reviews WHERE id = NEW.review_id;
  IF NOT FOUND OR v_review.tenant_id <> NEW.tenant_id OR v_review.publication_status <> 'published'
    THEN RAISE EXCEPTION 'Avaliação indisponível para resposta.'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_review_reply_tenant
  BEFORE INSERT OR UPDATE ON public.review_replies
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_reply_tenant();

REVOKE ALL ON FUNCTION public.validate_establishment_review_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_review_invitation_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_review_reply_tenant() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.review_invitation_tokens IS 'Hashes de convites individuais para avaliar pedidos concluidos; token original nunca e armazenado.';
COMMENT ON TABLE public.establishment_reviews IS 'Avaliacoes unicas vinculadas a pedidos concluidos, com nota e comentario opcional.';
COMMENT ON TABLE public.review_replies IS 'Respostas publicas dos estabelecimentos as proprias avaliacoes.';
COMMENT ON TABLE public.review_moderation_logs IS 'Trilha de auditoria de moderacao de avaliacoes e respostas.';

COMMIT;