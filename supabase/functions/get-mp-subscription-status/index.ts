// @ts-expect-error Deno Edge Runtime types are provided by Supabase during function deployment.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Serviço indisponível." }, 503);

  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) return json({ error: "Sessão não encontrada." }, 401);

  try {
    const body = await req.json().catch(() => null) as { tenantId?: unknown } | null;
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
      return json({ error: "Estabelecimento inválido." }, 400);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    const user = authData?.user;
    if (authError || !user?.id) return json({ error: "Sessão inválida." }, 401);

    const { data: member, error: memberError } = await admin.from("tenant_members")
      .select("role,active").eq("tenant_id", tenantId).eq("user_id", user.id).eq("active", true).maybeSingle();
    if (memberError || !member || member.role !== "owner") return json({ error: "Apenas o proprietário pode consultar a cobrança." }, 403);

    const { data: subscription, error } = await admin.from("subscriptions")
      .select("id,status,trial_ends_at,current_period_end,grace_until,cancelled_at,mp_preapproval_id,plan_amount_cents,currency,mp_environment")
      .eq("tenant_id", tenantId).maybeSingle();
    if (error || !subscription) return json({ error: "Assinatura não encontrada." }, 404);

    // A legacy recurring preapproval may coexist with a completed one-off Pix
    // payment (for example when the customer opened both checkout options).
    // If the latest successful payment is Pix, cancel that old recurring agreement.
    if (subscription.status === "authorized" && subscription.mp_preapproval_id) {
      const { data: latestApproved } = await admin.from("platform_payments")
        .select("payment_method,status").eq("tenant_id", tenantId).eq("status", "approved")
        .order("paid_at", { ascending: false }).limit(1).maybeSingle();
      if (latestApproved?.payment_method === "pix") {
        const environment = subscription.mp_environment || "production";
        const token = (Deno.env.get(environment === "test" ? "MP_ACCESS_TOKEN_TEST" : "MP_ACCESS_TOKEN") || "").trim();
        if (token) {
          const url = "https://api.mercadopago.com/preapproval/" + encodeURIComponent(subscription.mp_preapproval_id);
          const providerResponse = await fetch(url, { headers: { "Authorization": "Bearer " + token, ...(environment === "test" ? { "X-scope": "stage" } : {}) } });
          const provider = await providerResponse.json().catch(() => ({}));
          if (providerResponse.ok && String(provider.external_reference || "") === tenantId) {
            if (!["cancelled", "canceled"].includes(String(provider.status || "").toLowerCase())) {
              const cancelResponse = await fetch(url, {
                method: "PUT",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", ...(environment === "test" ? { "X-scope": "stage" } : {}) },
                body: JSON.stringify({ status: "canceled" })
              });
              const cancelled = await cancelResponse.json().catch(() => ({}));
              if (!cancelResponse.ok || String(cancelled.id || "") !== subscription.mp_preapproval_id || !["cancelled", "canceled"].includes(String(cancelled.status || "").toLowerCase())) {
                console.error("[get-mp-subscription-status] Falha ao cancelar autorização recorrente antiga:", cancelResponse.status);
              } else {
                await admin.from("subscriptions").update({ mp_preapproval_id: null, mp_init_point: null, updated_at: new Date().toISOString() })
                  .eq("id", subscription.id).eq("mp_preapproval_id", subscription.mp_preapproval_id);
                subscription.mp_preapproval_id = null;
              }
            } else {
              await admin.from("subscriptions").update({ mp_preapproval_id: null, mp_init_point: null, updated_at: new Date().toISOString() })
                .eq("id", subscription.id).eq("mp_preapproval_id", subscription.mp_preapproval_id);
              subscription.mp_preapproval_id = null;
            }
          } else {
            console.error("[get-mp-subscription-status] Não foi possível validar a autorização recorrente antiga; mantendo vínculo.");
          }
        }
      }
    }

    // Reconcile pending Pix payments on status checks as a recovery path if the
    // provider webhook was delayed or previously rejected. The provider API is
    // authoritative; never trust browser state or webhook payload for activation.
    if (!["authorized", "exempt"].includes(subscription.status)) {
      const { data: pendingPayments } = await admin.from("platform_payments")
        .select("id,mp_payment_id,amount_cents,currency")
        .eq("tenant_id", tenantId).eq("payment_method", "pix").eq("status", "pending")
        .order("created_at", { ascending: false }).limit(5);
      for (const pending of pendingPayments || []) {
        const environment = subscription.mp_environment || "production";
        const token = (Deno.env.get(environment === "test" ? "MP_ACCESS_TOKEN_TEST" : "MP_ACCESS_TOKEN") || "").trim();
        if (!token || pending.amount_cents !== subscription.plan_amount_cents || pending.currency !== subscription.currency) continue;
        const response = await fetch("https://api.mercadopago.com/v1/payments/" + encodeURIComponent(pending.mp_payment_id), {
          headers: { "Authorization": "Bearer " + token, ...(environment === "test" ? { "X-scope": "stage" } : {}) },
        });
        if (!response.ok) continue;
        const payment = await response.json().catch(() => ({}));
        if (
          String(payment.id || "") !== pending.mp_payment_id ||
          payment.status !== "approved" ||
          payment.payment_method_id !== "pix" ||
          payment.currency_id !== pending.currency ||
          Math.round(Number(payment.transaction_amount) * 100) !== pending.amount_cents ||
          String(payment.external_reference || "") !== tenantId ||
          typeof payment.live_mode !== "boolean" ||
          payment.live_mode !== (environment === "production")
        ) continue;

        const now = new Date();
        const paidAt = payment.date_approved ? new Date(payment.date_approved) : now;
        const currentEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
        const periodStart = currentEnd && currentEnd.getTime() > paidAt.getTime() ? currentEnd : paidAt;
        const periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        const { error: paymentUpdateError } = await admin.from("platform_payments").update({
          status: "approved",
          paid_at: paidAt.toISOString(),
          failure_reason: "",
          updated_at: now.toISOString(),
        }).eq("id", pending.id).eq("status", "pending");
        if (paymentUpdateError) {
          console.error("[get-mp-subscription-status] Falha ao atualizar pagamento Pix reconciliado:", paymentUpdateError.message);
          break;
        }
        const { error: subscriptionUpdateError } = await admin.from("subscriptions").update({
          status: "authorized",
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          grace_until: null,
          last_event_at: now.toISOString(),
          updated_at: now.toISOString(),
        }).eq("id", subscription.id).neq("status", "authorized");
        if (subscriptionUpdateError) {
          console.error("[get-mp-subscription-status] Falha ao ativar assinatura após reconciliação Pix:", subscriptionUpdateError.message);
          break;
        }
        const { error: tenantUpdateError } = await admin.from("tenants").update({
          status: "active", billing_suspended: false, updated_at: now.toISOString(),
        }).eq("id", tenantId).eq("billing_suspended", true);
        if (tenantUpdateError) {
          console.error("[get-mp-subscription-status] Falha ao restaurar estabelecimento após Pix:", tenantUpdateError.message);
          break;
        }
        subscription.status = "authorized";
        subscription.current_period_end = periodEnd.toISOString();
        subscription.current_period_start = periodStart.toISOString();
        subscription.grace_until = null;
        break;
      }
    }

    return json({
      status: subscription.status,
      trialEndsAt: subscription.trial_ends_at,
      currentPeriodEnd: subscription.current_period_end,
      graceUntil: subscription.grace_until,
      cancelledAt: subscription.cancelled_at,
      checkoutCreated: Boolean(subscription.mp_preapproval_id),
    });
  } catch (error) {
    console.error("[get-mp-subscription-status]", error instanceof Error ? error.message : "unknown");
    return json({ error: "Não foi possível consultar a assinatura." }, 500);
  }
});
