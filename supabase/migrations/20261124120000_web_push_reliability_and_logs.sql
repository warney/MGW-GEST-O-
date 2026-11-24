-- Web Push reliability, deduplication, delivery diagnostics, and safe device listing.
-- Preserves existing triggers, tables, and multi-tenant RBAC rules.

BEGIN;

-- 1. Consolida RLS em tenant_push_subscriptions (remove policy permissiva legada duplicada)
DROP POLICY IF EXISTS "Members manage own push subscriptions" ON public.tenant_push_subscriptions;
DROP POLICY IF EXISTS tenant_push_subscriptions_manage_own_active ON public.tenant_push_subscriptions;
DROP POLICY IF EXISTS tenant_push_subscriptions_manage_own_by_role ON public.tenant_push_subscriptions;

CREATE POLICY tenant_push_subscriptions_manage_own_by_role
  ON public.tenant_push_subscriptions
  FOR ALL
  TO authenticated
  USING (
    user_id = (select auth.uid())
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager'])
  );

-- 2. Tabela de diagnostico e controle de duplicidade de envios Web Push por pedido
CREATE TABLE IF NOT EXISTS public.order_push_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'order_received',
  status text NOT NULL DEFAULT 'queued',
  http_status integer NULL,
  sent_count integer NOT NULL DEFAULT 0,
  expired_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_push_delivery_logs_status_check
    CHECK (status IN ('queued', 'sent', 'partial_failure', 'no_subscriptions', 'vault_secret_missing', 'trigger_error', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS order_push_delivery_logs_order_event_uidx
  ON public.order_push_delivery_logs (order_id, event_type)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_push_delivery_logs_tenant_created_idx
  ON public.order_push_delivery_logs (tenant_id, created_at DESC);

ALTER TABLE public.order_push_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_push_delivery_logs_select_by_role ON public.order_push_delivery_logs;
CREATE POLICY order_push_delivery_logs_select_by_role
  ON public.order_push_delivery_logs
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

REVOKE ALL ON public.order_push_delivery_logs FROM anon;
GRANT SELECT ON public.order_push_delivery_logs TO authenticated;
GRANT ALL ON public.order_push_delivery_logs TO service_role;

DROP TRIGGER IF EXISTS trg_order_push_delivery_logs_updated_at ON public.order_push_delivery_logs;
CREATE TRIGGER trg_order_push_delivery_logs_updated_at
  BEFORE UPDATE ON public.order_push_delivery_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Atualiza o dispatcher existente para 10s de timeout e registro seguro de diagnostico
CREATE OR REPLACE FUNCTION public.dispatch_new_order_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, vault, net
AS $$
DECLARE
  v_webhook_secret text;
BEGIN
  SELECT decrypted_secret INTO v_webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'mgw_push_webhook_secret'
  LIMIT 1;

  IF v_webhook_secret IS NULL OR btrim(v_webhook_secret) = '' THEN
    INSERT INTO public.order_push_delivery_logs (
      tenant_id, order_id, event_type, status, error_message
    ) VALUES (
      new.tenant_id, new.id, 'order_received', 'vault_secret_missing',
      'Segredo mgw_push_webhook_secret ausente no Supabase Vault.'
    )
    ON CONFLICT (order_id, event_type) WHERE order_id IS NOT NULL DO UPDATE SET
      status = EXCLUDED.status,
      error_message = EXCLUDED.error_message,
      updated_at = now();

    RAISE WARNING 'MGW Web Push is not configured: Vault secret mgw_push_webhook_secret is missing.';
    RETURN new;
  END IF;

  INSERT INTO public.order_push_delivery_logs (
    tenant_id, order_id, event_type, status
  ) VALUES (
    new.tenant_id, new.id, 'order_received', 'queued'
  )
  ON CONFLICT (order_id, event_type) WHERE order_id IS NOT NULL DO NOTHING;

  PERFORM net.http_post(
    url := 'https://rlinibriiwbkdqjrfapd.supabase.co/functions/v1/send-order-push',
    body := jsonb_build_object('record', jsonb_build_object('id', new.id, 'tenant_id', new.tenant_id)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mgw-push-secret', v_webhook_secret),
    timeout_milliseconds := 10000
  );

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.order_push_delivery_logs (
      tenant_id, order_id, event_type, status, error_message
    ) VALUES (
      new.tenant_id, new.id, 'order_received', 'trigger_error', left(coalesce(sqlerrm, 'Erro pg_net'), 400)
    )
    ON CONFLICT (order_id, event_type) WHERE order_id IS NOT NULL DO UPDATE SET
      status = EXCLUDED.status,
      error_message = EXCLUDED.error_message,
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE WARNING 'MGW Web Push dispatch failed for order %: %', new.id, sqlerrm;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_new_order_push() FROM public, anon, authenticated;

-- 4. RPC segura para listar dispositivos autorizados do estabelecimento sem expor endpoint/chaves
CREATE OR REPLACE FUNCTION public.get_tenant_push_devices(p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  member_email text,
  member_role text,
  user_agent text,
  is_enabled boolean,
  updated_at timestamptz,
  is_current_user boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    s.id,
    s.user_id,
    coalesce(tm.email, '') AS member_email,
    coalesce(tm.role, 'manager') AS member_role,
    s.user_agent,
    s.is_enabled,
    s.updated_at,
    (s.user_id = auth.uid()) AS is_current_user
  FROM public.tenant_push_subscriptions s
  JOIN public.tenant_members tm
    ON tm.tenant_id = s.tenant_id
   AND tm.user_id = s.user_id
   AND tm.active = true
  WHERE s.tenant_id = p_tenant_id
    AND public.has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager'])
    AND tm.role IN ('owner', 'admin', 'manager')
  ORDER BY s.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_push_devices(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_push_devices(uuid) TO authenticated;

COMMIT;
