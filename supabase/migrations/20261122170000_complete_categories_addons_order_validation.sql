-- MGW Gestão: fechamento completo de categorias personalizadas, grupos de adicionais,
-- validação e precificação autoritativa no servidor e snapshots históricos em pedidos e vendas.

BEGIN;

-- 1) Persistência do snapshot de adicionais escolhidos nos itens do pedido online.
ALTER TABLE public.online_order_items
  ADD COLUMN IF NOT EXISTS selected_addons jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.online_order_items
  DROP CONSTRAINT IF EXISTS chk_online_order_items_selected_addons_array;

ALTER TABLE public.online_order_items
  ADD CONSTRAINT chk_online_order_items_selected_addons_array
  CHECK (jsonb_typeof(selected_addons) = 'array');

-- 2) Backfill idempotente de categorias existentes (preservando "Completos" e rótulos atuais).
INSERT INTO public.product_categories (tenant_id, name, sort_order)
SELECT p.tenant_id, btrim(p.category), 0
FROM public.products p
WHERE nullif(btrim(p.category), '') IS NOT NULL
GROUP BY p.tenant_id, btrim(p.category)
ON CONFLICT DO NOTHING;

-- 3) Garantir que gerentes também possam desvincular grupos ao editar produtos.
DROP POLICY IF EXISTS product_addon_groups_admin_delete ON public.product_addon_groups;
DROP POLICY IF EXISTS product_addon_groups_manager_delete ON public.product_addon_groups;
CREATE POLICY product_addon_groups_manager_delete ON public.product_addon_groups
FOR DELETE TO authenticated
USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));

-- 4) Renomeação atômica de categoria dentro do mesmo tenant, mantendo produtos sincronizados.
CREATE OR REPLACE FUNCTION public.rename_tenant_product_category(
  p_tenant_id uuid,
  p_category_id uuid,
  p_new_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clean_name text := left(btrim(coalesce(p_new_name, '')), 60);
  v_category public.product_categories%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR NOT public.has_tenant_role(p_tenant_id, ARRAY['owner','admin','manager']) THEN
    RAISE EXCEPTION 'Sem permissão para alterar categorias deste estabelecimento.';
  END IF;

  IF char_length(v_clean_name) < 1 THEN
    RAISE EXCEPTION 'Informe um nome válido para a categoria.';
  END IF;

  SELECT * INTO v_category
  FROM public.product_categories
  WHERE id = p_category_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_categories pc
    WHERE pc.tenant_id = p_tenant_id
      AND pc.id <> p_category_id
      AND lower(btrim(pc.name)) = lower(v_clean_name)
  ) THEN
    RAISE EXCEPTION 'Já existe outra categoria com o nome "%".', v_clean_name;
  END IF;

  UPDATE public.product_categories
  SET name = v_clean_name,
      updated_at = now()
  WHERE id = p_category_id
    AND tenant_id = p_tenant_id;

  UPDATE public.products
  SET category = v_clean_name,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND lower(btrim(category)) = lower(btrim(v_category.name));

  RETURN jsonb_build_object(
    'id', v_category.id,
    'oldName', v_category.name,
    'name', v_clean_name,
    'sortOrder', v_category.sort_order,
    'active', v_category.active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rename_tenant_product_category(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_tenant_product_category(uuid, uuid, text) TO authenticated, service_role;

-- 5) Cardápio público com categorias ordenadas, filtro por categoria ativa e grupos/opções ativos.
CREATE OR REPLACE FUNCTION public.get_public_digital_menu(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'found', true,
    'store', jsonb_build_object(
      'slug', d.slug,
      'isActive', d.is_active,
      'isOpen', d.is_open,
      'storeName', d.store_name,
      'description', d.description,
      'phoneWhatsapp', d.phone_whatsapp,
      'address', d.address,
      'openingHours', d.opening_hours,
      'pixKey', d.pix_key,
      'logoUrl', d.logo_url,
      'bannerUrl', d.banner_url,
      'deliveryFee', d.delivery_fee,
      'minimumOrderAmount', d.minimum_order_amount,
      'acceptsDelivery', d.accepts_delivery,
      'acceptsPickup', d.accepts_pickup
    ),
    'categories', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pc.id,
        'name', pc.name,
        'sortOrder', pc.sort_order,
        'active', pc.active
      ) ORDER BY pc.sort_order ASC, pc.name ASC)
      FROM public.product_categories pc
      WHERE pc.tenant_id = d.tenant_id
        AND pc.active = true
    ), '[]'::jsonb),
    'products', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'category', p.category,
        'unitPrice', p.unit_price,
        'countsAsXSalada', p.counts_as_x_salada,
        'imageUrl', coalesce(p.image_url, ''),
        'addonGroups', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', g.id,
            'name', g.name,
            'isRequired', g.is_required,
            'minSelect', g.min_select,
            'maxSelect', g.max_select,
            'active', g.active,
            'sortOrder', g.sort_order,
            'options', coalesce((
              SELECT jsonb_agg(jsonb_build_object(
                'id', ao.id,
                'groupId', ao.group_id,
                'name', ao.name,
                'price', ao.price,
                'active', ao.active,
                'sortOrder', ao.sort_order
              ) ORDER BY ao.sort_order ASC, ao.name ASC)
              FROM public.addon_options ao
              WHERE ao.tenant_id = d.tenant_id
                AND ao.group_id = g.id
                AND ao.active = true
            ), '[]'::jsonb)
          ) ORDER BY pag.sort_order ASC, g.sort_order ASC, g.name ASC)
          FROM public.product_addon_groups pag
          JOIN public.addon_groups g
            ON g.id = pag.group_id
           AND g.tenant_id = d.tenant_id
          WHERE pag.tenant_id = d.tenant_id
            AND pag.product_id = p.id
            AND g.active = true
            AND EXISTS (
              SELECT 1
              FROM public.addon_options ao2
              WHERE ao2.tenant_id = d.tenant_id
                AND ao2.group_id = g.id
                AND ao2.active = true
            )
        ), '[]'::jsonb)
      ) ORDER BY coalesce(pc.sort_order, 999999) ASC, p.name ASC)
      FROM public.products p
      LEFT JOIN public.product_categories pc
        ON pc.tenant_id = d.tenant_id
       AND lower(btrim(pc.name)) = lower(btrim(p.category))
      WHERE p.tenant_id = d.tenant_id
        AND p.active = true
        AND (pc.id IS NULL OR pc.active = true)
    ), '[]'::jsonb),
    'combos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'items', c.items,
        'salePrice', c.sale_price,
        'imageUrl', coalesce(c.image_url, '')
      ) ORDER BY c.name ASC)
      FROM public.combos c
      WHERE c.tenant_id = d.tenant_id
        AND c.active = true
    ), '[]'::jsonb)
  )
  FROM public.digital_menu_settings d
  WHERE d.slug = lower(btrim(coalesce(p_slug, '')))
    AND d.is_active = true
    AND public.is_tenant_billing_active(d.tenant_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_digital_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO anon, authenticated, service_role;

-- 6) Criação de pedido online com validação completa de adicionais e cálculo 100% no servidor.
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
  v_product_category text;
  v_unit_price numeric(12,2);
  v_addon_unit_total numeric(12,2);
  v_unit_cost numeric(12,2) := 0;
  v_xsaladas integer;
  v_product_counts boolean;
  v_components jsonb;
  v_raw_addons jsonb;
  v_selected_addons_snapshot jsonb;
  v_sel jsonb;
  v_sel_group_id uuid;
  v_seen_group_ids uuid[];
  v_group_rec record;
  v_matched_sel jsonb;
  v_raw_option_ids jsonb;
  v_opt_el jsonb;
  v_opt_id uuid;
  v_group_opt_ids uuid[];
  v_selected_count integer;
  v_group_options_snapshot jsonb;
  v_group_addon_sum numeric(12,2);
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
    v_selected_addons_snapshot := '[]'::jsonb;
    v_addon_unit_total := 0;
    v_unit_cost := 0;

    IF v_qty < 1 THEN RAISE EXCEPTION 'Quantidade de item invalida.'; END IF;
    BEGIN v_ref := (v_item->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Item do carrinho invalido.'; END;

    IF v_kind = 'product' THEN
      SELECT name, category, unit_price, counts_as_x_salada
      INTO v_name, v_product_category, v_unit_price, v_product_counts
      FROM public.products
      WHERE id = v_ref AND tenant_id = v_menu.tenant_id AND active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Um produto do carrinho nao esta mais disponivel.'; END IF;

      IF EXISTS (
        SELECT 1
        FROM public.product_categories pc
        WHERE pc.tenant_id = v_menu.tenant_id
          AND lower(btrim(pc.name)) = lower(btrim(v_product_category))
          AND pc.active = false
      ) THEN
        RAISE EXCEPTION 'A categoria do produto "%" esta temporariamente indisponivel.', v_name;
      END IF;

      v_raw_addons := coalesce(v_item->'selectedAddons', '[]'::jsonb);
      IF jsonb_typeof(v_raw_addons) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Selecao de adicionais invalida para "%".', v_name;
      END IF;

      v_seen_group_ids := ARRAY[]::uuid[];
      FOR v_sel IN SELECT value FROM jsonb_array_elements(v_raw_addons) LOOP
        IF jsonb_typeof(v_sel) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Formato de adicional invalido para "%".', v_name;
        END IF;

        BEGIN
          v_sel_group_id := (v_sel->>'groupId')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Grupo de adicionais invalido para "%".', v_name;
        END;

        IF v_sel_group_id = ANY(v_seen_group_ids) THEN
          RAISE EXCEPTION 'Grupo de adicionais duplicado em "%".', v_name;
        END IF;
        v_seen_group_ids := array_append(v_seen_group_ids, v_sel_group_id);

        IF jsonb_typeof(coalesce(v_sel->'optionIds', '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Lista de opcoes invalida para "%".', v_name;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM public.product_addon_groups pag
          JOIN public.addon_groups g
            ON g.id = pag.group_id
           AND g.tenant_id = v_menu.tenant_id
          WHERE pag.tenant_id = v_menu.tenant_id
            AND pag.product_id = v_ref
            AND pag.group_id = v_sel_group_id
            AND g.active = true
            AND EXISTS (
              SELECT 1 FROM public.addon_options ao
              WHERE ao.tenant_id = v_menu.tenant_id
                AND ao.group_id = g.id
                AND ao.active = true
            )
        ) THEN
          RAISE EXCEPTION 'Adicional nao vinculado ou indisponivel para "%".', v_name;
        END IF;
      END LOOP;

      FOR v_group_rec IN
        SELECT g.id, g.name, g.is_required, g.min_select, g.max_select
        FROM public.product_addon_groups pag
        JOIN public.addon_groups g
          ON g.id = pag.group_id
         AND g.tenant_id = v_menu.tenant_id
        WHERE pag.tenant_id = v_menu.tenant_id
          AND pag.product_id = v_ref
          AND g.active = true
          AND EXISTS (
            SELECT 1 FROM public.addon_options ao
            WHERE ao.tenant_id = v_menu.tenant_id
              AND ao.group_id = g.id
              AND ao.active = true
          )
        ORDER BY pag.sort_order ASC, g.sort_order ASC, g.name ASC
      LOOP
        v_matched_sel := NULL;
        FOR v_sel IN SELECT value FROM jsonb_array_elements(v_raw_addons) LOOP
          IF (v_sel->>'groupId')::uuid = v_group_rec.id THEN
            v_matched_sel := v_sel;
            EXIT;
          END IF;
        END LOOP;

        v_raw_option_ids := CASE
          WHEN v_matched_sel IS NULL THEN '[]'::jsonb
          ELSE coalesce(v_matched_sel->'optionIds', '[]'::jsonb)
        END;

        IF jsonb_typeof(v_raw_option_ids) IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Opcoes invalidas para "%".', v_group_rec.name;
        END IF;

        v_group_opt_ids := ARRAY[]::uuid[];
        FOR v_opt_el IN SELECT value FROM jsonb_array_elements(v_raw_option_ids) LOOP
          IF jsonb_typeof(v_opt_el) IS DISTINCT FROM 'string' THEN
            RAISE EXCEPTION 'Opcao de adicional invalida em "%".', v_group_rec.name;
          END IF;
          BEGIN
            v_opt_id := (v_opt_el #>> '{}')::uuid;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Identificador de adicional invalido em "%".', v_group_rec.name;
          END;
          IF v_opt_id = ANY(v_group_opt_ids) THEN
            RAISE EXCEPTION 'Opcao repetida em "%".', v_group_rec.name;
          END IF;
          IF NOT EXISTS (
            SELECT 1
            FROM public.addon_options ao
            WHERE ao.id = v_opt_id
              AND ao.tenant_id = v_menu.tenant_id
              AND ao.group_id = v_group_rec.id
              AND ao.active = true
          ) THEN
            RAISE EXCEPTION 'Uma opcao selecionada em "%" nao esta mais disponivel.', v_group_rec.name;
          END IF;
          v_group_opt_ids := array_append(v_group_opt_ids, v_opt_id);
        END LOOP;

        v_selected_count := coalesce(array_length(v_group_opt_ids, 1), 0);
        IF v_selected_count > v_group_rec.max_select THEN
          RAISE EXCEPTION 'Escolha no maximo % opcoes em "%".', v_group_rec.max_select, v_group_rec.name;
        END IF;
        IF v_group_rec.is_required AND v_selected_count < greatest(1, v_group_rec.min_select) THEN
          RAISE EXCEPTION 'Selecione ao menos % opcoes em "%".', greatest(1, v_group_rec.min_select), v_group_rec.name;
        END IF;
        IF NOT v_group_rec.is_required AND v_selected_count > 0 AND v_selected_count < v_group_rec.min_select THEN
          RAISE EXCEPTION 'Selecione ao menos % opcoes em "%".', v_group_rec.min_select, v_group_rec.name;
        END IF;

        IF v_selected_count > 0 THEN
          SELECT
            coalesce(sum(ao.price), 0)::numeric(12,2),
            coalesce(jsonb_agg(jsonb_build_object(
              'id', ao.id,
              'name', ao.name,
              'price', ao.price
            ) ORDER BY ao.sort_order ASC, ao.name ASC), '[]'::jsonb)
          INTO v_group_addon_sum, v_group_options_snapshot
          FROM public.addon_options ao
          WHERE ao.tenant_id = v_menu.tenant_id
            AND ao.group_id = v_group_rec.id
            AND ao.active = true
            AND ao.id = ANY(v_group_opt_ids);

          v_addon_unit_total := v_addon_unit_total + v_group_addon_sum;
          v_selected_addons_snapshot := v_selected_addons_snapshot || jsonb_build_array(
            jsonb_build_object(
              'groupId', v_group_rec.id,
              'groupName', v_group_rec.name,
              'options', v_group_options_snapshot
            )
          );
        END IF;
      END LOOP;

      v_unit_price := round(v_unit_price + v_addon_unit_total, 2);
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
      'quantity',v_qty,'unitPrice',v_unit_price,'lineTotal',round(v_unit_price*v_qty, 2),
      'estimatedUnitCost',v_unit_cost,'xSaladasPerUnit',v_xsaladas,
      'components',v_components,'selectedAddons',v_selected_addons_snapshot,'note',v_note
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
      line_total,estimated_unit_cost,x_saladas_per_unit,components,selected_addons,item_note
    ) VALUES (
      (v_item->>'id')::uuid,v_order_id,v_menu.tenant_id,v_item->>'kind',
      (v_item->>'refId')::uuid,v_item->>'name',(v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric,(v_item->>'lineTotal')::numeric,
      (v_item->>'estimatedUnitCost')::numeric,(v_item->>'xSaladasPerUnit')::integer,
      v_item->'components',coalesce(v_item->'selectedAddons','[]'::jsonb),v_item->>'note'
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

-- 7) Acompanhamento público preservando snapshot de adicionais sem expor hash do token.
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
          'selectedAddons', coalesce(i.selected_addons, '[]'::jsonb),
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

-- 8) Preservar snapshot dos adicionais escolhidos ao converter pedido concluído em venda.
CREATE OR REPLACE FUNCTION public.transition_online_order_status(
  p_order_id uuid,
  p_next_status text,
  p_reason text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.online_orders%ROWTYPE;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_now timestamptz := now();
  v_sale_id uuid;
  v_xsalada_count integer;
  v_total_units integer;
  v_quantity integer;
  v_has_combo boolean;
  v_has_product boolean;
  v_sale_items jsonb;
  v_sale_mode text;
  v_payment text;
  v_note text;
  v_configured_tz text;
  v_tz text := 'America/Manaus';
  v_sale_date date;
  v_delivery_fee numeric(12,2);
  v_sale_total numeric(12,2);
  v_actor_email text;
BEGIN
  SELECT * INTO v_order FROM public.online_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_tenant_role(v_order.tenant_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'Pedido nao encontrado ou acesso negado.';
  END IF;
  IF v_order.status IN ('completed', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Pedido ja finalizado nao permite alteracao.';
  END IF;
  IF p_next_status IN ('rejected', 'cancelled') AND length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo (minimo 3 caracteres).';
  END IF;
  IF NOT (
    (v_order.status = 'received' AND p_next_status IN ('accepted', 'rejected', 'cancelled')) OR
    (v_order.status = 'accepted' AND p_next_status IN ('preparing', 'cancelled')) OR
    (v_order.status = 'preparing' AND p_next_status IN ('ready', 'cancelled')) OR
    (v_order.status = 'ready' AND p_next_status IN (CASE WHEN v_order.fulfillment_type = 'delivery' THEN 'out_for_delivery' ELSE 'ready_for_pickup' END, 'cancelled')) OR
    (v_order.status IN ('out_for_delivery', 'ready_for_pickup') AND p_next_status IN ('completed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Transicao de status invalida.';
  END IF;

  UPDATE public.online_orders SET
    status = p_next_status,
    viewed_at = coalesce(viewed_at, v_now),
    accepted_at = CASE WHEN p_next_status = 'accepted' THEN coalesce(accepted_at, v_now) ELSE accepted_at END,
    preparing_at = CASE WHEN p_next_status = 'preparing' THEN coalesce(preparing_at, v_now) ELSE preparing_at END,
    ready_at = CASE WHEN p_next_status = 'ready' THEN coalesce(ready_at, v_now) ELSE ready_at END,
    dispatched_at = CASE WHEN p_next_status IN ('out_for_delivery', 'ready_for_pickup') THEN coalesce(dispatched_at, v_now) ELSE dispatched_at END,
    completed_at = CASE WHEN p_next_status = 'completed' THEN coalesce(completed_at, v_now) ELSE completed_at END,
    cancelled_at = CASE WHEN p_next_status IN ('rejected', 'cancelled') THEN coalesce(cancelled_at, v_now) ELSE cancelled_at END,
    rejection_reason = CASE WHEN p_next_status IN ('rejected', 'cancelled') THEN v_reason ELSE rejection_reason END,
    updated_at = v_now
  WHERE id = p_order_id;

  INSERT INTO public.online_order_status_history(order_id, tenant_id, from_status, to_status, reason, actor_type)
  VALUES (
    p_order_id,
    v_order.tenant_id,
    v_order.status,
    p_next_status,
    CASE WHEN p_next_status IN ('rejected', 'cancelled') THEN v_reason ELSE p_next_status END,
    'admin'
  );

  IF p_next_status = 'completed' AND v_order.sale_id IS NULL THEN
    SELECT ss.timezone INTO v_configured_tz
    FROM public.shop_settings ss
    WHERE ss.tenant_id = v_order.tenant_id;

    IF v_configured_tz IS NOT NULL AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = btrim(v_configured_tz)
    ) THEN
      v_tz := btrim(v_configured_tz);
    END IF;
    v_sale_date := (v_now AT TIME ZONE v_tz)::date;

    SELECT
      coalesce(sum(i.x_saladas_per_unit * i.quantity), 0)::integer,
      coalesce(sum(i.quantity), 0)::integer,
      bool_or(i.item_kind = 'combo'),
      bool_or(i.item_kind = 'product'),
      coalesce(jsonb_agg(jsonb_build_object(
        'kind', i.item_kind,
        'refId', i.ref_id,
        'name', i.item_name,
        'quantity', i.quantity,
        'unitPrice', i.unit_price,
        'lineTotal', i.line_total,
        'selectedAddons', coalesce(i.selected_addons, '[]'::jsonb),
        'estimatedUnitCost', i.estimated_unit_cost,
        'xSaladasPerUnit', i.x_saladas_per_unit,
        'components', i.components
      ) ORDER BY i.created_at), '[]'::jsonb)
    INTO v_xsalada_count, v_total_units, v_has_combo, v_has_product, v_sale_items
    FROM public.online_order_items i
    WHERE i.order_id = p_order_id;

    v_quantity := greatest(1, CASE WHEN v_xsalada_count > 0 THEN v_xsalada_count ELSE v_total_units END);
    v_sale_mode := CASE
      WHEN coalesce(v_has_combo, false) AND coalesce(v_has_product, false) THEN 'mixed'
      WHEN coalesce(v_has_combo, false) THEN 'combo'
      ELSE 'individual'
    END;
    v_payment := CASE WHEN v_order.payment_method = 'Cartão' THEN 'Cartão de crédito' ELSE v_order.payment_method END;
    v_note := left(
      v_order.order_code || ' · ' || v_order.customer_name ||
      CASE WHEN v_order.customer_note <> '' THEN ' · ' || v_order.customer_note ELSE '' END,
      240
    );
    v_delivery_fee := greatest(0, coalesce(v_order.delivery_fee, 0));
    v_sale_total := greatest(
      0,
      round(
        greatest(
          coalesce(v_order.total_amount, 0),
          coalesce(v_order.subtotal_amount, 0) + v_delivery_fee
        ),
        2
      )
    );

    SELECT tm.email INTO v_actor_email
    FROM public.tenant_members tm
    WHERE tm.tenant_id = v_order.tenant_id
      AND tm.user_id = auth.uid()
      AND tm.active = true
    LIMIT 1;

    INSERT INTO public.sales (
      tenant_id, owner_email, date, quantity, unit_price, total_amount, payment_method, note,
      sale_mode, x_salada_count, combos_count, items, sale_origin, online_order_id, delivery_fee
    ) VALUES (
      v_order.tenant_id,
      coalesce(v_actor_email, ''),
      v_sale_date,
      v_quantity,
      round(v_sale_total / nullif(v_quantity, 0), 2),
      v_sale_total,
      v_payment,
      v_note,
      v_sale_mode,
      v_xsalada_count,
      (SELECT coalesce(sum(quantity), 0)::integer FROM public.online_order_items WHERE order_id = p_order_id AND item_kind = 'combo'),
      v_sale_items,
      'online',
      p_order_id,
      v_delivery_fee
    )
    RETURNING id INTO v_sale_id;

    UPDATE public.online_orders SET sale_id = v_sale_id WHERE id = p_order_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_online_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_online_order_status(uuid, text, text) TO authenticated, service_role;

-- 9) Publicação Realtime para categorias e adicionais.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_categories'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.product_categories;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'addon_groups'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.addon_groups;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'addon_options'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.addon_options;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_addon_groups'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.product_addon_groups;
    END IF;
  END IF;
END
$$;

COMMIT;
