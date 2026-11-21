import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseSignature(value: string): { ts: string; v1: string } | null {
  const parts = Object.fromEntries(value.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, rest.join("=")];
  }));
  return typeof parts.ts === "string" && typeof parts.v1 === "string"
    ? { ts: parts.ts, v1: parts.v1 }
    : null;
}

async function verifySignature(req: Request, resourceId: string, secret: string): Promise<boolean> {
  const signature = parseSignature(req.headers.get("x-signature") || "");
  const requestId = req.headers.get("x-request-id") || "";
  if (!signature || !requestId || !resourceId) return false;
  const timestamp = Number(signature.ts);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;

  const manifest = `id:${resourceId};request-id:${requestId};ts:${signature.ts};`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return safeEqual(expected.toLowerCase(), signature.v1.toLowerCase());
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const accessToken = Deno.env.get("MP_ACCESS_TOKEN_TEST") || "";
  const webhookSecret = Deno.env.get("MP_WEBHOOK_SECRET_TEST") || "";
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error("[mp-webhook] Configuração obrigatória ausente.", { supabaseUrl: Boolean(supabaseUrl), serviceRoleKey: Boolean(serviceRoleKey), webhookSecretPresent: Boolean(webhookSecret) });
    return json({ error: "Webhook not configured" }, 503);
  }

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
    const resourceId = String(data.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    const eventType = String(body.type || url.searchParams.get("type") || body.topic || url.searchParams.get("topic") || "");
    const action = String(body.action || "");
    if (!resourceId || !["subscription_preapproval", "subscription_authorized_payment"].includes(eventType)) {
      return json({ received: true, ignored: true });
    }

    if (!await verifySignature(req, resourceId, webhookSecret)) {
      console.warn("[mp-webhook] Assinatura inválida ou ausente.");
      return json({ error: "Invalid signature" }, 401);
    }

    if (eventType === "subscription_authorized_payment") {
      // Payment notifications are acknowledged here; subscription state is verified from the canonical preapproval resource.
      return json({ received: true, deferred: true });
    }

    if (!accessToken) {
      console.error("[mp-webhook] MP_ACCESS_TOKEN_TEST ausente para consultar a assinatura.");
      return json({ error: "Provider access token not configured" }, 503);
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(resourceId)}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    const mp = await mpResponse.json().catch(() => ({}));
    if (!mpResponse.ok || typeof mp.external_reference !== "string") {
      console.error("[mp-webhook] Não foi possível confirmar a assinatura na API:", mpResponse.status);
      return json({ error: "Could not verify subscription with provider" }, 502);
    }

    const tenantId = mp.external_reference;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
      return json({ error: "Invalid external reference" }, 400);
    }
    const amount = Number(mp.auto_recurring?.transaction_amount);
    const currency = String(mp.auto_recurring?.currency_id || "");
    if (amount !== 49.9 || currency !== "BRL") {
      console.error("[mp-webhook] Valor/moeda divergente; assinatura não atualizada.");
      return json({ error: "Subscription amount mismatch" }, 409);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: current, error: currentError } = await supabase
      .from("subscriptions").select("id,tenant_id,status,trial_ends_at,mp_preapproval_id")
      .eq("tenant_id", tenantId).maybeSingle();
    if (currentError || !current) return json({ error: "MGW subscription not found" }, 404);
    if (current.mp_preapproval_id && current.mp_preapproval_id !== resourceId) {
      return json({ error: "Subscription ID mismatch" }, 409);
    }

    const eventId = `preapproval:${resourceId}:${String(mp.status || "unknown")}:${String(mp.last_modified || mp.date_created || "")}`;
    const { error: eventError } = await supabase.from("mp_webhook_events").insert({
      id: eventId,
      event_type: eventType,
      action: action || null,
      resource_id: resourceId,
      tenant_id: tenantId,
      signature_verified: true,
      processing_status: "received",
      payload: { id: resourceId, status: mp.status, external_reference: tenantId },
    });
    if (eventError && !String(eventError.code || "").includes("23505")) {
      console.error("[mp-webhook] Falha ao registrar evento:", eventError.message);
      return json({ error: "Could not record webhook event" }, 500);
    }
    if (eventError?.code === "23505") return json({ received: true, duplicate: true });

    const now = new Date();
    const statusMap: Record<string, string> = {
      authorized: "authorized",
      pending: "pending",
      paused: "paused",
      cancelled: "cancelled",
      canceled: "cancelled",
    };
    const nextStatus = statusMap[String(mp.status)] || "pending";
    const startDate = mp.date_created ? new Date(mp.date_created) : now;
    const endDate = mp.next_payment_date ? new Date(mp.next_payment_date) : null;
    const graceUntil = nextStatus === "paused"
      ? new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error: updateError } = await supabase.from("subscriptions").update({
      status: nextStatus,
      mp_preapproval_id: resourceId,
      current_period_start: nextStatus === "authorized" ? startDate.toISOString() : null,
      current_period_end: endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : null,
      grace_until: graceUntil,
      ended_at: nextStatus === "cancelled" ? now.toISOString() : null,
      retention_until: nextStatus === "cancelled"
        ? new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString()
        : null,
      last_event_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("tenant_id", tenantId);
    if (updateError) {
      await supabase.from("mp_webhook_events").update({
        processing_status: "failed", error_message: updateError.message, processed_at: now.toISOString(),
      }).eq("id", eventId);
      console.error("[mp-webhook] Falha ao sincronizar assinatura:", updateError.message);
      return json({ error: "Could not synchronize subscription" }, 500);
    }

    await supabase.from("mp_webhook_events").update({
      processing_status: "processed", processed_at: now.toISOString(),
    }).eq("id", eventId);
    return json({ received: true, processed: true });
  } catch (error) {
    console.error("[mp-webhook] Erro inesperado:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Internal webhook error" }, 500);
  }
});
