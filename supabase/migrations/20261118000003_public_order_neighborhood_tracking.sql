-- Expose delivery neighborhood on the customer tracking endpoint.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_public_order_by_token(p_tracking_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_clean_token text;
  v_token_hash text;
  v_order public.online_orders%ROWTYPE;
  v_menu public.digital_menu_settings%ROWTYPE;
  v_items jsonb;
  v_history jsonb;
BEGIN
  v_clean_token := btrim(coalesce(p_tracking_token, ''));
  IF char_length(v_clean_token) < 24 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

  SELECT *
  INTO v_order
  FROM public.online_orders
  WHERE tracking_token_hash = v_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT *
  INTO v_menu
  FROM public.digital_menu_settings
  WHERE tenant_id = v_order.tenant_id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'itemKind', oi.item_kind,
        'refId', oi.ref_id,
        'itemName', oi.item_name,
        'quantity', oi.quantity,
        'unitPrice', oi.unit_price,
        'lineTotal', oi.line_total,
        'itemNote', oi.item_note
      )
      ORDER BY oi.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.online_order_items oi
  WHERE oi.order_id = v_order.id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'fromStatus', h.from_status,
        'toStatus', h.to_status,
        'reason', h.reason,
        'createdAt', h.created_at
      )
      ORDER BY h.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_history
  FROM public.online_order_status_history h
  WHERE h.order_id = v_order.id;

  RETURN jsonb_build_object(
    'found', true,
    'order', jsonb_build_object(
      'orderId', v_order.id,
      'tokenHash', v_order.tracking_token_hash,
      'orderNumber', v_order.order_number,
      'orderCode', v_order.order_code,
      'status', v_order.status,
      'fulfillmentType', v_order.fulfillment_type,
      'customerName', v_order.customer_name,
      'deliveryAddress', v_order.delivery_address,
      'deliveryNeighborhood', coalesce(v_order.delivery_neighborhood, ''),
      'deliveryReference', v_order.delivery_reference,
      'paymentMethod', v_order.payment_method,
      'changeFor', v_order.change_for,
      'customerNote', v_order.customer_note,
      'subtotalAmount', v_order.subtotal_amount,
      'deliveryFee', v_order.delivery_fee,
      'totalAmount', v_order.total_amount,
      'rejectionReason', v_order.rejection_reason,
      'storeName', coalesce(v_menu.store_name, 'MGW Lanches'),
      'storeSlug', coalesce(v_menu.slug, 'mgw_lanches'),
      'storeWhatsapp', coalesce(v_menu.phone_whatsapp, ''),
      'storeAddress', coalesce(v_menu.address, ''),
      'createdAt', v_order.created_at,
      'updatedAt', v_order.updated_at,
      'items', v_items,
      'statusHistory', v_history
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_order_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_by_token(text) TO anon, authenticated, service_role;
COMMIT;
