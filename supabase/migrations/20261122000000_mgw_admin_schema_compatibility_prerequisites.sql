-- MGW Admin 4.1 — compatibilidade com o schema remoto atual
-- Pré-requisitos aditivos para a migration 20261122000001.
-- Não altera políticas RLS operacionais nem remove dados.

BEGIN;

-- A migration 20261121162356 usa retention_until; a Etapa 4.1 também
-- precisa dos campos explícitos abaixo para exibir e calcular retenção.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS retention_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_status text NOT NULL DEFAULT 'none';

-- Converte os dados legados sem sobrescrever datas já registradas.
UPDATE public.subscriptions
SET
  ended_at = COALESCE(
    ended_at,
    retention_until - interval '6 months',
    current_period_end,
    trial_ends_at,
    grace_until
  ),
  retention_started_at = COALESCE(
    retention_started_at,
    ended_at,
    retention_until - interval '6 months'
  ),
  retention_ends_at = COALESCE(
    retention_ends_at,
    retention_until,
    ended_at + interval '6 months',
    (retention_until - interval '6 months') + interval '6 months'
  ),
  retention_status = CASE
    WHEN COALESCE(retention_ends_at, retention_until, ended_at + interval '6 months') IS NULL
      THEN 'none'
    WHEN COALESCE(retention_ends_at, retention_until, ended_at + interval '6 months') > now()
      THEN 'active_retention'
    ELSE 'expired'
  END
WHERE status IN ('cancelled', 'expired', 'suspended')
  AND (
    retention_status = 'none'
    OR retention_started_at IS NULL
    OR retention_ends_at IS NULL
  );

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS chk_subscriptions_retention_status;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT chk_subscriptions_retention_status
  CHECK (retention_status IN ('none', 'active_retention', 'expired'));

COMMENT ON COLUMN public.subscriptions.retention_started_at IS
  'Início do período de retenção após encerramento definitivo do acesso.';
COMMENT ON COLUMN public.subscriptions.retention_ends_at IS
  'Fim do período de retenção; não executa exclusão automática.';
COMMENT ON COLUMN public.subscriptions.retention_status IS
  'Estado da retenção: none, active_retention ou expired.';

-- O onboarding e o painel usam o fuso de Manaus como padrão.
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Manaus';

CREATE OR REPLACE FUNCTION public.validate_shop_settings_timezone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_timezone text := btrim(COALESCE(NEW.timezone, ''));
BEGIN
  IF v_timezone = '' THEN
    RAISE EXCEPTION 'Informe um fuso horário válido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names
    WHERE name = v_timezone
  ) THEN
    RAISE EXCEPTION 'Fuso horário inválido: %', v_timezone;
  END IF;

  NEW.timezone := v_timezone;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_shop_settings_timezone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_shop_settings_validate_timezone ON public.shop_settings;
CREATE TRIGGER trg_shop_settings_validate_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.shop_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_shop_settings_timezone();

COMMIT;
