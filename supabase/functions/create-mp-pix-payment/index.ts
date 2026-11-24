// @ts-expect-error Deno Edge Runtime types are provided by Supabase during function deployment.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const environment = Deno.env.get("MP_ENVIRONMENT");
  if (environment !== "production" && environment !== "test") return json({ error: "Ambiente do Mercado Pago não configurado." }, 503);
  const accessToken = (Deno.env.get(environment === "production" ? "MP_ACCESS_TOKEN" : "MP_ACCESS_TOKEN_TEST") || "").trim();
  if (!supabaseUrl || !serviceRoleKey || !accessToken) return json({ error: "Integração de pagamentos não configurada." }, 503);
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Sessão não encontrada. Entre novamente." }, 401);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    const user = authData?.user;
    if (authError || !user?.id || !user.email || !user.email_confirmed_at) return json({ error: "Sessão inválida ou e-mail não confirmado." }, 401);
    const body = await req.json().catch(() => null) as { tenantId?: unknown } | null;
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) return json({ error: "Estabelecimento inválido." }, 400);
    const { data: member, error: memberError } = await admin.from("tenant_members").select("tenant_id,role,is_founder,active").eq("tenant_id", tenantId).eq("user_id", user.id).eq("active", true).maybeSingle();
    if (memberError || !member || member.role !== "owner") return json({ error: "Somente o proprietário pode contratar." }, 403);
    const { data: tenant, error: tenantError } = await admin.from("tenants").select("id,status,billing_exempt,is_founder_account,billing_suspended").eq("id", tenantId).maybeSingle();
    if (tenantError || !tenant || !["active", "suspended"].includes(tenant.status)) return json({ error: "Estabelecimento indisponível para contratação." }, 403);
    if (tenant.billing_exempt || tenant.is_founder_account || member.is_founder) return json({ error: "A conta fundadora é isenta de cobrança." }, 409);
    const { data: plan, error: planError } = await admin.from("plans").select("code,amount_cents,currency,billing_interval,active").eq("code", "mgw_mensal_49").eq("active", true).maybeSingle();
    if (planError || !plan || !Number.isInteger(plan.amount_cents) || plan.amount_cents <= 0 || plan.currency !== "BRL" || plan.billing_interval !== "monthly") return json({ error: "Plano mensal do MGW não está configurado corretamente." }, 503);
    const { data: subscription, error: subscriptionError } = await admin.from("subscriptions").select("id,status,plan_amount_cents,currency,mp_payer_email,mp_environment,retention_status").eq("tenant_id", tenantId).maybeSingle();
    if (subscriptionError || !subscription) return json({ error: "Assinatura do estabelecimento não encontrada." }, 404);
    const recoverable = ["expired", "cancelled", "paused", "past_due", "suspended", "pending", "trialing"];
    if (tenant.status === "suspended" && (tenant.billing_suspended !== true || !recoverable.includes(subscription.status) || !["none", "active_retention"].includes(subscription.retention_status || "none"))) return json({ error: "Estabelecimento suspenso administrativamente não pode ser reativado pelo checkout." }, 403);
    if (["authorized", "exempt"].includes(subscription.status)) return json({ error: "Este estabelecimento já possui assinatura ativa." }, 409);
    const { data: pendingPayments } = await admin.from("platform_payments")
      .select("id,mp_payment_id,amount_cents,currency,due_at")
      .eq("tenant_id", tenantId).eq("payment_method", "pix").eq("status", "pending")
      .order("created_at", { ascending: false }).limit(20);
    for (const pendingPayment of pendingPayments || []) {
      const pendingResponse = await fetch("https://api.mercadopago.com/v1/payments/" + encodeURIComponent(pendingPayment.mp_payment_id), {
        headers: { "Authorization": "Bearer " + accessToken, ...(environment === "test" ? { "X-scope": "stage" } : {}) }
      });
      const pending = await pendingResponse.json().catch(() => ({}));
      const pendingTx = pending.point_of_interaction?.transaction_data || {};
      const belongsToTenant = pendingResponse.ok && String(pending.external_reference || "") === tenantId;
      const stillPending = belongsToTenant && pending.status === "pending";
      const sameCurrentPrice = pendingPayment.amount_cents === plan.amount_cents && pendingPayment.currency === plan.currency;
      if (stillPending && sameCurrentPrice && pendingTx.qr_code && pendingTx.qr_code_base64 && (!pending.date_of_expiration || Date.parse(pending.date_of_expiration) > Date.now())) {
        return json({ paymentId: String(pending.id), amountCents: plan.amount_cents, currency: plan.currency, qrCode: pendingTx.qr_code, qrCodeBase64: pendingTx.qr_code_base64, ticketUrl: pendingTx.ticket_url || "", expiresAt: pending.date_of_expiration || pendingPayment.due_at, environment, reused: true });
      }
      if (stillPending && !sameCurrentPrice) {
        const cancelResponse = await fetch("https://api.mercadopago.com/v1/payments/" + encodeURIComponent(pendingPayment.mp_payment_id), {
          method: "PUT",
          headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json", ...(environment === "test" ? { "X-scope": "stage" } : {}) },
          body: JSON.stringify({ status: "cancelled" })
        });
        const cancelled = await cancelResponse.json().catch(() => ({}));
        if (cancelResponse.ok && String(cancelled.id || "") === pendingPayment.mp_payment_id && cancelled.status === "cancelled") {
          await admin.from("platform_payments").update({ status: "cancelled", failure_reason: "Cobrança substituída após alteração do preço do plano.", updated_at: new Date().toISOString() })
            .eq("id", pendingPayment.id).eq("status", "pending");
        } else {
          console.error("[create-mp-pix-payment] Não foi possível cancelar cobrança Pix antiga:", pendingPayment.mp_payment_id, cancelResponse.status);
          return json({ error: "Existe uma cobrança Pix anterior ainda pendente. Aguarde a expiração ou tente novamente antes de gerar outra cobrança." }, 409);
        }
      }
    }
    const idempotencyKey = crypto.randomUUID();
    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json", "X-Idempotency-Key": idempotencyKey, ...(environment === "test" ? { "X-scope": "stage" } : {}) },
      body: JSON.stringify({
        transaction_amount: plan.amount_cents / 100,
        description: "MGW Gestão SaaS — plano mensal",
        payment_method_id: "pix",
        payer: { email: user.email },
        external_reference: tenantId,
        notification_url: supabaseUrl + "/functions/v1/mp-webhook",
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        metadata: { tenant_id: tenantId, plan_code: plan.code, idempotency_key: idempotencyKey }
      })
    });
    const payment = await mpResponse.json().catch(() => ({}));
    const tx = payment.point_of_interaction?.transaction_data || {};
    const qrCode = typeof tx.qr_code === "string" ? tx.qr_code : "";
    const qrCodeBase64 = typeof tx.qr_code_base64 === "string" ? tx.qr_code_base64 : "";
    const ticketUrl = typeof tx.ticket_url === "string" ? tx.ticket_url : "";
    if (!mpResponse.ok || !payment.id || !qrCode || !qrCodeBase64 || String(payment.external_reference || "") !== tenantId) {
      console.error("[create-mp-pix-payment] Mercado Pago recusou a cobrança:", mpResponse.status, payment?.message || "sem mensagem");
      return json({ error: "Não foi possível gerar o Pix. Tente novamente." }, 502);
    }
    const now = new Date().toISOString();
    const { error: updateError } = await admin.from("subscriptions").update({
      plan_code: plan.code, plan_amount_cents: plan.amount_cents, currency: plan.currency,
      mp_payer_email: user.email, mp_environment: environment,
      status: subscription.status === "trialing" ? "trialing" : "pending", updated_at: now
    }).eq("tenant_id", tenantId);
    if (updateError) return json({ error: "Pix criado, mas não foi possível vincular a cobrança à assinatura. Contate o suporte." }, 500);
    const { error: ledgerError } = await admin.from("platform_payments").upsert({
      tenant_id: tenantId, subscription_id: subscription.id, provider: "mercadopago",
      mp_payment_id: String(payment.id), mp_preapproval_id: null, amount_cents: plan.amount_cents,
      currency: plan.currency, status: String(payment.status || "pending"), payment_method: "pix",
      payer_email: user.email, due_at: payment.date_of_expiration || null, updated_at: now
    }, { onConflict: "mp_payment_id" });
    if (ledgerError) return json({ error: "Pix criado, mas não foi possível registrar a cobrança. Contate o suporte." }, 500);
    return json({ paymentId: String(payment.id), amountCents: plan.amount_cents, currency: plan.currency, qrCode, qrCodeBase64, ticketUrl, expiresAt: payment.date_of_expiration || null, environment });
  } catch (error) {
    console.error("[create-mp-pix-payment] Erro inesperado:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Erro interno ao preparar o Pix." }, 500);
  }
});
