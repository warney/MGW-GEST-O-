-- Etapa 2: convites individuais e submissao publica segura de avaliacoes.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_public_review_invitation(p_tracking_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_order public.online_orders%ROWTYPE;
  v_token text;
  v_expires timestamptz;
BEGIN
  IF coalesce(length(p_tracking_token), 0) < 32 OR length(p_tracking_token) > 128 THEN
    RAISE EXCEPTION 'Link de acompanhamento inválido.';
  END IF;

  SELECT * INTO v_order
  FROM public.online_orders
  WHERE tracking_token_hash = encode(digest(p_tracking_token, 'sha256'), 'hex')
  FOR UPDATE;

  IF NOT FOUND OR v_order.status <> 'completed' OR v_order.completed_at IS NULL THEN
    RAISE EXCEPTION 'A avaliação estará disponível após a conclusão do pedido.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.establishment_reviews WHERE order_id = v_order.id) THEN
    RAISE EXCEPTION 'Este pedido já possui uma avaliação.';
  END IF;

  -- Derivado do token aleatório de acompanhamento (192 bits), para que recargas
  -- do acompanhamento recuperem o mesmo convite sem armazenar o token em claro.
  v_token := encode(digest('mgw-review-v1:' || p_tracking_token, 'sha256'), 'hex');
  v_expires := now() + interval '30 days';

  INSERT INTO public.review_invitation_tokens
    (tenant_id, order_id, token_hash, issued_at, expires_at, consumed_at, revoked_at)
  VALUES
    (v_order.tenant_id, v_order.id, encode(digest(v_token, 'sha256'), 'hex'), now(), v_expires, NULL, NULL)
  ON CONFLICT (order_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.review_invitation_tokens
    WHERE order_id = v_order.id
      AND token_hash = encode(digest(v_token, 'sha256'), 'hex')
      AND revoked_at IS NULL AND consumed_at IS NULL AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'Este pedido já possui um convite de avaliação utilizado ou revogado.';
  END IF;

  RETURN jsonb_build_object('token', v_token, 'expiresAt', v_expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_review_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_invitation public.review_invitation_tokens%ROWTYPE;
  v_order public.online_orders%ROWTYPE;
  v_store_name text;
BEGIN
  IF coalesce(length(p_token), 0) <> 64 THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT * INTO v_invitation
  FROM public.review_invitation_tokens
  WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex');

  IF NOT FOUND OR v_invitation.revoked_at IS NOT NULL
    OR v_invitation.consumed_at IS NOT NULL OR v_invitation.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT * INTO v_order FROM public.online_orders WHERE id = v_invitation.order_id;
  IF NOT FOUND OR v_order.status <> 'completed' OR v_order.completed_at IS NULL THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT coalesce(nullif(store_name, ''), 'Estabelecimento')
    INTO v_store_name
  FROM public.digital_menu_settings
  WHERE tenant_id = v_invitation.tenant_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'valid', true,
    'storeName', coalesce(v_store_name, 'Estabelecimento'),
    'orderCode', coalesce(nullif(v_order.order_code, ''), '#' || v_order.order_number::text),
    'expiresAt', v_invitation.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_public_establishment_review(
  p_token text,
  p_rating integer,
  p_comment text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_invitation public.review_invitation_tokens%ROWTYPE;
  v_review_id uuid;
  v_clean_comment text := btrim(coalesce(p_comment, ''));
BEGIN
  IF coalesce(length(p_token), 0) <> 64 THEN
    RAISE EXCEPTION 'Convite inválido ou expirado.';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Selecione uma nota de 1 a 5 estrelas.';
  END IF;
  IF char_length(v_clean_comment) > 1200 THEN
    RAISE EXCEPTION 'O comentário deve ter no máximo 1.200 caracteres.';
  END IF;

  SELECT * INTO v_invitation
  FROM public.review_invitation_tokens
  WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex')
  FOR UPDATE;

  IF NOT FOUND OR v_invitation.revoked_at IS NOT NULL
    OR v_invitation.consumed_at IS NOT NULL OR v_invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'Convite inválido, expirado ou já utilizado.';
  END IF;

  INSERT INTO public.establishment_reviews
    (tenant_id, order_id, rating, comment, publication_status, is_verified_purchase)
  VALUES
    (v_invitation.tenant_id, v_invitation.order_id, p_rating, v_clean_comment, 'published', true)
  RETURNING id INTO v_review_id;

  UPDATE public.review_invitation_tokens
  SET consumed_at = now()
  WHERE id = v_invitation.id AND consumed_at IS NULL;

  RETURN jsonb_build_object('success', true, 'reviewId', v_review_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_review_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_review_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_public_establishment_review(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_review_invitation(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_review_invitation(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_establishment_review(text, integer, text) TO anon, authenticated;

COMMENT ON FUNCTION public.create_public_review_invitation(text) IS 'Emite convite de avaliacao somente para pedido concluido, autenticado pelo token de acompanhamento.';
COMMENT ON FUNCTION public.get_public_review_invitation(text) IS 'Valida convite e retorna apenas dados publicos minimos para o formulario.';
COMMENT ON FUNCTION public.submit_public_establishment_review(text, integer, text) IS 'Consome convite e grava avaliacao verificada atomicamente, sem permitir edicao.';

COMMIT;