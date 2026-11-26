-- Harden review invitation issuance: keep active invitation stable and reissue only expired ones.
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
  v_hash text;
  v_expires timestamptz;
  v_existing public.review_invitation_tokens%ROWTYPE;
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

  -- The invitation token is deterministically derived from the high-entropy,
  -- unguessable order-tracking token. Only its hash is persisted.
  v_token := encode(digest('mgw-review-v1:' || p_tracking_token, 'sha256'), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  SELECT * INTO v_existing
  FROM public.review_invitation_tokens
  WHERE order_id = v_order.id
  FOR UPDATE;

  IF FOUND AND v_existing.revoked_at IS NULL
    AND v_existing.consumed_at IS NULL AND v_existing.expires_at > now()
    AND v_existing.token_hash = v_hash THEN
    RETURN jsonb_build_object('token', v_token, 'expiresAt', v_existing.expires_at);
  END IF;

  IF FOUND AND v_existing.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este pedido já utilizou seu convite de avaliação.';
  END IF;

  v_expires := now() + interval '30 days';

  IF FOUND THEN
    UPDATE public.review_invitation_tokens
    SET token_hash = v_hash,
        issued_at = now(),
        expires_at = v_expires,
        consumed_at = NULL,
        revoked_at = NULL
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.review_invitation_tokens
      (tenant_id, order_id, token_hash, issued_at, expires_at)
    VALUES (v_order.tenant_id, v_order.id, v_hash, now(), v_expires);
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
  IF coalesce(length(p_token), 0) <> 64 OR p_token !~ '^[a-f0-9]{64}$' THEN
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

COMMIT;