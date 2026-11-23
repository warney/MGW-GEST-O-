-- MGW Admin Phase 4.4: billing and subscription integrity
-- Additive and idempotent. Does not change existing subscription/payment states.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Preserve a cancellation timestamp only when an existing terminal state and
-- a trustworthy ended_at timestamp are already present.
UPDATE public.subscriptions
SET cancelled_at = ended_at
WHERE cancelled_at IS NULL
  AND ended_at IS NOT NULL
  AND lower(status) IN ('cancelled', 'canceled');

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancelled_at
  ON public.subscriptions (cancelled_at DESC)
  WHERE cancelled_at IS NOT NULL;

-- Payment ledger idempotency: the same provider payment must not be recorded
-- twice. Existing duplicate rows, if any, are intentionally not deleted;
-- the unique index is created only when current data satisfies the invariant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_payments
    WHERE mp_payment_id IS NOT NULL
    GROUP BY provider, mp_payment_id
    HAVING count(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_payments_provider_payment
      ON public.platform_payments (provider, mp_payment_id)
      WHERE mp_payment_id IS NOT NULL';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_platform_payments_status_created
  ON public.platform_payments (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_payments_tenant_created
  ON public.platform_payments (tenant_id, created_at DESC);

-- Webhook events are keyed by provider event/resource identifiers in the
-- current schema. Keep an index for operational monitoring without exposing
-- raw payloads to the admin client.
CREATE INDEX IF NOT EXISTS idx_mp_webhook_events_status_received
  ON public.mp_webhook_events (processing_status, received_at DESC);

COMMENT ON COLUMN public.subscriptions.cancelled_at IS
  'Timestamp when the subscription was cancelled; distinct from ended_at when the paid period or retention lifecycle continues.';
