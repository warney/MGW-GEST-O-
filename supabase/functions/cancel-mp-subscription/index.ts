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
  const configuredEnvironment = Deno.env.get("MP_ENVIRONMENT");
  if (configuredEnvironment !== "production" && configuredEnvironment !== "test") {
    console.error("[cancel-mp-subscription] MP_ENVIRONMENT ausente ou inválido; operação bloqueada.");
    return json({ error: "Ambiente do Mercado Pago não configurado." }, 503);
  }
  const mpEnvironment = configuredEnvironment;
  const accessToken = (Deno.env.get(mpEnvironment === "production" ? "MP_ACCESS_TOKEN" : "MP_ACCESS_TOKEN_TEST") || "").trim();
  if (!supabaseUrl || !serviceRoleKey || !accessToken) return json({ error: "Integração de cobrança não configurada." }, 503);

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
    if (memberError || !member || member.role !== "owner") return json({ error: "Apenas o proprietário pode cancelar a assinatura." }, 403);

    const { data: subscription, error: subError } = await admin.from("subscriptions")
      .select("id,status,mp_preapproval_id,current_period_end,mp_environment").eq("tenant_id", tenantId).maybeSingle();
    if (subError || !subscription) return json({ error: "Assinatura não encontrada." }, 404);
    if (!subscription.mp_preapproval_id) return json({ error: "Não há assinatura Mercado Pago para cancelar." }, 409);
    if (subscription.mp_environment !== mpEnvironment) return json({ error: "A assinatura pertence a outro ambiente do Mercado Pago." }, 409);
    if (subscription.status === "cancelled") return json({ cancelled: true, currentPeriodEnd: subscription.current_period_end });

    const providerResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscription.mp_preapproval_id)}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(mpEnvironment === "test" ? { "X-scope": "stage" } : {}),
      },
      body: JSON.stringify({ status: "canceled" }),
    });
    const providerData = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok || !["cancelled", "canceled"].includes(String(providerData.status || "").toLowerCase())) {
      console.error("[cancel-mp-subscription] Mercado Pago recusou cancelamento:", providerResponse.status);
      return json({ error: "O Mercado Pago não confirmou o cancelamento. Tente novamente." }, 502);
    }

    const now = new Date();
    const providerEnd = providerData.next_payment_date ? new Date(providerData.next_payment_date) : null;
    const existingEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
    const paidThrough = providerEnd && !Number.isNaN(providerEnd.getTime()) ? providerEnd : existingEnd;
    const { error: updateError } = await admin.from("subscriptions").update({
      status: "cancelled",
      cancelled_at: now.toISOString(),
      current_period_end: paidThrough && !Number.isNaN(paidThrough.getTime()) ? paidThrough.toISOString() : null,
      ended_at: paidThrough && paidThrough.getTime() > now.getTime() ? paidThrough.toISOString() : now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("id", subscription.id);
    if (updateError) {
      console.error("[cancel-mp-subscription] Falha ao salvar cancelamento:", updateError.message);
      return json({ error: "O Mercado Pago cancelou, mas o MGW não conseguiu registrar. Contate o suporte." }, 500);
    }
    return json({ cancelled: true, currentPeriodEnd: paidThrough?.toISOString() || null });
  } catch (error) {
    console.error("[cancel-mp-subscription]", error instanceof Error ? error.message : "unknown");
    return json({ error: "Não foi possível cancelar a assinatura." }, 500);
  }
});
