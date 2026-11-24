// @ts-expect-error Deno Edge Runtime types are provided by Supabase during function deployment.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const PRODUCTION_APP_URL = "https://mgw-gest-o.vercel.app";
const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getReturnUrl(req: Request): string {
  const origin = req.headers.get("origin") || "";
  try {
    const parsed = new URL(origin);
    const isProduction = parsed.origin === PRODUCTION_APP_URL;
    const isProjectPreview = parsed.protocol === "https:"
      && parsed.hostname.startsWith("mgw-gest-")
      && parsed.hostname.endsWith("-warney-fernandes-projects.vercel.app");
    return isProduction || isProjectPreview ? parsed.origin : PRODUCTION_APP_URL;
  } catch {
    return PRODUCTION_APP_URL;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: BASE_HEADERS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const configuredEnvironment = Deno.env.get("MP_ENVIRONMENT");
  if (configuredEnvironment !== "production" && configuredEnvironment !== "test") {
    console.error("[create-mp-subscription] MP_ENVIRONMENT ausente ou inválido; operação bloqueada.");
    return json({ error: "Ambiente do Mercado Pago não configurado." }, 503);
  }
  const mpEnvironment = configuredEnvironment;
  const accessToken = (Deno.env.get(mpEnvironment === "production" ? "MP_ACCESS_TOKEN" : "MP_ACCESS_TOKEN_TEST") || "").trim();
  if (!supabaseUrl || !serviceRoleKey || !accessToken) {
    console.error("[create-mp-subscription] Configuração ausente.");
    return json({ error: "Integração de pagamentos ainda não configurada." }, 503);
  }
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) return json({ error: "Sessão não encontrada. Entre novamente." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    const user = authData?.user;
    if (authError || !user?.id || !user.email || !user.email_confirmed_at) {
      return json({ error: "Sessão inválida ou e-mail não confirmado." }, 401);
    }

    const body = await req.json().catch(() => null) as { tenantId?: unknown } | null;
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
      return json({ error: "Estabelecimento inválido." }, 400);
    }

    const { data: member, error: memberError } = await admin
      .from("tenant_members")
      .select("tenant_id, role, is_founder, active")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();
    if (memberError || !member || member.role !== "owner") {
      return json({ error: "Somente o proprietário pode contratar a assinatura." }, 403);
    }

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("id,status,billing_exempt,is_founder_account,billing_suspended")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantError || !tenant || !["active", "suspended"].includes(tenant.status)) {
      return json({ error: "Estabelecimento não está disponível para contratação." }, 403);
    }
    if (tenant.billing_exempt || tenant.is_founder_account || member.is_founder) {
      return json({ error: "A conta fundadora é isenta de cobrança." }, 409);
    }

    const { data: plan, error: planError } = await admin
      .from("plans")
      .select("code,amount_cents,currency,billing_interval,active")
      .eq("code", "mgw_mensal_49")
      .eq("active", true)
      .maybeSingle();
    if (planError || !plan || plan.amount_cents !== 4990 || plan.currency !== "BRL" || plan.billing_interval !== "monthly") {
      console.error("[create-mp-subscription] Plano comercial ausente ou inválido.");
      return json({ error: "Plano mensal do MGW não está configurado corretamente." }, 503);
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("id,status,trial_ends_at,mp_preapproval_id,mp_init_point,plan_amount_cents,currency,updated_at,mp_environment,retention_status")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (subscriptionError || !subscription) {
      return json({ error: "Assinatura do estabelecimento não encontrada." }, 404);
    }
    const recoverableStatuses = ["expired", "cancelled", "paused", "past_due", "suspended", "pending"];
    if (tenant.status === "suspended" && (
      tenant.billing_suspended !== true ||
      !recoverableStatuses.includes(subscription.status) ||
      !["none", "active_retention"].includes(subscription.retention_status || "none")
    )) {
      return json({ error: "Este estabelecimento está suspenso administrativamente e não pode ser reativado pelo checkout." }, 403);
    }
    if (
      subscription.mp_preapproval_id &&
      subscription.mp_init_point &&
      subscription.mp_environment === mpEnvironment &&
      !["cancelled", "expired", "suspended"].includes(subscription.status)
    ) {
      return json({ checkoutUrl: subscription.mp_init_point, reused: true, environment: mpEnvironment });
    }
    if (subscription.status === "authorized" || subscription.status === "exempt") {
      return json({ error: "Este estabelecimento já possui uma assinatura ativa." }, 409);
    }
    const externalReference = tenantId;
    const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(mpEnvironment === "test" ? { "X-scope": "stage" } : {}),
        "X-Idempotency-Key": `mgw-sub-${tenantId}-${subscription.updated_at || subscription.id}`,
      },
      body: JSON.stringify({
        reason: "MGW Gestão SaaS — plano mensal",
        external_reference: externalReference,
        payer_email: user.email,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 49.90,
          currency_id: "BRL",
        },
        back_url: `${getReturnUrl(req)}/?billing=return`,
        notification_url: `${supabaseUrl}/functions/v1/mp-webhook`,
        status: "pending",
      }),
    });

    const mpData = await mpResponse.json().catch(() => ({}));
    const checkoutUrl = mpEnvironment === "test"
      ? (typeof mpData.sandbox_init_point === "string" ? mpData.sandbox_init_point : mpData.init_point)
      : mpData.init_point;
    if (!mpResponse.ok || typeof mpData.id !== "string" || typeof checkoutUrl !== "string" || String(mpData.external_reference || "") !== tenantId) {
      console.error("[create-mp-subscription] Mercado Pago recusou a criação:", mpResponse.status, mpData?.message || "sem mensagem");
      return json({ error: "Não foi possível gerar o checkout. Tente novamente mais tarde." }, 502);
    }

    const trialStillActive = subscription.status === "trialing"
      && Boolean(subscription.trial_ends_at)
      && Date.parse(subscription.trial_ends_at) > Date.now();
    const nextStatus = trialStillActive ? "trialing" : "pending";

    const { error: updateError } = await admin
      .from("subscriptions")
      .update({
        plan_code: plan.code,
        plan_amount_cents: plan.amount_cents,
        currency: plan.currency,
        mp_preapproval_id: mpData.id,
        mp_payer_email: user.email,
        mp_init_point: checkoutUrl,
        mp_environment: mpEnvironment,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);
    if (updateError) {
      console.error("[create-mp-subscription] Não foi possível salvar a assinatura:", updateError.message);
      return json({ error: "Checkout criado, mas não foi possível salvar o vínculo. Contate o suporte antes de tentar novamente." }, 500);
    }

    return json({ checkoutUrl, subscriptionId: mpData.id, reused: false, environment: mpEnvironment });
  } catch (error) {
    console.error("[create-mp-subscription] Erro inesperado:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Erro interno ao preparar a assinatura." }, 500);
  }
});
