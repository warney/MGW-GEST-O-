-- ============================================================================
-- MGW GESTAO — PREPARACAO DE VINCULOS DAS CONTAS FUNDADORAS (TEMPLATE)
-- Arquivo: supabase/seeds/001_founding_tenants.sql
--
-- ATENCAO:
--   * Este arquivo NAO migra dados do Firebase e NAO cria auth.users ficticios.
--   * O campo user_id permanece NULL ate que cada usuario fundador realize
--     autenticacao real e verificada no Supabase Auth, quando a funcao
--     public.claim_pending_memberships() vinculara auth.uid() com seguranca.
--   * Aplicar somente quando a etapa de provisionamento/migracao for autorizada.
-- ============================================================================

BEGIN;

-- 1. Estabelecimentos fundadores (isencao de cobranca garantida)
INSERT INTO public.tenants (slug, name, is_founder_account, billing_exempt, status)
VALUES
  ('mgw_lanches', 'MGW Lanches', true, true, 'active'),
  ('gf_lanches', 'Outro Lanche (Conta Separada)', true, true, 'active')
ON CONFLICT (slug) DO UPDATE
SET
  is_founder_account = true,
  billing_exempt = true,
  status = 'active';

-- 2. Assinaturas com status 'exempt' (sem cobranca recorrente)
INSERT INTO public.subscriptions (tenant_id, status)
SELECT id, 'exempt'
FROM public.tenants
WHERE slug IN ('mgw_lanches', 'gf_lanches')
ON CONFLICT (tenant_id) DO UPDATE
SET status = 'exempt';

-- 3. Vinculos pendentes por e-mail verificado (user_id NULL, sem UUID ficticio)
INSERT INTO public.tenant_members (tenant_id, user_id, email, role, is_founder, active)
SELECT
  t.id,
  NULL,
  m.email,
  m.role,
  true,
  true
FROM public.tenants t
JOIN (
  VALUES
    ('mgw_lanches', 'warney.fernandes22@gmail.com', 'owner'),
    ('mgw_lanches', 'fernandes38mk@gmail.com', 'admin'),
    ('gf_lanches', 'gf3163666@gmail.com', 'owner')
) AS m(slug, email, role)
  ON m.slug = t.slug
ON CONFLICT (tenant_id, email) DO NOTHING;

COMMIT;
