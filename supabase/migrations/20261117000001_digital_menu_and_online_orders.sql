-- ============================================================================
-- MGW GESTAO — CARDAPIO DIGITAL, PEDIDOS ONLINE E INTEGRACAO FINANCEIRA
-- Migration: 20261117000001_digital_menu_and_online_orders.sql
--
-- ATENCAO:
--   * Migration ADITIVA sobre 001 (initial_saas_schema) e 002 (etapa4 RBAC).
--   * Reutiliza tenants, products, combos, shop_settings e sales (zero duplicacao).
--   * Precos e totais de pedidos online sao recalculados no servidor via RPC.
--   * Clientes publicos (anon) NAO possuem SELECT direto em tabelas com PII.
--   * Acompanhamento em tempo real usa canal seguro por hash SHA-256 do token.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. INTEGRACAO ADITIVA EM SALES (ORIGEM MANUAL VS CARDAPIO ONLINE)
-- ----------------------------------------------------------------------------

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS online_order_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sales_origin,
  DROP CONSTRAINT IF EXISTS chk_sales_delivery_fee;

ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_origin CHECK (sale_origin IN ('manual', 'online')),
  ADD CONSTRAINT chk_sales_delivery_fee CHECK (delivery_fee >= 0);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_origin_date
  ON public.sales (tenant_id, sale_origin, date DESC);

-- ----------------------------------------------------------------------------
-- 2. CONFIGURACOES DO CARDAPIO DIGITAL POR ESTABELECIMENTO
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.digital_menu_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE
    CONSTRAINT chk_digital_menu_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  is_active boolean NOT NULL DEFAULT false,
  is_open boolean NOT NULL DEFAULT true,
  store_name text NOT NULL DEFAULT 'MGW Lanches'
    CONSTRAINT chk_digital_menu_store_name CHECK (char_length(btrim(store_name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT ''
    CONSTRAINT chk_digital_menu_description CHECK (char_length(description) <= 300),
  phone_whatsapp text NOT NULL DEFAULT ''
    CONSTRAINT chk_digital_menu_phone CHECK (char_length(phone_whatsapp) <= 32),
  address text NOT NULL DEFAULT ''
    CONSTRAINT chk_digital_menu_address CHECK (char_length(address) <= 240),
  opening_hours text NOT NULL DEFAULT ''
    CONSTRAINT chk_digital_menu_hours CHECK (char_length(opening_hours) <= 160),
  delivery_fee numeric(12, 2) NOT NULL DEFAULT 0
    CONSTRAINT chk_digital_menu_delivery_fee CHECK (delivery_fee >= 0 AND delivery_fee <= 1000),
  minimum_order_amount numeric(12, 2) NOT NULL DEFAULT 0
    CONSTRAINT chk_digital_menu_min_order CHECK (minimum_order_amount >= 0 AND minimum_order_amount <= 10000),
  accepts_delivery boolean NOT NULL DEFAULT true,
  accepts_pickup boolean NOT NULL DEFAULT true,
  next_order_seq integer NOT NULL DEFAULT 1
    CONSTRAINT chk_digital_menu_order_seq CHECK (next_order_seq >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_digital_menu_fulfillment_enabled CHECK (accepts_delivery OR accepts_pickup)
);

COMMENT ON TABLE public.digital_menu_settings IS
  'Configuracoes publicas e operacionais do cardapio digital de cada estabelecimento.';

-- ----------------------------------------------------------------------------
-- 3. PEDIDOS ONLINE, ITENS (SNAPSHOT), HISTORICO DE STATUS E PING REALTIME
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.online_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number integer NOT NULL
    CONSTRAINT chk_online_orders_number CHECK (order_number >= 1),
  order_code text NOT NULL
    CONSTRAINT chk_online_orders_code CHECK (char_length(btrim(order_code)) BETWEEN 3 AND 24),
  tracking_token_hash text NOT NULL UNIQUE
    CONSTRAINT chk_online_orders_token_hash CHECK (char_length(tracking_token_hash) = 64),
  status text NOT NULL DEFAULT 'received'
    CONSTRAINT chk_online_orders_status CHECK (
      status IN (
        'received',
        'accepted',
        'preparing',
        'ready',
        'out_for_delivery',
        'ready_for_pickup',
        'completed',
        'rejected',
        'cancelled'
      )
    ),
  fulfillment_type text NOT NULL
    CONSTRAINT chk_online_orders_fulfillment CHECK (fulfillment_type IN ('delivery', 'pickup')),
  customer_name text NOT NULL
    CONSTRAINT chk_online_orders_customer_name CHECK (char_length(btrim(customer_name)) BETWEEN 2 AND 120),
  customer_phone text NOT NULL
    CONSTRAINT chk_online_orders_customer_phone CHECK (char_length(btrim(customer_phone)) BETWEEN 8 AND 32),
  delivery_address text NOT NULL DEFAULT ''
    CONSTRAINT chk_online_orders_address CHECK (char_length(delivery_address) <= 280),
  delivery_reference text NOT NULL DEFAULT ''
    CONSTRAINT chk_online_orders_reference CHECK (char_length(delivery_reference) <= 160),
  payment_method text NOT NULL
    CONSTRAINT chk_online_orders_payment CHECK (payment_method IN ('Pix', 'Dinheiro', 'Cartão')),
  change_for numeric(12, 2)
    CONSTRAINT chk_online_orders_change CHECK (change_for IS NULL OR change_for >= 0),
  customer_note text NOT NULL DEFAULT ''
    CONSTRAINT chk_online_orders_note CHECK (char_length(customer_note) <= 300),
  subtotal_amount numeric(12, 2) NOT NULL
    CONSTRAINT chk_online_orders_subtotal CHECK (subtotal_amount > 0),
  delivery_fee numeric(12, 2) NOT NULL DEFAULT 0
    CONSTRAINT chk_online_orders_delivery_fee CHECK (delivery_fee >= 0),
  total_amount numeric(12, 2) NOT NULL
    CONSTRAINT chk_online_orders_total CHECK (total_amount > 0),
  rejection_reason text NOT NULL DEFAULT ''
    CONSTRAINT chk_online_orders_rejection CHECK (char_length(rejection_reason) <= 300),
  viewed_at timestamptz,
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  sale_id uuid UNIQUE REFERENCES public.sales(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_online_orders_tenant_number UNIQUE (tenant_id, order_number),
  CONSTRAINT chk_online_orders_delivery_address_req CHECK (
    fulfillment_type <> 'delivery' OR char_length(btrim(delivery_address)) >= 5
  )
);

CREATE INDEX IF NOT EXISTS idx_online_orders_tenant_status_created
  ON public.online_orders (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_online_orders_tenant_created
  ON public.online_orders (tenant_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_sales_online_order_id'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT fk_sales_online_order_id
      FOREIGN KEY (online_order_id) REFERENCES public.online_orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_sales_online_order_id'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT uq_sales_online_order_id UNIQUE (online_order_id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.online_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_kind text NOT NULL
    CONSTRAINT chk_online_order_items_kind CHECK (item_kind IN ('product', 'combo')),
  ref_id uuid NOT NULL,
  item_name text NOT NULL
    CONSTRAINT chk_online_order_items_name CHECK (char_length(btrim(item_name)) BETWEEN 1 AND 120),
  quantity integer NOT NULL
    CONSTRAINT chk_online_order_items_qty CHECK (quantity >= 1 AND quantity <= 100),
  unit_price numeric(12, 2) NOT NULL
    CONSTRAINT chk_online_order_items_unit_price CHECK (unit_price >= 0),
  line_total numeric(12, 2) NOT NULL
    CONSTRAINT chk_online_order_items_line_total CHECK (line_total >= 0),
  estimated_unit_cost numeric(12, 2) NOT NULL DEFAULT 0
    CONSTRAINT chk_online_order_items_est_cost CHECK (estimated_unit_cost >= 0),
  x_saladas_per_unit integer NOT NULL DEFAULT 0
    CONSTRAINT chk_online_order_items_xsaladas CHECK (x_saladas_per_unit >= 0),
  components jsonb NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT chk_online_order_items_components CHECK (jsonb_typeof(components) = 'array'),
  item_note text NOT NULL DEFAULT ''
    CONSTRAINT chk_online_order_items_note CHECK (char_length(item_note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_order_items_order
  ON public.online_order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_online_order_items_tenant_order
  ON public.online_order_items (tenant_id, order_id);

CREATE TABLE IF NOT EXISTS public.online_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL
    CONSTRAINT chk_order_history_to_status CHECK (
      to_status IN (
        'received',
        'accepted',
        'preparing',
        'ready',
        'out_for_delivery',
        'ready_for_pickup',
        'completed',
        'rejected',
        'cancelled'
      )
    ),
  reason text NOT NULL DEFAULT ''
    CONSTRAINT chk_order_history_reason CHECK (char_length(reason) <= 300),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'system'
    CONSTRAINT chk_order_history_actor CHECK (actor_type IN ('customer', 'admin', 'system')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_created
  ON public.online_order_status_history (order_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_order_status_history_tenant
  ON public.online_order_status_history (tenant_id, order_id);

-- Tabela auxiliar sem nenhuma PII para notificar o cliente em tempo real via Supabase Realtime
CREATE TABLE IF NOT EXISTS public.online_order_realtime_pings (
  order_id uuid PRIMARY KEY REFERENCES public.online_orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE
    CONSTRAINT chk_realtime_ping_token_hash CHECK (char_length(token_hash) = 64),
  status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.online_order_realtime_pings IS
  'Canal publico sem PII para eventos Supabase Realtime de mudanca de status do pedido. Nunca armazena dados do cliente ou valores.';

-- ----------------------------------------------------------------------------
-- 4. TRIGGERS DE TIMESTAMPS, ISOLAMENTO E SINCRONIA REALTIME
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_digital_menu_settings_updated_at ON public.digital_menu_settings;
CREATE TRIGGER trg_digital_menu_settings_updated_at
  BEFORE UPDATE ON public.digital_menu_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_digital_menu_settings_lock_tenant ON public.digital_menu_settings;
CREATE TRIGGER trg_digital_menu_settings_lock_tenant
  BEFORE UPDATE ON public.digital_menu_settings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_online_orders_updated_at ON public.online_orders;
CREATE TRIGGER trg_online_orders_updated_at
  BEFORE UPDATE ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_online_orders_lock_tenant ON public.online_orders;
CREATE TRIGGER trg_online_orders_lock_tenant
  BEFORE UPDATE ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

CREATE OR REPLACE FUNCTION public.sync_online_order_realtime_ping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.online_order_realtime_pings (order_id, token_hash, status, updated_at)
  VALUES (NEW.id, NEW.tracking_token_hash, NEW.status, now())
  ON CONFLICT (order_id) DO UPDATE
  SET
    status = EXCLUDED.status,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_online_orders_sync_realtime_ping ON public.online_orders;
CREATE TRIGGER trg_online_orders_sync_realtime_ping
  AFTER INSERT OR UPDATE OF status, rejection_reason, updated_at ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_online_order_realtime_ping();

-- ----------------------------------------------------------------------------
-- 5. FUNCOES RPC PUBLICAS E ADMINISTRATIVAS (PRECO NO SERVIDOR E IDEMPOTENCIA)
-- ----------------------------------------------------------------------------

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
    'products', CASE WHEN v_menu.is_active THEN v_products ELSE '[]'::jsonb END,
    'combos', CASE WHEN v_menu.is_active THEN v_combos ELSE '[]'::jsonb END
  );
END;
$$;

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
  IF v_fulfillment = 'pickup' THEN
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

  v_delivery_fee := CASE WHEN v_fulfillment = 'delivery' THEN v_menu.delivery_fee ELSE 0 END;
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
      'createdAt', v_order.created_at,
      'updatedAt', v_order.updated_at,
      'items', v_items,
      'statusHistory', v_history
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_online_order_viewed(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.online_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.';
  END IF;

  SELECT * INTO v_order FROM public.online_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT public.has_tenant_role(v_order.tenant_id, ARRAY['owner', 'admin', 'manager', 'staff']) THEN
    RAISE EXCEPTION 'Sem permissao para visualizar pedidos deste estabelecimento.';
  END IF;

  UPDATE public.online_orders
  SET viewed_at = COALESCE(viewed_at, now())
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_online_order_status(
  p_order_id uuid,
  p_next_status text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid;
  v_order public.online_orders%ROWTYPE;
  v_next text;
  v_reason text;
  v_allowed boolean := false;
  v_sale_items jsonb := '[]'::jsonb;
  v_item public.online_order_items%ROWTYPE;
  v_xsalada_total integer := 0;
  v_combos_total integer := 0;
  v_units_total integer := 0;
  v_has_combo boolean := false;
  v_has_product boolean := false;
  v_sale_mode text;
  v_sale_qty integer;
  v_sale_unit_price numeric(12, 2);
  v_sale_payment text;
  v_sale_date date;
  v_sale_id uuid;
  v_note text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.';
  END IF;

  SELECT * INTO v_order
  FROM public.online_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido online nao encontrado.';
  END IF;

  IF NOT public.has_tenant_role(v_order.tenant_id, ARRAY['owner', 'admin', 'manager', 'staff']) THEN
    RAISE EXCEPTION 'Sem permissao para atualizar pedidos deste estabelecimento.';
  END IF;

  v_next := lower(btrim(coalesce(p_next_status, '')));
  v_reason := left(btrim(coalesce(p_reason, '')), 300);

  IF v_order.status IN ('completed', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Este pedido ja foi finalizado e nao pode mais mudar de status.';
  END IF;

  IF v_next IN ('rejected', 'cancelled') AND char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo para recusar ou cancelar o pedido.';
  END IF;

  v_allowed := CASE
    WHEN v_order.status = 'received' AND v_next IN ('accepted', 'rejected', 'cancelled') THEN true
    WHEN v_order.status = 'accepted' AND v_next IN ('preparing', 'cancelled') THEN true
    WHEN v_order.status = 'preparing' AND v_next IN ('ready', 'cancelled') THEN true
    WHEN v_order.status = 'ready' AND v_order.fulfillment_type = 'delivery' AND v_next IN ('out_for_delivery', 'cancelled') THEN true
    WHEN v_order.status = 'ready' AND v_order.fulfillment_type = 'pickup' AND v_next IN ('ready_for_pickup', 'cancelled') THEN true
    WHEN v_order.status IN ('out_for_delivery', 'ready_for_pickup') AND v_next IN ('completed', 'cancelled') THEN true
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Transicao de status invalida (% -> %).', v_order.status, v_next;
  END IF;

  UPDATE public.online_orders
  SET
    status = v_next,
    viewed_at = COALESCE(viewed_at, now()),
    rejection_reason = CASE WHEN v_next IN ('rejected', 'cancelled') THEN v_reason ELSE rejection_reason END,
    accepted_at = CASE WHEN v_next = 'accepted' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
    preparing_at = CASE WHEN v_next = 'preparing' THEN COALESCE(preparing_at, now()) ELSE preparing_at END,
    ready_at = CASE WHEN v_next = 'ready' THEN COALESCE(ready_at, now()) ELSE ready_at END,
    dispatched_at = CASE WHEN v_next IN ('out_for_delivery', 'ready_for_pickup') THEN COALESCE(dispatched_at, now()) ELSE dispatched_at END,
    completed_at = CASE WHEN v_next = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
    cancelled_at = CASE WHEN v_next IN ('rejected', 'cancelled') THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
    updated_at = now()
  WHERE id = v_order.id;

  INSERT INTO public.online_order_status_history (
    order_id, tenant_id, from_status, to_status, reason, changed_by, actor_type
  )
  VALUES (
    v_order.id,
    v_order.tenant_id,
    v_order.status,
    v_next,
    CASE
      WHEN v_next IN ('rejected', 'cancelled') THEN v_reason
      WHEN v_next = 'accepted' THEN 'Pedido aceito pelo estabelecimento.'
      WHEN v_next = 'preparing' THEN 'Pedido em preparação.'
      WHEN v_next = 'ready' THEN 'Pedido pronto.'
      WHEN v_next = 'out_for_delivery' THEN 'Pedido saiu para entrega.'
      WHEN v_next = 'ready_for_pickup' THEN 'Pedido disponível para retirada.'
      WHEN v_next = 'completed' THEN 'Pedido concluído e registrado no financeiro.'
      ELSE ''
    END,
    v_uid,
    'admin'
  );

  -- Ao concluir, cria exatamente UM lancamento idempotente em public.sales
  IF v_next = 'completed' AND v_order.sale_id IS NULL THEN
    FOR v_item IN
      SELECT * FROM public.online_order_items WHERE order_id = v_order.id ORDER BY created_at ASC
    LOOP
      v_xsalada_total := v_xsalada_total + (v_item.x_saladas_per_unit * v_item.quantity);
      v_units_total := v_units_total + v_item.quantity;
      IF v_item.item_kind = 'combo' THEN
        v_has_combo := true;
        v_combos_total := v_combos_total + v_item.quantity;
      ELSE
        v_has_product := true;
      END IF;

      v_sale_items := v_sale_items || jsonb_build_array(
        jsonb_build_object(
          'kind', v_item.item_kind,
          'refId', v_item.ref_id::text,
          'name', v_item.item_name,
          'quantity', v_item.quantity,
          'unitPrice', v_item.unit_price,
          'lineTotal', v_item.line_total,
          'estimatedUnitCost', v_item.estimated_unit_cost,
          'xSaladasPerUnit', v_item.x_saladas_per_unit,
          'components', v_item.components
        )
      );
    END LOOP;

    v_sale_mode := CASE
      WHEN v_has_combo AND v_has_product THEN 'mixed'
      WHEN v_has_combo THEN 'combo'
      ELSE 'individual'
    END;
    v_sale_qty := greatest(1, CASE WHEN v_xsalada_total > 0 THEN v_xsalada_total ELSE v_units_total END);
    v_sale_unit_price := round(v_order.total_amount / v_sale_qty, 2);
    v_sale_payment := CASE WHEN v_order.payment_method = 'Cartão' THEN 'Cartão de crédito' ELSE v_order.payment_method END;
    v_sale_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_note := left(
      'Pedido #' || lpad(v_order.order_number::text, 4, '0') || ' · ' || v_order.customer_name ||
      CASE WHEN v_order.customer_note <> '' THEN ' · ' || v_order.customer_note ELSE '' END,
      240
    );

    INSERT INTO public.sales (
      tenant_id,
      date,
      quantity,
      unit_price,
      total_amount,
      payment_method,
      note,
      sale_mode,
      x_salada_count,
      combos_count,
      items,
      sale_origin,
      online_order_id,
      delivery_fee
    )
    VALUES (
      v_order.tenant_id,
      v_sale_date,
      v_sale_qty,
      v_sale_unit_price,
      v_order.total_amount,
      v_sale_payment,
      v_note,
      v_sale_mode,
      v_xsalada_total,
      v_combos_total,
      v_sale_items,
      'online',
      v_order.id,
      v_order.delivery_fee
    )
    ON CONFLICT (online_order_id) DO NOTHING
    RETURNING id INTO v_sale_id;

    IF v_sale_id IS NULL THEN
      SELECT id INTO v_sale_id FROM public.sales WHERE online_order_id = v_order.id;
    END IF;

    UPDATE public.online_orders
    SET sale_id = v_sale_id
    WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'status', v_next,
    'saleId', v_sale_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_digital_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_public_online_order(text, text, text, text, text, text, text, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_online_order(text, text, text, text, text, text, text, numeric, text, jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_public_order_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_by_token(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_online_order_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_online_order_viewed(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transition_online_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_online_order_status(uuid, text, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) E REALTIME
-- ----------------------------------------------------------------------------

ALTER TABLE public.digital_menu_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_realtime_pings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.digital_menu_settings,
  public.online_orders,
  public.online_order_items,
  public.online_order_status_history,
  public.online_order_realtime_pings
FROM anon, authenticated;

-- Cliente anonimo tem acesso SOMENTE a online_order_realtime_pings (sem PII) para escutar eventos Realtime
GRANT SELECT ON TABLE public.online_order_realtime_pings TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.digital_menu_settings TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.online_orders TO authenticated;
GRANT SELECT ON TABLE public.online_order_items TO authenticated;
GRANT SELECT ON TABLE public.online_order_status_history TO authenticated;

-- digital_menu_settings
DROP POLICY IF EXISTS digital_menu_settings_select_member ON public.digital_menu_settings;
CREATE POLICY digital_menu_settings_select_member
  ON public.digital_menu_settings
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS digital_menu_settings_insert_managers ON public.digital_menu_settings;
CREATE POLICY digital_menu_settings_insert_managers
  ON public.digital_menu_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS digital_menu_settings_update_managers ON public.digital_menu_settings;
CREATE POLICY digital_menu_settings_update_managers
  ON public.digital_menu_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager']));

-- online_orders (leitura exclusiva para equipe do estabelecimento)
DROP POLICY IF EXISTS online_orders_select_member ON public.online_orders;
CREATE POLICY online_orders_select_member
  ON public.online_orders
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS online_orders_update_member ON public.online_orders;
CREATE POLICY online_orders_update_member
  ON public.online_orders
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager', 'staff']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin', 'manager', 'staff']));

-- online_order_items
DROP POLICY IF EXISTS online_order_items_select_member ON public.online_order_items;
CREATE POLICY online_order_items_select_member
  ON public.online_order_items
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- online_order_status_history
DROP POLICY IF EXISTS online_order_status_history_select_member ON public.online_order_status_history;
CREATE POLICY online_order_status_history_select_member
  ON public.online_order_status_history
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- online_order_realtime_pings (sem PII: apenas token_hash + status)
DROP POLICY IF EXISTS online_order_realtime_pings_select_all ON public.online_order_realtime_pings;
CREATE POLICY online_order_realtime_pings_select_all
  ON public.online_order_realtime_pings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Publicacao no Supabase Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.digital_menu_settings;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.online_orders;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.online_order_items;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.online_order_status_history;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.online_order_realtime_pings;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;

COMMIT;
