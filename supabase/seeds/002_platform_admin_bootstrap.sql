-- ============================================================================
-- MGW ADMIN — BOOTSTRAP MANUAL DO PRIMEIRO SUPER ADMIN (TEMPLATE SEGURO)
-- Arquivo: supabase/seeds/002_platform_admin_bootstrap.sql
--
-- INSTRUCOES:
--   1. NAO invente UUIDs nem cadastre emails nao confirmados.
--   2. Primeiro, faca o cadastro/login real da conta do proprietario da
--      plataforma no Supabase Auth e confirme o e-mail (email_confirmed_at IS NOT NULL).
--   3. Substitua '<SEU_EMAIL_REAL_CONFIRMADO>' pelo e-mail verificado no
--      Supabase Auth e execute este script diretamente no SQL Editor do Supabase
--      (usando role postgres/service_role).
-- ============================================================================

BEGIN;

INSERT INTO public.platform_admins (
  user_id,
  email,
  full_name,
  role,
  active,
  notes
)
SELECT
  u.id,
  lower(btrim(u.email)),
  coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), 'Proprietario MGW'),
  'super_admin',
  true,
  'Bootstrap inicial do proprietario da plataforma'
FROM auth.users u
WHERE lower(btrim(u.email)) = lower(btrim('<SEU_EMAIL_REAL_CONFIRMADO>'))
  AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL
ON CONFLICT (user_id) DO UPDATE
SET
  role = 'super_admin',
  active = true,
  updated_at = now();

COMMIT;
