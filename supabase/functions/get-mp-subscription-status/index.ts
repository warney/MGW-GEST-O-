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
      .select("status,trial_ends_at,current_period_end,grace_until,cancelled_at,mp_preapproval_id")
      .eq("tenant_id", tenantId).maybeSingle();
    if (error || !subscription) return json({ error: "Assinatura não encontrada." }, 404);

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
