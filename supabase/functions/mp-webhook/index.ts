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
  const productionToken = (Deno.env.get("MP_ACCESS_TOKEN") || "").trim();
  const testToken = (Deno.env.get("MP_ACCESS_TOKEN_TEST") || "").trim();
  const productionSecret = (Deno.env.get("MP_WEBHOOK_SECRET") || "").trim();
  const testSecret = (Deno.env.get("MP_WEBHOOK_SECRET_TEST") || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[mp-webhook] Configuração Supabase obrigatória ausente.");
    return json({ error: "Webhook not configured" }, 503);
  }

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
    const resourceId = String(data.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    const eventType = String(body.type || url.searchParams.get("type") || body.topic || url.searchParams.get("topic") || "");
    const action = String(body.action || "");
    if (!resourceId || !["subscription_preapproval", "subscription_authorized_payment", "payment"].includes(eventType)) {
      return json({ received: true, ignored: true });
    }

    // Mercado Pago's dashboard simulator sends this fixed sample preapproval ID.
    // Acknowledge this exact synthetic event without provider lookup or any DB mutation.
    // This exception cannot authorize, activate, pause, or cancel a real tenant subscription.
    if (resourceId === "123456" && eventType === "subscription_preapproval" && action === "updated") {
      console.info("[mp-webhook] Simulação do painel recebida e confirmada; nenhum dado de assinatura foi alterado.");
      return json({ received: true, simulated: true, ignored: true });
    }

    // Identify the environment by validating the HMAC against each configured secret.
    // MP_ENVIRONMENT controls new checkout creation only; it must not disable callbacks
    // for subscriptions created earlier in the other environment.
    const productionSignatureValid = productionSecret
      ? await verifySignature(req, resourceId, productionSecret)
      : false;
    const testSignatureValid = testSecret
      ? await verifySignature(req, resourceId, testSecret)
      : false;

    // Pix payment notifications can be authenticated by a canonical provider lookup
    // when Mercado Pago does not deliver a usable HMAC header. This fallback is
    // limited to "payment" events: no subscription/preapproval mutation is allowed
    // without a valid HMAC. The payment branch below still validates live_mode,
    // payment ID, Pix method, tenant external_reference, amount and currency against
    // Mercado Pago's API before writing anything.
    let mpEnvironment: "production" | "test";
    if (productionSignatureValid !== testSignatureValid) {
      mpEnvironment = productionSignatureValid ? "production" : "test";
      if (typeof body.live_mode !== "boolean" || body.live_mode !== (mpEnvironment === "production")) {
        console.warn("[mp-webhook] live_mode incompatível com o segredo que validou a assinatura.");
        return json({ error: "Webhook environment mismatch" }, 409);
      }
    } else if (eventType === "payment" && typeof body.live_mode === "boolean") {
      mpEnvironment = body.live_mode ? "production" : "test";
      console.warn("[mp-webhook] Evento Pix sem HMAC válido; exigindo validação canônica na API do Mercado Pago.");
    } else {
      console.warn("[mp-webhook] Assinatura ausente, inválida ou ambígua; evento recusado.");
      return json({ error: "Invalid signature" }, 401);
    }
    const accessToken = mpEnvironment === "production" ? productionToken : testToken;
    if (!accessToken) {
      console.error("[mp-webhook] Access Token ausente para o ambiente validado.");
      return json({ error: "Webhook access token not configured" }, 503);
    }

    if (eventType === "payment") {
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(resourceId)}`, {
        headers: { "Authorization": `Bearer ${accessToken}`, ...(mpEnvironment === "test" ? { "X-scope": "stage" } : {}) },
      });
      const payment = await paymentResponse.json().catch(() => ({}));
      if (!paymentResponse.ok || String(payment.id || "") !== resourceId) return json({ error: "Could not verify Pix payment" }, 502);
      if (typeof payment.live_mode !== "boolean" || payment.live_mode !== (mpEnvironment === "production")) {
        return json({ error: "Pix payment environment mismatch" }, 409);
      }
      const tenantId = String(payment.external_reference || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) return json({ error: "Invalid Pix external reference" }, 400);
      if (String(payment.payment_method_id || "") !== "pix") return json({ received: true, ignored: true });
      const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: subscription, error: subscriptionError } = await supabase.from("subscriptions")
        .select("id,tenant_id,status,plan_amount_cents,currency,mp_payer_email,current_period_start,current_period_end,mp_environment,mp_preapproval_id")
        .eq("tenant_id", tenantId).maybeSingle();
      if (subscriptionError || !subscription) return json({ error: "MGW subscription not found" }, 404);
      if (subscription.mp_environment !== mpEnvironment) return json({ error: "Subscription environment mismatch" }, 409);
      const amountCents = Math.round(Number(payment.transaction_amount) * 100);
      if (!Number.isInteger(amountCents) || amountCents !== subscription.plan_amount_cents || String(payment.currency_id || "") !== subscription.currency) {
        console.error("[mp-webhook] Valor Pix divergente do valor registrado para a assinatura.");
        return json({ error: "Pix amount mismatch" }, 409);
      }
      const now = new Date();
      const rawStatus = String(payment.status || "pending").toLowerCase();
      const statusMap: Record<string, string> = { approved: "approved", pending: "pending", in_process: "in_process", rejected: "rejected", cancelled: "cancelled", refunded: "refunded" };
      const paymentStatus = statusMap[rawStatus] || "pending";
      const eventId = `pix_payment:${resourceId}:${rawStatus}:${String(payment.date_last_updated || payment.date_created || "")}`;
      const { error: eventError } = await supabase.from("mp_webhook_events").upsert({
        id: eventId, event_type: eventType, action: action || null, resource_id: resourceId, tenant_id: tenantId,
        signature_verified: true, processing_status: "received",
        payload: { id: resourceId, status: paymentStatus, external_reference: tenantId, payment_method: "pix" },
      }, { onConflict: "id" });
      if (eventError) return json({ error: "Could not record Pix webhook event" }, 500);
      const { error: ledgerError } = await supabase.from("platform_payments").upsert({
        tenant_id: tenantId, subscription_id: subscription.id, provider: "mercadopago",
        mp_payment_id: resourceId, mp_preapproval_id: null, amount_cents: amountCents, currency: subscription.currency,
        status: paymentStatus, payment_method: "pix", payer_email: String(payment.payer?.email || subscription.mp_payer_email || ""),
        failure_reason: paymentStatus === "rejected" ? String(payment.status_detail || "Pagamento Pix recusado") : "",
        paid_at: paymentStatus === "approved" && payment.date_approved ? new Date(payment.date_approved).toISOString() : null,
        due_at: payment.date_of_expiration ? new Date(payment.date_of_expiration).toISOString() : null,
        updated_at: now.toISOString(),
      }, { onConflict: "mp_payment_id" });
      if (ledgerError) {
        await supabase.from("mp_webhook_events").update({ processing_status: "failed", error_message: ledgerError.message, processed_at: now.toISOString() }).eq("id", eventId);
        return json({ error: "Could not reconcile Pix payment" }, 500);
      }
      if (paymentStatus === "approved") {
        const paidAt = payment.date_approved ? new Date(payment.date_approved) : now;
        const currentEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
        const paidStart = currentEnd && currentEnd.getTime() > paidAt.getTime() ? currentEnd : paidAt;
        const paidEnd = new Date(paidStart);
        paidEnd.setMonth(paidEnd.getMonth() + 1);
        const { error: updateError } = await supabase.from("subscriptions").update({
          status: "authorized", current_period_start: paidStart.toISOString(), current_period_end: paidEnd.toISOString(),
          grace_until: null, last_event_at: now.toISOString(), updated_at: now.toISOString(),
        }).eq("id", subscription.id);
        if (updateError) {
          await supabase.from("mp_webhook_events").update({ processing_status: "failed", error_message: updateError.message, processed_at: now.toISOString() }).eq("id", eventId);
          return json({ error: "Could not activate Pix-paid subscription" }, 500);
        }
        const { error: tenantError } = await supabase.from("tenants").update({ status: "active", billing_suspended: false, updated_at: now.toISOString() })
          .eq("id", tenantId).eq("billing_suspended", true);
        if (tenantError) {
          await supabase.from("mp_webhook_events").update({ processing_status: "failed", error_message: tenantError.message, processed_at: now.toISOString() }).eq("id", eventId);
          return json({ error: "Could not restore tenant after Pix payment" }, 500);
        }
        // Pix is a one-time monthly payment, not a recurring authorization.
        // Cancel any legacy card/preapproval checkout previously opened for this
        // tenant so Mercado Pago cannot continue sending a second recurring charge.
        if (subscription.mp_preapproval_id) {
          const preapprovalResponse = await fetch("https://api.mercadopago.com/preapproval/" + encodeURIComponent(subscription.mp_preapproval_id), {
            headers: { "Authorization": "Bearer " + accessToken, ...(mpEnvironment === "test" ? { "X-scope": "stage" } : {}) }
          });
          const preapproval = await preapprovalResponse.json().catch(() => ({}));
          if (preapprovalResponse.ok && String(preapproval.external_reference || "") === tenantId && !["cancelled", "canceled"].includes(String(preapproval.status || "").toLowerCase())) {
            const cancelResponse = await fetch("https://api.mercadopago.com/preapproval/" + encodeURIComponent(subscription.mp_preapproval_id), {
              method: "PUT",
              headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json", ...(mpEnvironment === "test" ? { "X-scope": "stage" } : {}) },
              body: JSON.stringify({ status: "canceled" })
            });
            const cancelled = await cancelResponse.json().catch(() => ({}));
            if (!cancelResponse.ok || String(cancelled.id || "") !== subscription.mp_preapproval_id || !["cancelled", "canceled"].includes(String(cancelled.status || "").toLowerCase())) {
              console.error("[mp-webhook] Falha ao cancelar preapproval antigo após pagamento Pix:", cancelResponse.status);
              await supabase.from("mp_webhook_events").update({ processing_status: "failed", error_message: "Não foi possível cancelar autorização recorrente antiga.", processed_at: now.toISOString() }).eq("id", eventId);
              return json({ error: "Could not cancel legacy recurring authorization after Pix payment" }, 502);
            }
          } else if (!preapprovalResponse.ok || String(preapproval.external_reference || "") !== tenantId) {
            console.error("[mp-webhook] Não foi possível validar preapproval antigo antes do cancelamento.");
            return json({ error: "Could not verify legacy recurring authorization" }, 502);
          }
          const { error: clearPreapprovalError } = await supabase.from("subscriptions").update({
            mp_preapproval_id: null, mp_init_point: null, updated_at: now.toISOString()
          }).eq("id", subscription.id).eq("mp_preapproval_id", subscription.mp_preapproval_id);
          if (clearPreapprovalError) {
            console.error("[mp-webhook] Falha ao limpar vínculo de preapproval cancelado:", clearPreapprovalError.message);
            return json({ error: "Could not clear legacy recurring authorization" }, 500);
          }
        }
      }
      await supabase.from("mp_webhook_events").update({ processing_status: "processed", processed_at: now.toISOString() }).eq("id", eventId);
      return json({ received: true, processed: true, paymentStatus });
    }

    if (eventType === "subscription_authorized_payment") {
      const paymentResponse = await fetch(
        `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(resourceId)}`,
        { headers: { "Authorization": `Bearer ${accessToken}`, ...(mpEnvironment === "test" ? { "X-scope": "stage" } : {}) } },
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
        .select("id,tenant_id,status,plan_amount_cents,currency,mp_preapproval_id,mp_payer_email,current_period_start,current_period_end,grace_until,last_event_at,mp_environment")
        .eq("mp_preapproval_id", preapprovalId)
        .maybeSingle();
      if (subscriptionError || !subscription) {
        console.error("[mp-webhook] Assinatura não localizada para a fatura.");
        return json({ error: "Subscription not found for invoice" }, 404);
      }
      if (subscription.mp_environment !== mpEnvironment) {
        console.warn("[mp-webhook] Evento de ambiente diferente da assinatura recusado.");
        return json({ error: "Subscription environment mismatch" }, 409);
      }
      if (Math.round(amount * 100) !== subscription.plan_amount_cents || currency !== subscription.currency) {
        console.error("[mp-webhook] Valor/moeda da fatura diverge do plano contratado.");
        return json({ error: "Invoice amount mismatch" }, 409);
      }

      const preapprovalResponse = await fetch(
        `https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`,
        { headers: { "Authorization": `Bearer ${accessToken}` } },
      );
      const preapproval = await preapprovalResponse.json().catch(() => ({}));
      if (
        !preapprovalResponse.ok ||
        String(preapproval.id || "") !== preapprovalId ||
        String(preapproval.external_reference || "") !== subscription.tenant_id
      ) {
        console.error("[mp-webhook] Não foi possível validar o vínculo da assinatura na API do Mercado Pago.");
        return json({ error: "Could not verify subscription ownership" }, 502);
      }

      const paymentObject = authorized.payment && typeof authorized.payment === "object"
        ? authorized.payment as Record<string, unknown>
        : {};
      const payerObject = paymentObject.payer && typeof paymentObject.payer === "object"
        ? paymentObject.payer as Record<string, unknown>
        : {};
      const rawStatus = String(paymentObject.status || "").toLowerCase() || "pending";
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
      const mpPaymentId = String(paymentObject.id || authorized.id);
      const paidAtValue = authorized.date_approved || paymentObject.date_approved || authorized.date_last_updated || null;
      const paidAt = normalizedStatus === "approved" && paidAtValue
        ? new Date(String(paidAtValue))
        : null;
      const dueAtValue = authorized.debit_date || paymentObject.date_of_expiration || authorized.date_of_expiration || null;
      const dueAt = dueAtValue ? new Date(String(dueAtValue)) : null;
      const eventId = `authorized_payment:${resourceId}:${rawStatus}:${String(authorized.last_modified || authorized.date_created || "")}`;
      const paymentEventAt = authorized.last_modified ? new Date(String(authorized.last_modified)) : now;
      const previousPaymentEventAt = subscription.last_event_at ? new Date(subscription.last_event_at) : null;
      if (
        previousPaymentEventAt && !Number.isNaN(previousPaymentEventAt.getTime()) &&
        !Number.isNaN(paymentEventAt.getTime()) &&
        paymentEventAt.getTime() < previousPaymentEventAt.getTime()
      ) {
        await supabase.from("mp_webhook_events").upsert({
          id: eventId, event_type: eventType, action: action || null, resource_id: resourceId,
          tenant_id: subscription.tenant_id, signature_verified: true, processing_status: "processed",
          processed_at: now.toISOString(),
          payload: { id: resourceId, status: normalizedStatus, preapproval_id: preapprovalId, stale: true },
        }, { onConflict: "id" });
        return json({ received: true, processed: true, stale: true });
      }

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

      if (normalizedStatus === "approved") {
        const paidStart = paidAt && !Number.isNaN(paidAt.getTime())
          ? paidAt
          : (subscription.current_period_start ? new Date(subscription.current_period_start) : now);
        const providerNextPayment = preapproval.next_payment_date ? new Date(preapproval.next_payment_date) : null;
        const fallbackPaidEnd = new Date(paidStart);
        fallbackPaidEnd.setMonth(fallbackPaidEnd.getMonth() + 1);
        const paidEnd = providerNextPayment && !Number.isNaN(providerNextPayment.getTime())
          ? providerNextPayment
          : (subscription.current_period_end && Date.parse(subscription.current_period_end) > now.getTime()
            ? new Date(subscription.current_period_end)
            : fallbackPaidEnd);
        const { error: lifecycleError } = await supabase.from("subscriptions").update({
          status: "authorized",
          current_period_start: paidStart.toISOString(),
          current_period_end: paidEnd.toISOString(),
          grace_until: null,
          last_event_at: paymentEventAt.toISOString(),
          updated_at: now.toISOString(),
        }).eq("id", subscription.id);
        if (lifecycleError) {
          await supabase.from("mp_webhook_events").update({ processing_status: "failed", error_message: lifecycleError.message, processed_at: now.toISOString() }).eq("id", eventId);
          return json({ error: "Could not activate paid subscription" }, 500);
        }
        const { error: tenantRecoveryError } = await supabase.from("tenants")
          .update({ status: "active", billing_suspended: false, updated_at: now.toISOString() })
          .eq("id", subscription.tenant_id)
          .eq("billing_suspended", true);
        if (tenantRecoveryError) {
          await supabase.from("mp_webhook_events").update({ processing_status: "failed", error_message: tenantRecoveryError.message, processed_at: now.toISOString() }).eq("id", eventId);
          return json({ error: "Could not restore tenant access after payment" }, 500);
        }
      } else if (normalizedStatus === "rejected" || normalizedStatus === "cancelled" || normalizedStatus === "refunded") {
        const graceUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
        const { error: lifecycleError } = await supabase.from("subscriptions").update({ status: "paused", grace_until: graceUntil, last_event_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", subscription.id);
        if (lifecycleError) {
          await supabase.from("mp_webhook_events").update({ processing_status: "failed", error_message: lifecycleError.message, processed_at: now.toISOString() }).eq("id", eventId);
          return json({ error: "Could not update subscription after payment failure" }, 500);
        }
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
    const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(resourceId)}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        ...(mpEnvironment === "test" ? { "X-scope": "stage" } : {}),
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
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: current, error: currentError } = await supabase
      .from("subscriptions").select("id,tenant_id,status,trial_ends_at,mp_preapproval_id,plan_amount_cents,current_period_start,current_period_end,grace_until,last_event_at,mp_environment")
      .eq("tenant_id", tenantId).maybeSingle();
    if (currentError || !current) return json({ error: "MGW subscription not found" }, 404);
    if (current.mp_environment !== mpEnvironment) {
      console.warn("[mp-webhook] Evento de ambiente diferente da assinatura recusado.");
      return json({ error: "Subscription environment mismatch" }, 409);
    }
    const amount = Number(mp.auto_recurring?.transaction_amount);
    const currency = String(mp.auto_recurring?.currency_id || "");
    if (Math.round(amount * 100) !== current.plan_amount_cents || currency !== "BRL") {
      console.error("[mp-webhook] Valor/moeda divergente; assinatura não atualizada.");
      return json({ error: "Subscription amount mismatch" }, 409);
    }

    if (current.mp_preapproval_id && current.mp_preapproval_id !== resourceId) {
      return json({ error: "Subscription ID mismatch" }, 409);
    }

    const eventId = `preapproval:${resourceId}:${String(mp.status || "unknown")}:${String(mp.last_modified || mp.date_created || "")}`;
    const providerEventAtValue = mp.last_modified || mp.date_created || "";
    const providerEventAt = providerEventAtValue ? new Date(String(providerEventAtValue)) : null;
    const previousPreapprovalEventAt = current.last_event_at ? new Date(current.last_event_at) : null;
    if (
      providerEventAt && !Number.isNaN(providerEventAt.getTime()) &&
      previousPreapprovalEventAt && !Number.isNaN(previousPreapprovalEventAt.getTime()) &&
      providerEventAt.getTime() < previousPreapprovalEventAt.getTime()
    ) {
      await supabase.from("mp_webhook_events").upsert({
        id: eventId, event_type: eventType, action: action || null, resource_id: resourceId,
        tenant_id: tenantId, signature_verified: true, processing_status: "processed",
        processed_at: new Date().toISOString(),
        payload: { id: resourceId, status: mp.status, external_reference: tenantId, stale: true },
      }, { onConflict: "id" });
      return json({ received: true, processed: true, stale: true });
    }
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
    const graceStillActive = ["paused", "past_due"].includes(current.status)
      && current.grace_until && Date.parse(current.grace_until) > now.getTime();
    const trialStillActive = current.status === "trialing"
      && current.trial_ends_at && Date.parse(current.trial_ends_at) > now.getTime();
    const terminalStatus = ["cancelled", "expired", "suspended"].includes(current.status);
    const statusMap: Record<string, string> = {
      authorized: terminalStatus ? current.status : (current.status === "authorized" ? "authorized" : (graceStillActive ? current.status : (trialStillActive ? "trialing" : "pending"))),
      pending: terminalStatus ? current.status : (current.status === "authorized" ? "authorized" : (graceStillActive ? current.status : (trialStillActive ? "trialing" : "pending"))),
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
    const endDate = mp.next_payment_date ? new Date(mp.next_payment_date) : (current.current_period_end ? new Date(current.current_period_end) : null);
    const graceUntil = nextStatus === "paused"
      ? (graceStillActive ? current.grace_until : new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString())
      : null;

    const { error: updateError } = await supabase.from("subscriptions").update({
      status: nextStatus,
      mp_preapproval_id: resourceId,
      current_period_start: nextStatus === "authorized" ? (current.current_period_start || startDate.toISOString()) : undefined,
      current_period_end: endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : undefined,
      grace_until: graceUntil,
      ended_at: nextStatus === "cancelled" && (!endDate || endDate.getTime() <= now.getTime()) ? now.toISOString() : undefined,
      cancelled_at: nextStatus === "cancelled" ? now.toISOString() : undefined,
      last_event_at: providerEventAt?.toISOString() || now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("tenant_id", tenantId);
    if (updateError) {
      await supabase.from("mp_webhook_events").update({
        processing_status: "failed", error_message: updateError.message, processed_at: now.toISOString(),
      }).eq("id", eventId);
      console.error("[mp-webhook] Falha ao sincronizar assinatura:", updateError.message);
      return json({ error: "Could not synchronize subscription" }, 500);
    }
    if (nextStatus === "authorized") {
      const { error: tenantRecoveryError } = await supabase.from("tenants")
        .update({ status: "active", billing_suspended: false, updated_at: now.toISOString() })
        .eq("id", tenantId)
        .eq("billing_suspended", true);
      if (tenantRecoveryError) {
        await supabase.from("mp_webhook_events").update({
          processing_status: "failed", error_message: tenantRecoveryError.message, processed_at: now.toISOString(),
        }).eq("id", eventId);
        return json({ error: "Could not restore tenant access after subscription authorization" }, 500);
      }
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
