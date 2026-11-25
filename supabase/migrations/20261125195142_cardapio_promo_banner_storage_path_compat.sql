-- Keep promotional images compatible with the existing branding/banner storage kind.
ALTER TABLE public.digital_menu_promo_banners
  DROP CONSTRAINT IF EXISTS digital_menu_promo_banners_image_path_check;
ALTER TABLE public.digital_menu_promo_banners
  ADD CONSTRAINT digital_menu_promo_banners_image_path_check CHECK (
    image_path = ''
    OR image_path ~ ('^tenants/' || tenant_id::text || '/branding/banner/[A-Za-z0-9_.-]{3,160}$')
  );
