-- Etapa 3: leitura publica segura das avaliacoes publicadas do cardapio.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_establishment_reviews(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id uuid;
  v_result jsonb;
BEGIN
  IF coalesce(length(btrim(p_slug)), 0) < 2 OR length(p_slug) > 120 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.digital_menu_settings
  WHERE slug = btrim(p_slug)
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'averageRating', coalesce(round(avg(r.rating)::numeric, 1), 0),
    'totalReviews', count(r.id),
    'distribution', jsonb_build_object(
      '1', count(r.id) FILTER (WHERE r.rating = 1),
      '2', count(r.id) FILTER (WHERE r.rating = 2),
      '3', count(r.id) FILTER (WHERE r.rating = 3),
      '4', count(r.id) FILTER (WHERE r.rating = 4),
      '5', count(r.id) FILTER (WHERE r.rating = 5)
    ),
    'reviews', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'rating', x.rating,
          'comment', x.comment,
          'submittedAt', x.submitted_at,
          'verified', x.is_verified_purchase,
          'reply', x.reply_text,
          'replyAt', x.reply_created_at
        ) ORDER BY x.submitted_at DESC
      )
      FROM (
        SELECT r2.id, r2.rating, r2.comment, r2.submitted_at,
               r2.is_verified_purchase, rp.reply_text, rp.created_at AS reply_created_at
        FROM public.establishment_reviews r2
        LEFT JOIN public.review_replies rp
          ON rp.review_id = r2.id AND rp.tenant_id = r2.tenant_id
        WHERE r2.tenant_id = v_tenant_id
          AND r2.publication_status = 'published'
        ORDER BY r2.submitted_at DESC
        LIMIT 50
      ) x
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.establishment_reviews r
  WHERE r.tenant_id = v_tenant_id
    AND r.publication_status = 'published';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_establishment_reviews(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_establishment_reviews(text) TO anon, authenticated;
COMMENT ON FUNCTION public.get_public_establishment_reviews(text) IS
  'Retorna somente media, distribuicao e dados publicos de ate 50 avaliacoes publicadas do cardapio.';

COMMIT;