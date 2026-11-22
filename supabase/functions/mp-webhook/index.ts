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
  const rawSignature = req.headers.get("x-signature") || "";
  const signature = parseSignature(rawSignature);
  const requestId = req.headers.get("x-request-id") || "";
  if (!signature || !requestId || !resourceId) {
    console.warn("[mp-webhook] Cabeçalho de assinatura incompleto.", {
      xSignaturePresent: Boolean(rawSignature),
      xRequestIdPresent: Boolean(requestId),
      resourceIdPresent: Boolean(resourceId),
    });
    return false;
  }
  const timestamp = Number(signature.ts);
  // Mercado Pago integrations may expose ts in seconds or milliseconds.
  const timestampMs = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    console.warn("[mp-webhook] Timestamp da assinatura inválido ou expirado.", {
      timestampPresent: Boolean(signature.ts),
      timestampUnit: timestamp < 1_000_000_000_000 ? "seconds" : "milliseconds",
    });
    return false;
  }

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
  const accessToken = (Deno.env.get("MP_ACCESS_TOKEN_TEST") || "").trim();
  const webhookSecret = (Deno.env.get("MP_WEBHOOK_SECRET_TEST") || "").trim();
  if (!supabaseUrl || !serviceRoleKey || !accessToken) {
    console.error("[mp-webhook] Configuração obrigatória ausente.", {
      supabaseUrl: Boolean(supabaseUrl),
      serviceRoleKey: Boolean(serviceRoleKey),
      accessTokenPresent: Boolean(accessToken),
    });
    return json({ error: "Webhook not configured" }, 503);
  }

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
    const resourceId = String(data.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    const eventType = String(body.type || url.searchParams.get("type") || body.topic || url.searchParams.get("topic") || "");
    const action = String(body.action || "");
    if (!resourceId || !["subscription_preapproval", "subscription_preapproval_plan", "subscription_authorized_payment"].includes(eventType)) {
      return json({ received: true, ignored: true });
    }

    if (eventType === "subscription_preapproval_plan") {
      if (!webhookSecret) return json({ error: "Webhook signature secret is not configured" }, 503);
      const valid = await verifySignature(req, resourceId, webhookSecret);
      if (!valid) return json({ error: "Invalid signature" }, 401);
      const planResponse = await fetch(
        `https://api.mercadopago.com/preapproval_plan/${encodeURIComponent(resourceId)}`,
        { headers: { "Authorization": `Bearer ${accessToken}`, "X-scope": "stage" } },
      );
      const plan = await planResponse.json().catch(() => ({}));
      if (!planResponse.ok || typeof plan.external_reference !== "string") {
        return json({ error: "Could not verify subscription plan" }, 502);
      }
      const tenantId = plan.external_reference;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
        return json({ error: "Invalid plan external reference" }, 400);
      }
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const eventId = `plan:${resourceId}:${String(plan.last_modified || plan.date_created || "unknown")}`;
      const now = new Date().toISOString();
      const { error: eventError } = await supabase.from("mp_webhook_events").insert({
        id: eventId,
        event_type: eventType,
        action: action || null,
        resource_id: resourceId,
        tenant_id: tenantId,
        signature_verified: true,
        processing_status: "processed",
        payload: { id: resourceId, status: plan.status, external_reference: tenantId },
        processed_at: now,
      });
      if (eventError?.code === "23505") return json({ received: true, duplicate: true });
      if (eventError) return json({ error: "Could not record plan event" }, 500);
      return json({ received: true, processed: true, planEvent: true });
    }

    // Mercado Pago's dashboard simulator sends this fixed sample preapproval ID.
    // Acknowledge this exact synthetic event without provider lookup or any DB mutation.
    // This exception cannot authorize, activate, pause, or cancel a real tenant subscription.
    if (resourceId === "123456" && eventType === "subscription_preapproval" && action === "updated") {
      console.info("[mp-webhook] Simulação do painel recebida e confirmada; nenhum dado de assinatura foi alterado.");
      return json({ received: true, simulated: true, ignored: true });
    }

    // Reconcile recurring invoices using Mercado Pago's canonical invoice endpoint.
    if (eventType === "subscription_authorized_payment") {
      if (!webhookSecret) return json({ error: "Webhook signature secret is not configured" }, 503);
      const valid = await verifySignature(req, resourceId, webhookSecret);
      if (!valid) return json({ error: "Invalid signature" }, 401);

      const invoiceResponse = await fetch(
        `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(resourceId)}`,
        { headers: { "Authorization": `Bearer ${accessToken}`, "X-scope": "stage" } },
      );
      const invoice = await invoiceResponse.json().catch(() => ({}));
      if (!invoiceResponse.ok || !invoice.preapproval_id || !invoice.external_reference) {
        console.error("[mp-webhook] Não foi possível validar a fatura:", invoiceResponse.status);
        return json({ error: "Could not verify invoice with provider" }, 502);
      }

      const tenantId = String(invoice.external_reference);
      const preapprovalId = String(invoice.preapproval_id);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
        return json({ error: "Invalid invoice external reference" }, 400);
      }
      if (Number(invoice.transaction_amount) !== 49.9 || String(invoice.currency_id) !== "BRL") {
        return json({ error: "Invoice amount mismatch" }, 409);
      }

      const preapprovalResponse = await fetch(
        `https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`,
        { headers: { "Authorization": `Bearer ${accessToken}`, "X-scope": "stage" } },
      );
      const preapproval = await preapprovalResponse.json().catch(() => ({}));
      if (
        !preapprovalResponse.ok ||
        String(preapproval.external_reference) !== tenantId ||
        Number(preapproval.auto_recurring?.transaction_amount) !== 49.9 ||
        String(preapproval.auto_recurring?.currency_id) !== "BRL"
      ) {
        return json({ error: "Invoice subscription could not be verified" }, 409);
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: current, error: currentError } = await supabase
        .from("subscriptions")
        .select("id,tenant_id,status,mp_preapproval_id")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (currentError || !current) return json({ error: "MGW subscription not found" }, 404);
      if (current.mp_preapproval_id !== preapprovalId) {
        return json({ error: "Invoice subscription ID mismatch" }, 409);
      }

      const invoiceStatus = String(invoice.payment?.status || invoice.summarized || invoice.status || "pending");
      const eventId = `invoice:${resourceId}:${String(invoice.last_modified || invoiceStatus)}`;
      const now = new Date();
      const { error: eventError } = await supabase.from("mp_webhook_events").insert({
        id: eventId,
        event_type: eventType,
        action: action || null,
        resource_id: resourceId,
        tenant_id: tenantId,
        signature_verified: true,
        processing_status: "received",
        payload: {
          id: resourceId,
          preapproval_id: preapprovalId,
          status: invoice.status || null,
          summarized: invoice.summarized || null,
          payment_status: invoice.payment?.status || null,
        },
      });
      if (eventError?.code === "23505") return json({ received: true, duplicate: true });
      if (eventError) {
        console.error("[mp-webhook] Falha ao registrar fatura:", eventError.message);
        return json({ error: "Could not record invoice event" }, 500);
      }

      let updateError = null;
      if (invoiceStatus === "approved") {
        const startDate = invoice.debit_date || invoice.date_created || now.toISOString();
        const nextDate = preapproval.next_payment_date ? new Date(preapproval.next_payment_date) : null;
        const update = await supabase.from("subscriptions").update({
          status: "authorized",
          current_period_start: startDate,
          current_period_end: nextDate && !Number.isNaN(nextDate.getTime()) ? nextDate.toISOString() : null,
          grace_until: null,
          ended_at: null,
          retention_until: null,
          last_event_at: now.toISOString(),
          updated_at: now.toISOString(),
        }).eq("tenant_id", tenantId);
        updateError = update.error;
      } else if (["rejected", "cancelled", "canceled"].includes(invoiceStatus)) {
        // Keep access during the configured retry/grace window; do not cancel
        // the recurring authorization based on a single failed collection.
        const update = await supabase.from("subscriptions").update({
          grace_until: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          last_event_at: now.toISOString(),
          updated_at: now.toISOString(),
        }).eq("tenant_id", tenantId);
        updateError = update.error;
      }

      if (updateError) {
        await supabase.from("mp_webhook_events").update({
          processing_status: "failed",
          error_message: updateError.message,
          processed_at: now.toISOString(),
        }).eq("id", eventId);
        return json({ error: "Could not reconcile invoice" }, 500);
      }
      await supabase.from("mp_webhook_events").update({
        processing_status: "processed",
        processed_at: now.toISOString(),
      }).eq("id", eventId);
      return json({ received: true, processed: true, invoiceStatus });
    }

    // Subscription integrations must set notification_url on each preapproval.
    // The dashboard-level Webhooks configuration is not the supported setup path for Subscriptions.
    // Prefer HMAC when available; for test mode also require a canonical resource lookup before
    // any database mutation, so simulator payloads cannot activate a tenant.
    if (!webhookSecret) {
      console.error("[mp-webhook] Segredo de assinatura não configurado.");
      return json({ error: "Webhook signature secret is not configured" }, 503);
    }
    const signatureValid = await verifySignature(req, resourceId, webhookSecret);
    if (!signatureValid) {
      console.warn("[mp-webhook] Assinatura inválida; notificação recusada.");
      return json({ error: "Invalid signature" }, 401);
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(resourceId)}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "X-scope": "stage",
      },
    });
    const mp = await mpResponse.json().catch(() => ({}));
    if (!mpResponse.ok || typeof mp.external_reference !== "string") {
      // The Mercado Pago dashboard simulator uses fixed sample IDs (for example 123456).
      // A missing test resource is acknowledged, but never changes tenant billing state.
      if (body.live_mode === false && !mpResponse.ok) {
        console.info("[mp-webhook] Simulação recebida; ID de exemplo não existe na API. Nenhuma assinatura foi alterada.");
        return json({ received: true, simulated: true, ignored: true });
      }
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
