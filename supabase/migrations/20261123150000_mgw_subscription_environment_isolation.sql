-- Keep Mercado Pago sandbox and production subscriptions isolated.
-- Null values identify legacy records that must not be reused across environments.

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS mp_environment text;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS chk_subscriptions_mp_environment;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT chk_subscriptions_mp_environment
  CHECK (mp_environment IS NULL OR mp_environment IN ('test', 'production'));

COMMENT ON COLUMN public.subscriptions.mp_environment IS
  'Mercado Pago environment that created this preapproval (test or production). Prevents cross-environment webhook mutations and checkout reuse.';

COMMIT;
