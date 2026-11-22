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

-- Deriva os campos apenas de datas já presentes no registro.
-- Não inventa data quando o histórico não contém um marco de encerramento.
WITH legacy AS (
  SELECT
    id,
    CASE
      WHEN status = 'cancelled' THEN COALESCE(ended_at, current_period_end, trial_ends_at)
      WHEN status = 'expired' THEN COALESCE(ended_at, trial_ends_at, current_period_end)
      WHEN status = 'suspended' THEN COALESCE(ended_at, grace_until)
      ELSE ended_at
    END AS retention_start,
    COALESCE(
      retention_until,
      CASE
        WHEN status = 'cancelled' THEN COALESCE(ended_at, current_period_end, trial_ends_at)
        WHEN status = 'expired' THEN COALESCE(ended_at, trial_ends_at, current_period_end)
        WHEN status = 'suspended' THEN COALESCE(ended_at, grace_until)
        ELSE ended_at
      END + interval '6 months'
    ) AS retention_end
  FROM public.subscriptions
)
UPDATE public.subscriptions AS s
SET
  ended_at = COALESCE(s.ended_at, legacy.retention_start),
  retention_started_at = COALESCE(s.retention_started_at, legacy.retention_start),
  retention_ends_at = COALESCE(s.retention_ends_at, legacy.retention_end),
  retention_status = CASE
    WHEN legacy.retention_end IS NULL THEN 'none'
    WHEN legacy.retention_end > now() THEN 'active_retention'
    ELSE 'expired'
  END
FROM legacy
WHERE legacy.id = s.id
  AND s.status IN ('cancelled', 'expired', 'suspended')
  AND (
    s.retention_status = 'none'
    OR s.retention_started_at IS NULL
    OR s.retention_ends_at IS NULL
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

-- O onboarding do MGW Gestão grava America/Manaus; alinhar o default
-- para novos registros sem sobrescrever fusos já definidos por estabelecimento.
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
  BEFORE INSERT OR UPDATE ON public.shop_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_shop_settings_timezone();

COMMIT;
