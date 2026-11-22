-- ============================================================================
-- MGW GESTAO — ETAPA 2.1: CORRECOES FINAIS DE SEGURANCA E CONSISTENCIA SAAS
-- Migration: 20261119000002_etapa2_1_security_and_consistency_fixes.sql
--
-- Regras:
--   * Migration 100% ADITIVA e segura para registros existentes.
--   * Preserva sessao de estabelecimentos 'suspended' para exibicao da tela
--     SubscriptionBlockedScreen, mantendo tabelas operacionais bloqueadas.
--   * Remove exposicao de tokenHash nos RPCs publicos de pedido online.
--   * Alinha DEFAULT de public.subscriptions.plan_amount_cents para 4990.
--   * Garante integridade de retencao de 6 meses por CHECK constraints.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PRESERVACAO DE SESSAO PARA ESTABELECIMENTOS 'suspended' (SOMENTE LEITURA DO VINCULO)
--
-- Observacao: is_tenant_member, is_tenant_owner, has_active_tenant_access,
-- is_tenant_billing_active e has_tenant_role continuam exigindo t.status = 'active'.
-- Portanto, apenas tenants, tenant_members e subscriptions ficam legiveis no estado
-- 'suspended' (nunca 'archived'), mantendo todas as tabelas operacionais bloqueadas.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT tm.tenant_id
  FROM public.tenant_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = auth.uid()
    AND tm.active = true
    AND t.status IN ('active', 'suspended');
$$;

REVOKE ALL ON FUNCTION public.get_my_tenant_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_ids() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. VALOR DEFAULT DA ASSINATURA (R$ 49,90 = 4990 CENTAVOS) & RETENCAO (6 MESES)
-- ----------------------------------------------------------------------------

ALTER TABLE public.subscriptions
  ALTER COLUMN plan_amount_cents SET DEFAULT 4990;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS chk_subscriptions_retention_dates,
  DROP CONSTRAINT IF EXISTS chk_subscriptions_retention_eligibility;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT chk_subscriptions_retention_dates CHECK (
    (
      retention_status = 'none'
      AND retention_started_at IS NULL
      AND retention_ends_at IS NULL
    )
    OR (
      retention_status IN ('active_retention', 'expired')
      AND ended_at IS NOT NULL
      AND retention_started_at IS NOT NULL
      AND retention_ends_at IS NOT NULL
      AND retention_started_at >= ended_at
      AND retention_ends_at > retention_started_at
      AND retention_ends_at = ((retention_started_at AT TIME ZONE 'UTC' + interval '6 months') AT TIME ZONE 'UTC')
      AND retention_ends_at >= ((ended_at AT TIME ZONE 'UTC' + interval '6 months') AT TIME ZONE 'UTC')
    )
  ),
  ADD CONSTRAINT chk_subscriptions_retention_eligibility CHECK (
    retention_status = 'none'
    OR (
      status IN ('cancelled', 'expired', 'suspended')
      AND ended_at IS NOT NULL
      AND (current_period_end IS NULL OR ended_at >= current_period_end)
      AND (trial_ends_at IS NULL OR ended_at >= trial_ends_at)
      AND (grace_until IS NULL OR ended_at >= grace_until)
    )
  );

-- ----------------------------------------------------------------------------
-- 3. REMOCAO DE tokenHash DOS RPCS PUBLICOS DE PEDIDO ONLINE
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_order_by_token(p_tracking_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT jsonb_build_object(
    'found', true,
    'order', jsonb_build_object(
      'orderId', o.id,
      'orderNumber', o.order_number,
      'orderCode', o.order_code,
      'status', o.status,
      'fulfillmentType', o.fulfillment_type,
      'customerName', o.customer_name,
      'deliveryAddress', o.delivery_address,
      'deliveryReference', o.delivery_reference,
      'paymentMethod', o.payment_method,
      'changeFor', o.change_for,
      'customerNote', o.customer_note,
      'subtotalAmount', o.subtotal_amount,
      'deliveryFee', o.delivery_fee,
      'totalAmount', o.total_amount,
      'rejectionReason', o.rejection_reason,
      'storeName', d.store_name,
      'storeSlug', d.slug,
      'storeWhatsapp', d.phone_whatsapp,
      'storeAddress', d.address,
      'storePixKey', d.pix_key,
      'createdAt', o.created_at,
      'updatedAt', o.updated_at,
      'items', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', i.id,
          'itemKind', i.item_kind,
          'refId', i.ref_id,
          'itemName', i.item_name,
          'quantity', i.quantity,
          'unitPrice', i.unit_price,
          'lineTotal', i.line_total,
          'itemNote', i.item_note
        ) ORDER BY i.created_at)
        FROM public.online_order_items i
        WHERE i.order_id = o.id
      ), '[]'::jsonb),
      'statusHistory', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', h.id,
          'fromStatus', h.from_status,
          'toStatus', h.to_status,
          'reason', h.reason,
          'actorType', h.actor_type,
          'createdAt', h.created_at
        ) ORDER BY h.created_at)
        FROM public.online_order_status_history h
        WHERE h.order_id = o.id
      ), '[]'::jsonb)
    )
  )
  FROM public.online_orders o
  JOIN public.digital_menu_settings d ON d.tenant_id = o.tenant_id
  WHERE o.tracking_token_hash = encode(digest(coalesce(p_tracking_token, ''), 'sha256'), 'hex')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_order_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_by_token(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_public_online_order(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment_type text,
  p_delivery_address text,
  p_delivery_reference text,
  p_payment_method text,
  p_change_for numeric,
  p_customer_note text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_menu public.digital_menu_settings%ROWTYPE;
  v_order_id uuid := gen_random_uuid();
  v_order_number bigint;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_token_hash text;
  v_order_code text;
  v_item jsonb;
  v_kind text;
  v_ref uuid;
  v_qty integer;
  v_note text;
  v_name text;
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2) := 0;
  v_xsaladas integer;
  v_product_counts boolean;
  v_components jsonb;
  v_pending_items jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_total numeric(12,2);
  v_item_count integer := 0;
  v_has_combo boolean := false;
  v_has_product boolean := false;
  v_order_item_id uuid;
  v_change_for numeric(12,2);
BEGIN
  IF p_slug IS NULL OR length(btrim(p_slug)) < 2 OR length(p_slug) > 63 THEN
    RAISE EXCEPTION 'Cardapio digital invalido.';
  END IF;

  SELECT * INTO v_menu
  FROM public.digital_menu_settings
  WHERE slug = lower(btrim(p_slug))
    AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cardapio digital nao encontrado ou indisponivel.';
  END IF;

  IF NOT public.is_tenant_billing_active(v_menu.tenant_id) THEN
    RAISE EXCEPTION 'Estabelecimento temporariamente indisponivel.';
  END IF;

  IF NOT v_menu.is_open THEN RAISE EXCEPTION 'A loja esta fechada para novos pedidos.'; END IF;
  IF p_fulfillment_type NOT IN ('delivery','pickup') THEN RAISE EXCEPTION 'Escolha entrega ou retirada.'; END IF;
  IF p_fulfillment_type = 'delivery' AND NOT v_menu.accepts_delivery THEN RAISE EXCEPTION 'Esta loja nao aceita pedidos para entrega.'; END IF;
  IF p_fulfillment_type = 'pickup' AND NOT v_menu.accepts_pickup THEN RAISE EXCEPTION 'Esta loja nao aceita retirada.'; END IF;
  IF p_payment_method NOT IN ('Pix','Dinheiro','Cartão') THEN RAISE EXCEPTION 'Forma de pagamento invalida.'; END IF;
  IF length(btrim(coalesce(p_customer_name,''))) < 2 OR length(coalesce(p_customer_name,'')) > 120 THEN RAISE EXCEPTION 'Informe seu nome.'; END IF;
  IF length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g')) < 10 THEN RAISE EXCEPTION 'Informe um telefone valido.'; END IF;
  IF p_fulfillment_type = 'delivery' AND length(btrim(coalesce(p_delivery_address,''))) < 5 THEN RAISE EXCEPTION 'Informe o endereco de entrega.'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 40 THEN
    RAISE EXCEPTION 'O carrinho esta vazio ou possui itens demais.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_kind := coalesce(v_item->>'kind','');
    v_qty := greatest(0, least(30, coalesce((v_item->>'quantity')::integer,0)));
    v_note := left(btrim(coalesce(v_item->>'note','')),160);
    IF v_qty < 1 THEN RAISE EXCEPTION 'Quantidade de item invalida.'; END IF;
    BEGIN v_ref := (v_item->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Item do carrinho invalido.'; END;

    IF v_kind = 'product' THEN
      SELECT name, unit_price, counts_as_x_salada
      INTO v_name, v_unit_price, v_product_counts
      FROM public.products
      WHERE id = v_ref AND tenant_id = v_menu.tenant_id AND active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Um produto do carrinho nao esta mais disponivel.'; END IF;
      v_xsaladas := CASE WHEN v_product_counts THEN 1 ELSE 0 END;
      v_components := jsonb_build_array(jsonb_build_object(
        'productId',v_ref::text,'productName',v_name,'quantityPerUnit',1,
        'totalQuantity',v_qty,'countsAsXSalada',(v_xsaladas > 0)
      ));
      v_has_product := true;
    ELSIF v_kind = 'combo' THEN
      SELECT name, sale_price, estimated_cost, items
      INTO v_name, v_unit_price, v_unit_cost, v_components
      FROM public.combos
      WHERE id = v_ref AND tenant_id = v_menu.tenant_id AND active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Um combo do carrinho nao esta mais disponivel.'; END IF;
      SELECT coalesce(sum(CASE WHEN coalesce((comp->>'countsAsXSalada')::boolean,false)
                               THEN greatest(0,(comp->>'quantity')::integer) ELSE 0 END),0)::integer
      INTO v_xsaladas
      FROM jsonb_array_elements(v_components) comp;
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'productId',comp->>'productId',
        'productName',comp->>'productName',
        'quantityPerUnit',greatest(1,(comp->>'quantity')::integer),
        'totalQuantity',greatest(1,(comp->>'quantity')::integer)*v_qty,
        'countsAsXSalada',coalesce((comp->>'countsAsXSalada')::boolean,false)
      )), '[]'::jsonb)
      INTO v_components
      FROM jsonb_array_elements(v_components) comp;
      v_has_combo := true;
    ELSE
      RAISE EXCEPTION 'Tipo de item invalido.';
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
    v_item_count := v_item_count + v_qty;
    v_order_item_id := gen_random_uuid();
    v_pending_items := v_pending_items || jsonb_build_array(jsonb_build_object(
      'id',v_order_item_id,'kind',v_kind,'refId',v_ref,'name',v_name,
      'quantity',v_qty,'unitPrice',v_unit_price,'lineTotal',v_unit_price*v_qty,
      'estimatedUnitCost',v_unit_cost,'xSaladasPerUnit',v_xsaladas,
      'components',v_components,'note',v_note
    ));
  END LOOP;

  v_delivery_fee := CASE WHEN p_fulfillment_type = 'delivery' THEN v_menu.delivery_fee ELSE 0 END;
  IF v_subtotal < v_menu.minimum_order_amount THEN
    RAISE EXCEPTION 'Pedido minimo de R$ % nao atingido.', to_char(v_menu.minimum_order_amount,'FM999999990D00');
  END IF;
  v_total := v_subtotal + v_delivery_fee;
  v_change_for := CASE WHEN p_payment_method = 'Dinheiro' AND coalesce(p_change_for,0) > 0 THEN p_change_for ELSE NULL END;
  IF v_change_for IS NOT NULL AND v_change_for < v_total THEN RAISE EXCEPTION 'O troco precisa ser maior ou igual ao total do pedido.'; END IF;

  INSERT INTO public.online_order_counters(tenant_id,last_number)
  VALUES (v_menu.tenant_id,1)
  ON CONFLICT (tenant_id) DO UPDATE SET last_number = public.online_order_counters.last_number + 1
  RETURNING last_number INTO v_order_number;

  v_order_code := lpad((v_order_number % 100000)::text,5,'0');
  v_token_hash := encode(digest(v_token,'sha256'),'hex');

  INSERT INTO public.online_orders (
    id,tenant_id,order_number,order_code,tracking_token_hash,menu_slug,status,
    fulfillment_type,customer_name,customer_phone,delivery_address,delivery_reference,
    payment_method,change_for,customer_note,subtotal_amount,delivery_fee,total_amount
  ) VALUES (
    v_order_id,v_menu.tenant_id,v_order_number,v_order_code,v_token_hash,v_menu.slug,'received',
    p_fulfillment_type,left(btrim(p_customer_name),120),
    left(regexp_replace(p_customer_phone,'[^0-9+]','','g'),32),
    CASE WHEN p_fulfillment_type='delivery' THEN left(btrim(p_delivery_address),280) ELSE '' END,
    CASE WHEN p_fulfillment_type='delivery' THEN left(btrim(coalesce(p_delivery_reference,'')),160) ELSE '' END,
    p_payment_method,v_change_for,left(btrim(coalesce(p_customer_note,'')),300),
    v_subtotal,v_delivery_fee,v_total
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_pending_items) LOOP
    INSERT INTO public.online_order_items (
      id,order_id,tenant_id,item_kind,ref_id,item_name,quantity,unit_price,
      line_total,estimated_unit_cost,x_saladas_per_unit,components,item_note
    ) VALUES (
      (v_item->>'id')::uuid,v_order_id,v_menu.tenant_id,v_item->>'kind',
      (v_item->>'refId')::uuid,v_item->>'name',(v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric,(v_item->>'lineTotal')::numeric,
      (v_item->>'estimatedUnitCost')::numeric,(v_item->>'xSaladasPerUnit')::integer,
      v_item->'components',v_item->>'note'
    );
  END LOOP;

  INSERT INTO public.online_order_status_history(order_id,tenant_id,from_status,to_status,reason,actor_type)
  VALUES (v_order_id,v_menu.tenant_id,NULL,'received','Pedido enviado pelo cardapio digital.','customer');

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'orderCode', v_order_code,
    'trackingToken', v_token,
    'status', 'received',
    'subtotalAmount', v_subtotal,
    'deliveryFee', v_delivery_fee,
    'totalAmount', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb) TO anon, authenticated, service_role;

COMMIT;
