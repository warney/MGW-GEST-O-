-- MGW GESTÃO — Cardápio Digital: Chave Pix Opcional para Copiar e Colar na Confirmação
-- Migration aditiva idempotente. Preserva integralmente tabelas e dados existentes.

BEGIN;

ALTER TABLE public.digital_menu_settings
  ADD COLUMN IF NOT EXISTS pix_key text NOT NULL DEFAULT '';

ALTER TABLE public.digital_menu_settings
  DROP CONSTRAINT IF EXISTS chk_digital_menu_pix_key;

ALTER TABLE public.digital_menu_settings
  ADD CONSTRAINT chk_digital_menu_pix_key
    CHECK (char_length(pix_key) <= 140);

CREATE OR REPLACE FUNCTION public.get_public_digital_menu(p_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clean_slug text;
  v_tenant public.tenants%ROWTYPE;
  v_menu public.digital_menu_settings%ROWTYPE;
  v_products jsonb;
  v_combos jsonb;
BEGIN
  v_clean_slug := lower(nullif(btrim(coalesce(p_slug, '')), ''));

  IF v_clean_slug IS NOT NULL THEN
    SELECT dms.*
    INTO v_menu
    FROM public.digital_menu_settings dms
    JOIN public.tenants t ON t.id = dms.tenant_id
    WHERE (dms.slug = v_clean_slug OR t.slug = v_clean_slug)
      AND t.status = 'active'
    LIMIT 1;
  ELSE
    SELECT dms.*
    INTO v_menu
    FROM public.digital_menu_settings dms
    JOIN public.tenants t ON t.id = dms.tenant_id
    WHERE t.status = 'active'
      AND (t.slug IN ('mgw_lanches', 'mgw-lanches') OR dms.slug IN ('mgw_lanches', 'mgw-lanches'))
    ORDER BY dms.is_active DESC, dms.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT dms.*
      INTO v_menu
      FROM public.digital_menu_settings dms
      JOIN public.tenants t ON t.id = dms.tenant_id
      WHERE t.status = 'active'
        AND dms.is_active = true
      ORDER BY dms.created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  IF NOT FOUND THEN
    SELECT t.*
    INTO v_tenant
    FROM public.tenants t
    WHERE t.status = 'active'
      AND (
        (v_clean_slug IS NOT NULL AND t.slug = v_clean_slug)
        OR (v_clean_slug IS NULL AND t.slug IN ('mgw_lanches', 'mgw-lanches'))
      )
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'found', false,
        'store', NULL,
        'products', '[]'::jsonb,
        'combos', '[]'::jsonb
      );
    END IF;

    RETURN jsonb_build_object(
      'found', true,
      'store', jsonb_build_object(
        'slug', v_tenant.slug,
        'storeName', v_tenant.name,
        'description', '',
        'phoneWhatsapp', '',
        'address', '',
        'openingHours', '',
        'pixKey', '',
        'isActive', false,
        'isOpen', false,
        'deliveryFee', 0,
        'minimumOrderAmount', 0,
        'acceptsDelivery', true,
        'acceptsPickup', true
      ),
      'products', '[]'::jsonb,
      'combos', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'category', p.category,
        'unitPrice', p.unit_price,
        'countsAsXSalada', p.counts_as_x_salada
      )
      ORDER BY
        CASE p.category
          WHEN 'Lanche' THEN 1
          WHEN 'Bebida' THEN 2
          WHEN 'Adicional' THEN 3
          ELSE 4
        END,
        p.name ASC
    ),
    '[]'::jsonb
  )
  INTO v_products
  FROM public.products p
  WHERE p.tenant_id = v_menu.tenant_id
    AND p.active = true;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'items', c.items,
        'salePrice', c.sale_price
      )
      ORDER BY c.name ASC
    ),
    '[]'::jsonb
  )
  INTO v_combos
  FROM public.combos c
  WHERE c.tenant_id = v_menu.tenant_id
    AND c.active = true;

  RETURN jsonb_build_object(
    'found', true,
    'store', jsonb_build_object(
      'slug', v_menu.slug,
      'storeName', v_menu.store_name,
      'description', v_menu.description,
      'phoneWhatsapp', v_menu.phone_whatsapp,
      'address', v_menu.address,
      'openingHours', v_menu.opening_hours,
      'pixKey', coalesce(v_menu.pix_key, ''),
      'isActive', v_menu.is_active,
      'isOpen', v_menu.is_open,
      'deliveryFee', v_menu.delivery_fee,
      'minimumOrderAmount', v_menu.minimum_order_amount,
      'acceptsDelivery', v_menu.accepts_delivery,
      'acceptsPickup', v_menu.accepts_pickup
    ),
    'products', CASE WHEN v_menu.is_active THEN v_products ELSE '[]'::jsonb END,
    'combos', CASE WHEN v_menu.is_active THEN v_combos ELSE '[]'::jsonb END
  );
END;
$$;

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
      'storePixKey', coalesce(v_menu.pix_key, ''),
      'createdAt', v_order.created_at,
      'updatedAt', v_order.updated_at,
      'items', v_items,
      'statusHistory', v_history
    )
  );
END;
$$;

COMMIT;
