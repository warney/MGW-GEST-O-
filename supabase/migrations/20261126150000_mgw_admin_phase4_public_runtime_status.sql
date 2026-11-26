-- ============================================================================
-- MGW ADMIN — FASE 4: LEITURA PUBLICA SEGURA DE STATUS OPERACIONAL
-- Migration: 20261126150000_mgw_admin_phase4_public_runtime_status.sql
--
-- Objetivo:
--   Expor apenas os parametros operacionais publicos de public.platform_settings
--   (allow_public_signup, maintenance_mode, maintenance_message, suporte) para
--   que o app MGW Gestao respeite pausas de novos cadastros e modo manutencao.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_platform_runtime_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.platform_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.platform_settings WHERE id = 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'platformName', 'MGW Gestão',
      'supportEmail', '',
      'supportWhatsapp', '',
      'allowPublicSignup', true,
      'maintenanceMode', false,
      'maintenanceMessage', ''
    );
  END IF;

  RETURN jsonb_build_object(
    'platformName', coalesce(nullif(btrim(v_row.platform_name), ''), 'MGW Gestão'),
    'supportEmail', coalesce(v_row.support_email, ''),
    'supportWhatsapp', coalesce(v_row.support_whatsapp, ''),
    'allowPublicSignup', coalesce(v_row.allow_public_signup, true),
    'maintenanceMode', coalesce(v_row.maintenance_mode, false),
    'maintenanceMessage', coalesce(v_row.maintenance_message, '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_runtime_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_runtime_status() TO anon, authenticated, service_role;

COMMIT;
