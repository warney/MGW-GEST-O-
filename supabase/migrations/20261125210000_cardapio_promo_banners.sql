-- MGW Cardápio Digital: banners promocionais independentes do cabeçalho.
-- Cada estabelecimento administra até três banners; somente metadados necessários
-- para a exibição pública são retornados pela RPC abaixo.

CREATE TABLE IF NOT EXISTS public.digital_menu_promo_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 1 AND 3),
  image_url text NOT NULL DEFAULT '' CHECK (char_length(image_url) <= 1000),
  image_path text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  click_action text NOT NULL DEFAULT 'none'
    CHECK (click_action IN ('none', 'product', 'combo')),
  target_id uuid,
  zoom numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (zoom BETWEEN 1.00 AND 2.50),
  position_x numeric(5,2) NOT NULL DEFAULT 50.00 CHECK (position_x BETWEEN 0 AND 100),
  position_y numeric(5,2) NOT NULL DEFAULT 50.00 CHECK (position_y BETWEEN 0 AND 100),
  display_interval_seconds integer NOT NULL DEFAULT 5
    CHECK (display_interval_seconds IN (5, 7, 10, 15)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_menu_promo_banners_target_check CHECK (
    (click_action = 'none' AND target_id IS NULL)
    OR (click_action IN ('product', 'combo') AND target_id IS NOT NULL)
  ),
  CONSTRAINT digital_menu_promo_banners_image_path_check CHECK (
    image_path = ''
    OR image_path ~ ('^tenants/' || tenant_id::text || '/branding/promotions/[A-Za-z0-9_.-]{3,160}$')
  ),
  CONSTRAINT digital_menu_promo_banners_tenant_sort_unique UNIQUE (tenant_id, sort_order)
);

ALTER TABLE public.digital_menu_promo_banners ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.digital_menu_promo_banners TO authenticated;

CREATE POLICY digital_menu_promo_banners_member_select
ON public.digital_menu_promo_banners FOR SELECT TO authenticated
USING (public.has_active_tenant_access(tenant_id));

CREATE POLICY digital_menu_promo_banners_admin_insert
ON public.digital_menu_promo_banners FOR INSERT TO authenticated
WITH CHECK (
  public.has_active_tenant_access(tenant_id)
  AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']::text[])
);

CREATE POLICY digital_menu_promo_banners_admin_update
ON public.digital_menu_promo_banners FOR UPDATE TO authenticated
USING (
  public.has_active_tenant_access(tenant_id)
  AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']::text[])
)
WITH CHECK (
  public.has_active_tenant_access(tenant_id)
  AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']::text[])
);

CREATE POLICY digital_menu_promo_banners_admin_delete
ON public.digital_menu_promo_banners FOR DELETE TO authenticated
USING (
  public.has_active_tenant_access(tenant_id)
  AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']::text[])
);

CREATE OR REPLACE FUNCTION public.get_public_menu_promo_banners(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'imageUrl', b.image_url,
        'zoom', b.zoom,
        'positionX', b.position_x,
        'positionY', b.position_y,
        'clickAction',
          CASE
            WHEN b.click_action = 'product' AND EXISTS (
              SELECT 1 FROM public.products p
              WHERE p.id = b.target_id AND p.tenant_id = b.tenant_id AND p.active = true
            ) THEN 'product'
            WHEN b.click_action = 'combo' AND EXISTS (
              SELECT 1 FROM public.combos c
              WHERE c.id = b.target_id AND c.tenant_id = b.tenant_id AND c.active = true
            ) THEN 'combo'
            ELSE 'none'
          END,
        'targetId',
          CASE
            WHEN b.click_action = 'product' AND EXISTS (
              SELECT 1 FROM public.products p
              WHERE p.id = b.target_id AND p.tenant_id = b.tenant_id AND p.active = true
            ) THEN b.target_id::text
            WHEN b.click_action = 'combo' AND EXISTS (
              SELECT 1 FROM public.combos c
              WHERE c.id = b.target_id AND c.tenant_id = b.tenant_id AND c.active = true
            ) THEN b.target_id::text
            ELSE NULL
          END,
        'sortOrder', b.sort_order,
        'displayIntervalSeconds', b.display_interval_seconds
      ) ORDER BY b.sort_order ASC
    ),
    '[]'::jsonb
  )
  FROM public.digital_menu_promo_banners b
  JOIN public.digital_menu_settings d ON d.tenant_id = b.tenant_id
  WHERE d.slug = lower(btrim(coalesce(p_slug, '')))
    AND d.is_active = true
    AND public.is_tenant_billing_active(d.tenant_id)
    AND b.is_active = true
    AND btrim(b.image_url) <> '';
$function$;

REVOKE ALL ON FUNCTION public.get_public_menu_promo_banners(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_menu_promo_banners(text) TO anon, authenticated;
