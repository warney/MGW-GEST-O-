// @ts-expect-error Deno Edge Runtime types are provided by Supabase during function deployment.
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
    if (!resourceId || !["subscription_preapproval", "subscription_authorized_payment"].includes(eventType)) {
      return json({ received: true, ignored: true });
    }

    // Mercado Pago's dashboard simulator sends this fixed sample preapproval ID.
    // Acknowledge this exact synthetic event without provider lookup or any DB mutation.
    // This exception cannot authorize, activate, pause, or cancel a real tenant subscription.
    if (resourceId === "123456" && eventType === "subscription_preapproval" && action === "updated") {
      console.info("[mp-webhook] Simulação do painel recebida e confirmada; nenhum dado de assinatura foi alterado.");
      return json({ received: true, simulated: true, ignored: true });
    }

    if (eventType === "subscription_authorized_payment") {
      if (!webhookSecret) {
        console.error("[mp-webhook] MP_WEBHOOK_SECRET_TEST ausente; evento recusado.");
        return json({ error: "Webhook secret not configured" }, 503);
      }
      const signatureValid = await verifySignature(req, resourceId, webhookSecret);
      if (!signatureValid) return json({ error: "Invalid signature" }, 401);

      const paymentResponse = await fetch(
        `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(resourceId)}`,
        { headers: { "Authorization": `Bearer ${accessToken}`, "X-scope": "stage" } },
      );
      const authorized = await paymentResponse.json().catch(() => ({}));
      if (!paymentResponse.ok || String(authorized.id || "") !== resourceId) {
        console.error("[mp-webhook] Não foi possível confirmar a fatura na API:", paymentResponse.status);
        return json({ error: "Could not verify authorized payment" }, 502);
      }

      const preapprovalId = String(authorized.preapproval_id || "");
      const amount = Number(authorized.transaction_amount);
      const currency = String(authorized.currency_id || "");
      if (!preapprovalId || !Number.isFinite(amount) || amount <= 0 || currency !== "BRL") {
        return json({ error: "Invalid authorized payment data" }, 422);
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: subscription, error: subscriptionError } = await supabase
        .from("subscriptions")
        .select("id,tenant_id,status,plan_amount_cents,currency,mp_preapproval_id,mp_payer_email")
        .eq("mp_preapproval_id", preapprovalId)
        .maybeSingle();
      if (subscriptionError || !subscription) {
        console.error("[mp-webhook] Assinatura não localizada para a fatura.");
        return json({ error: "Subscription not found for invoice" }, 404);
      }
      if (Math.round(amount * 100) !== subscription.plan_amount_cents || currency !== subscription.currency) {
        console.error("[mp-webhook] Valor/moeda da fatura diverge do plano contratado.");
        return json({ error: "Invoice amount mismatch" }, 409);
      }

      const rawStatus = String(authorized.status || "").toLowerCase();
      const paymentStatus: Record<string, string> = {
        approved: "approved",
        pending: "pending",
        rejected: "rejected",
        refunded: "refunded",
        cancelled: "cancelled",
        canceled: "cancelled",
        in_process: "in_process",
      };
      const normalizedStatus = paymentStatus[rawStatus] || "pending";
      const now = new Date();
      const paymentObject = authorized.payment && typeof authorized.payment === "object"
        ? authorized.payment as Record<string, unknown>
        : {};
      const payerObject = paymentObject.payer && typeof paymentObject.payer === "object"
        ? paymentObject.payer as Record<string, unknown>
        : {};
      const mpPaymentId = String(paymentObject.id || authorized.id);
      const paidAtValue = authorized.date_approved || authorized.date_last_updated || null;
      const paidAt = normalizedStatus === "approved" && paidAtValue
        ? new Date(String(paidAtValue))
        : null;
      const dueAtValue = authorized.debit_date || authorized.date_of_expiration || null;
      const dueAt = dueAtValue ? new Date(String(dueAtValue)) : null;
      const eventId = `authorized_payment:${resourceId}:${rawStatus}:${String(authorized.last_modified || authorized.date_created || "")}`;

      const { error: eventError } = await supabase.from("mp_webhook_events").upsert({
        id: eventId,
        event_type: eventType,
        action: action || null,
        resource_id: resourceId,
        tenant_id: subscription.tenant_id,
        signature_verified: true,
        processing_status: "received",
        payload: { id: resourceId, status: normalizedStatus, preapproval_id: preapprovalId },
      }, { onConflict: "id" });
      if (eventError) {
        console.error("[mp-webhook] Falha ao registrar evento financeiro:", eventError.message);
        return json({ error: "Could not record webhook event" }, 500);
      }

      const { error: paymentError } = await supabase.from("platform_payments").upsert({
        tenant_id: subscription.tenant_id,
        subscription_id: subscription.id,
        provider: "mercadopago",
        mp_payment_id: mpPaymentId,
        mp_preapproval_id: preapprovalId,
        amount_cents: Math.round(amount * 100),
        currency,
        status: normalizedStatus,
        payment_method: String(paymentObject.payment_method_id || paymentObject.payment_type_id || authorized.payment_method_id || ""),
        payer_email: String(payerObject.email || authorized.payer_email || subscription.mp_payer_email || ""),
        failure_reason: normalizedStatus === "rejected" ? String(authorized.reason || authorized.status_detail || "Pagamento recusado") : "",
        paid_at: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt.toISOString() : null,
        due_at: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt.toISOString() : null,
        updated_at: now.toISOString(),
      }, { onConflict: "mp_payment_id" });
      if (paymentError) {
        await supabase.from("mp_webhook_events").update({
          processing_status: "failed",
          error_message: paymentError.message,
          processed_at: now.toISOString(),
        }).eq("id", eventId);
        console.error("[mp-webhook] Falha ao atualizar ledger:", paymentError.message);
        return json({ error: "Could not reconcile payment" }, 500);
      }

      await supabase.from("mp_webhook_events").update({
        processing_status: "processed",
        processed_at: now.toISOString(),
      }).eq("id", eventId);
      return json({ received: true, processed: true, paymentStatus: normalizedStatus });
    }

    // Subscription integrations must set notification_url on each preapproval.
    // The dashboard-level Webhooks configuration is not the supported setup path for Subscriptions.
    // Prefer HMAC when available; for test mode also require a canonical resource lookup before
    // any database mutation, so simulator payloads cannot activate a tenant.
    if (!webhookSecret) {
      console.error("[mp-webhook] MP_WEBHOOK_SECRET_TEST ausente; notificação recusada.");
      return json({ error: "Webhook secret not configured" }, 503);
    }
    const signatureValid = await verifySignature(req, resourceId, webhookSecret);
    if (!signatureValid) return json({ error: "Invalid signature" }, 401);

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
    // Upsert allows retries to recover events previously marked failed/received.
    // Reapplying a verified provider snapshot is idempotent for this subscription row.
    const { error: eventError } = await supabase.from("mp_webhook_events").upsert({
      id: eventId,
      event_type: eventType,
      action: action || null,
      resource_id: resourceId,
      tenant_id: tenantId,
      signature_verified: true,
      processing_status: "received",
      error_message: null,
      processed_at: null,
      payload: { id: resourceId, status: mp.status, external_reference: tenantId },
    }, { onConflict: "id" });
    if (eventError) {
      console.error("[mp-webhook] Falha ao registrar evento:", eventError.message);
      return json({ error: "Could not record webhook event" }, 500);
    }

    const now = new Date();
    const statusMap: Record<string, string> = {
      authorized: "authorized",
      pending: "pending",
      paused: "paused",
      cancelled: "cancelled",
      canceled: "cancelled",
    };
    const providerStatus = String(mp.status || "").toLowerCase();
    const nextStatus = statusMap[providerStatus];
    if (!nextStatus) {
      await supabase.from("mp_webhook_events").update({
        processing_status: "failed",
        error_message: `Status de assinatura não reconhecido: ${providerStatus || "vazio"}`,
        processed_at: new Date().toISOString(),
      }).eq("id", eventId);
      return json({ error: "Unsupported subscription status" }, 422);
    }
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
      cancelled_at: nextStatus === "cancelled" ? now.toISOString() : null,
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
