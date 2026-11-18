-- MGW GESTAO: taxas de entrega configuraveis por bairro.
-- Aditiva. Aplicar somente apos validacao em ambiente de teste.
BEGIN;

CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
  delivery_fee numeric(12,2) NOT NULL CHECK (delivery_fee >= 0 AND delivery_fee <= 1000),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_zones_tenant_name UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_tenant_active_order
  ON public.delivery_zones (tenant_id, active, sort_order, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_zones_tenant_name_ci
  ON public.delivery_zones (tenant_id, lower(name));

ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS delivery_neighborhood text NOT NULL DEFAULT ''
  CHECK (char_length(delivery_neighborhood) <= 100);

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.delivery_zones FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_zones TO authenticated;

DROP POLICY IF EXISTS delivery_zones_select_member ON public.delivery_zones;
CREATE POLICY delivery_zones_select_member ON public.delivery_zones
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS delivery_zones_insert_managers ON public.delivery_zones;
CREATE POLICY delivery_zones_insert_managers ON public.delivery_zones
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));
DROP POLICY IF EXISTS delivery_zones_update_managers ON public.delivery_zones;
CREATE POLICY delivery_zones_update_managers ON public.delivery_zones
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));
DROP POLICY IF EXISTS delivery_zones_delete_managers ON public.delivery_zones;
CREATE POLICY delivery_zones_delete_managers ON public.delivery_zones
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));

DROP FUNCTION IF EXISTS public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb);
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
  v_delivery_zones jsonb;
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
    -- Verifica se tenant existe mesmo antes de configurar digital_menu_settings pela primeira vez
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

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'fee', z.delivery_fee) ORDER BY z.sort_order, z.name), '[]'::jsonb)
  INTO v_delivery_zones
  FROM public.delivery_zones z
  WHERE z.tenant_id = v_menu.tenant_id AND z.active = true;

  RETURN jsonb_build_object(
    'found', true,
    'store', jsonb_build_object(
      'slug', v_menu.slug,
      'storeName', v_menu.store_name,
      'description', v_menu.description,
      'phoneWhatsapp', v_menu.phone_whatsapp,
      'address', v_menu.address,
      'openingHours', v_menu.opening_hours,
      'isActive', v_menu.is_active,
      'isOpen', v_menu.is_open,
      'deliveryFee', v_menu.delivery_fee,
      'minimumOrderAmount', v_menu.minimum_order_amount,
      'acceptsDelivery', v_menu.accepts_delivery,
      'acceptsPickup', v_menu.accepts_pickup
    ),
    'deliveryZones', CASE WHEN v_menu.is_active AND v_menu.accepts_delivery THEN v_delivery_zones ELSE '[]'::jsonb END,
    'products', CASE WHEN v_menu.is_active THEN v_products ELSE '[]'::jsonb END,
    'combos', CASE WHEN v_menu.is_active THEN v_combos ELSE '[]'::jsonb END
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb,text);
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
  p_items jsonb,
  p_delivery_neighborhood text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_clean_slug text;
  v_menu public.digital_menu_settings%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_customer_name text;
  v_customer_phone text;
  v_fulfillment text;
  v_address text;
  v_reference text;
  v_payment text;
  v_note text;
  v_item jsonb;
  v_item_kind text;
  v_ref_id uuid;
  v_qty integer;
  v_item_note text;
  v_product public.products%ROWTYPE;
  v_combo public.combos%ROWTYPE;
  v_subtotal numeric(12, 2) := 0;
  v_delivery_fee numeric(12, 2) := 0;
  v_total numeric(12, 2) := 0;
  v_order_seq integer;
  v_order_code text;
  v_raw_token text;
  v_token_hash text;
  v_order_id uuid;
  v_xsaladas_per_unit integer;
  v_components jsonb;
  v_comp jsonb;
  v_items_count integer := 0;
  v_neighborhood text;
  v_zone public.delivery_zones%ROWTYPE;
BEGIN
  v_clean_slug := lower(nullif(btrim(coalesce(p_slug, '')), ''));

  IF v_clean_slug IS NOT NULL THEN
    SELECT dms.*
    INTO v_menu
    FROM public.digital_menu_settings dms
    JOIN public.tenants t ON t.id = dms.tenant_id
    WHERE (dms.slug = v_clean_slug OR t.slug = v_clean_slug)
      AND t.status = 'active'
    FOR UPDATE OF dms;
  ELSE
    SELECT dms.*
    INTO v_menu
    FROM public.digital_menu_settings dms
    JOIN public.tenants t ON t.id = dms.tenant_id
    WHERE t.status = 'active'
      AND (t.slug IN ('mgw_lanches', 'mgw-lanches') OR dms.slug IN ('mgw_lanches', 'mgw-lanches'))
    ORDER BY dms.is_active DESC, dms.created_at ASC
    LIMIT 1
    FOR UPDATE OF dms;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento nao encontrado no cardapio digital.';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = v_menu.tenant_id;
  IF v_tenant.status <> 'active' THEN
    RAISE EXCEPTION 'Este estabelecimento nao esta disponivel no momento.';
  END IF;

  IF NOT v_menu.is_active THEN
    RAISE EXCEPTION 'O cardapio digital deste estabelecimento esta desativado no momento.';
  END IF;

  IF NOT v_menu.is_open THEN
    RAISE EXCEPTION 'A lanchonete esta fechada no momento e nao esta recebendo pedidos.';
  END IF;

  v_customer_name := left(btrim(coalesce(p_customer_name, '')), 120);
  IF char_length(v_customer_name) < 2 THEN
    RAISE EXCEPTION 'Informe seu nome completo (minimo 2 caracteres).';
  END IF;

  v_customer_phone := left(btrim(coalesce(p_customer_phone, '')), 32);
  IF char_length(regexp_replace(v_customer_phone, '\D', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'Informe um telefone ou WhatsApp valido para contato.';
  END IF;

  v_fulfillment := lower(btrim(coalesce(p_fulfillment_type, '')));
  IF v_fulfillment NOT IN ('delivery', 'pickup') THEN
    RAISE EXCEPTION 'Tipo de atendimento invalido. Escolha Entrega ou Retirada.';
  END IF;

  IF v_fulfillment = 'delivery' AND NOT v_menu.accepts_delivery THEN
    RAISE EXCEPTION 'Este estabelecimento nao aceita pedidos para entrega no momento.';
  END IF;

  IF v_fulfillment = 'pickup' AND NOT v_menu.accepts_pickup THEN
    RAISE EXCEPTION 'Este estabelecimento nao aceita retirada no local no momento.';
  END IF;

  v_address := left(btrim(coalesce(p_delivery_address, '')), 280);
  v_reference := left(btrim(coalesce(p_delivery_reference, '')), 160);
  IF v_fulfillment = 'delivery' AND char_length(v_address) < 5 THEN
    RAISE EXCEPTION 'Informe o endereco completo para entrega.';
  END IF;
  v_neighborhood := left(btrim(coalesce(p_delivery_neighborhood, '')), 100);
  IF v_fulfillment = 'delivery' THEN
    IF char_length(v_neighborhood) < 2 THEN
      RAISE EXCEPTION 'Selecione o bairro para calcular a taxa de entrega.';
    END IF;
    SELECT * INTO v_zone FROM public.delivery_zones z
    WHERE z.tenant_id = v_menu.tenant_id AND z.active = true
      AND lower(z.name) = lower(v_neighborhood)
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Este bairro nao esta disponivel para entrega. Selecione um bairro da lista.';
    END IF;
    v_neighborhood := v_zone.name;
    v_delivery_fee := v_zone.delivery_fee;
  END IF;
  IF v_fulfillment = 'pickup' THEN
    v_neighborhood := '';
    v_address := '';
    v_reference := '';
  END IF;

  v_payment := btrim(coalesce(p_payment_method, ''));
  IF v_payment NOT IN ('Pix', 'Dinheiro', 'Cartão') THEN
    RAISE EXCEPTION 'Forma de pagamento invalida. Escolha Pix, Dinheiro ou Cartao.';
  END IF;

  v_note := left(btrim(coalesce(p_customer_note, '')), 300);

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos um produto ou combo ao carrinho.';
  END IF;

  IF jsonb_array_length(p_items) > 40 THEN
    RAISE EXCEPTION 'Quantidade maxima de linhas por pedido excedida.';
  END IF;

  -- Calcula subtotal no servidor ANTES de inserir para validar precos oficiais e pedido minimo
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_kind := lower(btrim(coalesce(v_item->>'kind', '')));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    IF v_qty < 1 OR v_qty > 100 THEN
      RAISE EXCEPTION 'Quantidade invalida no carrinho.';
    END IF;

    BEGIN
      v_ref_id := (v_item->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Identificador de item invalido no carrinho.';
    END;

    IF v_item_kind = 'product' THEN
      SELECT * INTO v_product
      FROM public.products p
      WHERE p.id = v_ref_id
        AND p.tenant_id = v_menu.tenant_id
        AND p.active = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um produto do seu carrinho nao esta mais disponivel no cardapio.';
      END IF;

      v_subtotal := round(v_subtotal + (v_product.unit_price * v_qty), 2);
      v_items_count := v_items_count + 1;
    ELSIF v_item_kind = 'combo' THEN
      SELECT * INTO v_combo
      FROM public.combos c
      WHERE c.id = v_ref_id
        AND c.tenant_id = v_menu.tenant_id
        AND c.active = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um combo do seu carrinho nao esta mais disponivel no cardapio.';
      END IF;

      v_subtotal := round(v_subtotal + (v_combo.sale_price * v_qty), 2);
      v_items_count := v_items_count + 1;
    ELSE
      RAISE EXCEPTION 'Tipo de item invalido no carrinho.';
    END IF;
  END LOOP;

  IF v_items_count = 0 OR v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Carrinho vazio ou sem valor valido.';
  END IF;

  IF v_subtotal < v_menu.minimum_order_amount THEN
    RAISE EXCEPTION 'O pedido minimo e de R$ %.', replace(to_char(v_menu.minimum_order_amount, 'FM999990D00'), '.', ',');
  END IF;

  IF v_fulfillment = 'pickup' THEN v_delivery_fee := 0; END IF;
  v_total := round(v_subtotal + v_delivery_fee, 2);

  IF v_payment = 'Dinheiro' AND p_change_for IS NOT NULL AND p_change_for > 0 AND p_change_for < v_total THEN
    RAISE EXCEPTION 'O valor informado para troco nao pode ser menor que o total do pedido.';
  END IF;

  -- Reserva sequencial do numero do pedido de forma atomica
  UPDATE public.digital_menu_settings
  SET next_order_seq = next_order_seq + 1
  WHERE tenant_id = v_menu.tenant_id
  RETURNING next_order_seq - 1 INTO v_order_seq;

  v_raw_token := encode(gen_random_bytes(24), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');
  v_order_code := upper(substr(v_raw_token, 1, 6));

  INSERT INTO public.online_orders (
    tenant_id,
    order_number,
    order_code,
    tracking_token_hash,
    status,
    fulfillment_type,
    customer_name,
    customer_phone,
    delivery_address,
    delivery_neighborhood,
    delivery_reference,
    payment_method,
    change_for,
    customer_note,
    subtotal_amount,
    delivery_fee,
    total_amount
  )
  VALUES (
    v_menu.tenant_id,
    v_order_seq,
    v_order_code,
    v_token_hash,
    'received',
    v_fulfillment,
    v_customer_name,
    v_customer_phone,
    v_address,
    v_neighborhood,
    v_reference,
    v_payment,
    CASE WHEN v_payment = 'Dinheiro' AND p_change_for IS NOT NULL AND p_change_for > 0 THEN round(p_change_for, 2) ELSE NULL END,
    v_note,
    v_subtotal,
    v_delivery_fee,
    v_total
  )
  RETURNING id INTO v_order_id;

  -- Insere os snapshots dos itens com precos oficiais
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_kind := lower(btrim(coalesce(v_item->>'kind', '')));
    v_ref_id := (v_item->>'id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_item_note := left(btrim(coalesce(v_item->>'note', '')), 200);

    IF v_item_kind = 'product' THEN
      SELECT * INTO v_product
      FROM public.products p
      WHERE p.id = v_ref_id AND p.tenant_id = v_menu.tenant_id;

      v_xsaladas_per_unit := CASE WHEN v_product.counts_as_x_salada THEN 1 ELSE 0 END;
      v_components := jsonb_build_array(
        jsonb_build_object(
          'productId', v_product.id::text,
          'productName', v_product.name,
          'quantityPerUnit', 1,
          'totalQuantity', v_qty,
          'countsAsXSalada', v_product.counts_as_x_salada
        )
      );

      INSERT INTO public.online_order_items (
        order_id, tenant_id, item_kind, ref_id, item_name, quantity,
        unit_price, line_total, estimated_unit_cost, x_saladas_per_unit, components, item_note
      )
      VALUES (
        v_order_id, v_menu.tenant_id, 'product', v_product.id, v_product.name, v_qty,
        v_product.unit_price, round(v_product.unit_price * v_qty, 2), 0, v_xsaladas_per_unit, v_components, v_item_note
      );
    ELSE
      SELECT * INTO v_combo
      FROM public.combos c
      WHERE c.id = v_ref_id AND c.tenant_id = v_menu.tenant_id;

      v_xsaladas_per_unit := 0;
      v_components := '[]'::jsonb;
      FOR v_comp IN SELECT * FROM jsonb_array_elements(v_combo.items) LOOP
        IF coalesce((v_comp->>'countsAsXSalada')::boolean, false) THEN
          v_xsaladas_per_unit := v_xsaladas_per_unit + greatest(1, coalesce((v_comp->>'quantity')::integer, 1));
        END IF;
        v_components := v_components || jsonb_build_array(
          jsonb_build_object(
            'productId', coalesce(v_comp->>'productId', ''),
            'productName', coalesce(v_comp->>'productName', 'Produto'),
            'quantityPerUnit', greatest(1, coalesce((v_comp->>'quantity')::integer, 1)),
            'totalQuantity', v_qty * greatest(1, coalesce((v_comp->>'quantity')::integer, 1)),
            'countsAsXSalada', coalesce((v_comp->>'countsAsXSalada')::boolean, false)
          )
        );
      END LOOP;

      INSERT INTO public.online_order_items (
        order_id, tenant_id, item_kind, ref_id, item_name, quantity,
        unit_price, line_total, estimated_unit_cost, x_saladas_per_unit, components, item_note
      )
      VALUES (
        v_order_id, v_menu.tenant_id, 'combo', v_combo.id, v_combo.name, v_qty,
        v_combo.sale_price, round(v_combo.sale_price * v_qty, 2), coalesce(v_combo.estimated_cost, 0),
        v_xsaladas_per_unit, v_components, v_item_note
      );
    END IF;
  END LOOP;

  INSERT INTO public.online_order_status_history (
    order_id, tenant_id, from_status, to_status, reason, actor_type
  )
  VALUES (
    v_order_id, v_menu.tenant_id, NULL, 'received', 'Pedido enviado pelo cardápio digital.', 'customer'
  );

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_seq,
    'orderCode', v_order_code,
    'trackingToken', v_raw_token,
    'tokenHash', v_token_hash,
    'status', 'received',
    'subtotalAmount', v_subtotal,
    'deliveryFee', v_delivery_fee,
    'totalAmount', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_digital_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_online_order(text,text,text,text,text,text,text,numeric,text,jsonb,text) TO anon, authenticated, service_role;

COMMIT;
