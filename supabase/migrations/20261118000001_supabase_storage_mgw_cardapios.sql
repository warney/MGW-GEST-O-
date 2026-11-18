-- ============================================================================
-- MGW GESTAO — SUPABASE STORAGE BUCKET & RLS POLICIES (CARDAPIOS DIGITAIS)
-- Migration: 20261118000001_supabase_storage_mgw_cardapios.sql
-- Project Ref: rlinibriiwbkdqjrfapd
--
-- ATENCAO:
--   * Cria somente o bucket 'mgw-cardapios' e politicas de leitura publica.
--   * Nao cria tabelas de negocio, nao altera Firebase/Firestore e nao migra dados.
--   * Escrita (INSERT/UPDATE) e exclusao (DELETE) permanecem 100% bloqueadas para
--     'anon' e 'authenticated' no cliente; operacoes ocorrem apenas via
--     Edge Function 'menu-storage' apos validacao de Firebase ID Token + tenant.
-- ============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mgw-cardapios',
  'mgw-cardapios',
  true,
  2097152,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

-- Remove eventuais politicas anteriores conflitantes neste bucket
DROP POLICY IF EXISTS mgw_cardapios_public_read ON storage.objects;
DROP POLICY IF EXISTS mgw_cardapios_deny_anon_write ON storage.objects;

-- Leitura publica somente de objetos dentro de tenants/...
-- Nenhum INSERT, UPDATE ou DELETE e concedido a 'anon' ou 'authenticated'
-- (default-deny do Postgres RLS).
CREATE POLICY mgw_cardapios_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'mgw-cardapios'
    AND name LIKE 'tenants/%'
  );

COMMIT;
