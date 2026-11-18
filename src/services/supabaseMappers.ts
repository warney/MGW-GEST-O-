import {
  type ComboInput,
  type ComboProductItem,
  type ComboRecord,
  DEFAULT_SHOP_SETTINGS,
  type DigitalMenuSettings,
  type DigitalMenuSettingsInput,
  type DeliveryZone,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseRecord,
  normalizePaymentMethod,
  type OnlineOrderFulfillment,
  type OnlineOrderItemSnapshot,
  type OnlineOrderPaymentMethod,
  type OnlineOrderRecord,
  type OnlineOrderStatus,
  type OnlineOrderStatusEvent,
  PRODUCT_CATEGORIES,
  type ProductCategory,
  type ProductInput,
  type ProductRecord,
  type PublicCatalogCombo,
  type PublicCatalogProduct,
  type PublicDigitalMenuPayload,
  type PublicOrderTrackingRecord,
  type SaleInput,
  type SaleLineComponentSnapshot,
  type SaleLineItemSnapshot,
  type SaleMode,
  type SaleOrigin,
  type SaleRecord,
  type ShopSettings,
  type SubscriptionStatus,
  type TenantContext,
  type TenantRole,
} from '../types/finance';
import { calculateSaleTotal, roundCurrency } from '../utils/finance';
import { formatOrderNumber, sanitizeMenuSlug } from '../utils/onlineOrders';
import { normalizeSubscriptionStatus, normalizeTenantRole } from './rbacPolicy';

export interface SupabaseTenantRow {
  id: string;
  slug: string;
  name: string;
  is_founder_account: boolean;
  billing_exempt: boolean;
  status: string;
}

export interface SupabaseSubscriptionRow {
  status: string;
  grace_until: string | null;
  trial_ends_at?: string | null;
}

export interface SupabaseTenantMemberRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  email: string;
  role: string;
  is_founder: boolean;
  active: boolean;
  tenants: SupabaseTenantRow | SupabaseTenantRow[] | null;
}

export interface SupabaseShopSettingsRow {
  tenant_id: string;
  owner_email: string | null;
  establishment_name: string;
  x_salada_price: number | string;
  daily_goal: number | string;
  monthly_goal: number | string;
  start_date: string;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseProductRow {
  id: string;
  tenant_id: string;
  legacy_id?: string | null;
  owner_email?: string | null;
  name: string;
  category: string;
  unit_price: number | string;
  counts_as_x_salada: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupabaseComboRow {
  id: string;
  tenant_id: string;
  legacy_id?: string | null;
  owner_email?: string | null;
  name: string;
  description: string;
  items: unknown;
  sale_price: number | string;
  estimated_cost: number | string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupabaseSaleRow {
  id: string;
  tenant_id: string;
  legacy_id?: string | null;
  owner_email?: string | null;
  date: string;
  quantity: number | string;
  unit_price: number | string;
  total_amount: number | string;
  payment_method: string;
  note: string;
  sale_mode?: string | null;
  x_salada_count?: number | null;
  combos_count?: number | null;
  items?: unknown;
  sale_origin?: string | null;
  online_order_id?: string | null;
  delivery_fee?: number | string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseDigitalMenuSettingsRow {
  tenant_id: string;
  slug: string;
  is_active: boolean;
  is_open: boolean;
  store_name: string;
  description: string;
  phone_whatsapp: string;
  address: string;
  opening_hours: string;
  delivery_fee: number | string;
  minimum_order_amount: number | string;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseOnlineOrderItemRow {
  id: string;
  order_id: string;
  tenant_id: string;
  item_kind: string;
  ref_id: string;
  item_name: string;
  quantity: number;
  unit_price: number | string;
  line_total: number | string;
  estimated_unit_cost: number | string;
  x_saladas_per_unit: number;
  components: unknown;
  item_note: string;
  created_at?: string;
}

export interface SupabaseOnlineOrderStatusHistoryRow {
  id: string;
  order_id: string;
  tenant_id: string;
  from_status: string | null;
  to_status: string;
  reason: string;
  actor_type?: string | null;
  created_at: string;
}

export interface SupabaseOnlineOrderRow {
  id: string;
  tenant_id: string;
  order_number: number;
  order_code: string;
  tracking_token_hash: string;
  status: string;
  fulfillment_type: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_reference: string;
  payment_method: string;
  change_for: number | string | null;
  customer_note: string;
  subtotal_amount: number | string;
  delivery_fee: number | string;
  total_amount: number | string;
  rejection_reason: string;
  viewed_at: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  sale_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseExpenseRow {
  id: string;
  tenant_id: string;
  legacy_id?: string | null;
  owner_email?: string | null;
  description: string;
  amount: number | string;
  category: string;
  date: string;
  payment_method: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export function isoTimestampToMs(value: unknown): number {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

export function sanitizeDateYYYYMMDD(value: string): string {
  const trimmed = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  throw new Error('Data inválida. Use o formato AAAA-MM-DD.');
}

export function parseComboItemsSafe(raw: unknown): ComboProductItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .slice(0, 30)
    .map((entry) => ({
      productId: String(entry.productId || ''),
      productName: String(entry.productName || 'Produto'),
      quantity: Math.max(1, Math.trunc(Number(entry.quantity) || 1)),
      countsAsXSalada: Boolean(entry.countsAsXSalada),
    }));
}

export function parseSaleItemsSafe(raw: unknown): SaleLineItemSnapshot[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed = raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .slice(0, 50)
    .map((entry) => {
      const compsRaw = Array.isArray(entry.components) ? entry.components : [];
      const components = compsRaw
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
        .slice(0, 30)
        .map((c) => ({
          productId: String(c.productId || ''),
          productName: String(c.productName || 'Produto'),
          quantityPerUnit: Math.max(1, Math.trunc(Number(c.quantityPerUnit) || 1)),
          totalQuantity: Math.max(1, Math.trunc(Number(c.totalQuantity) || 1)),
          countsAsXSalada: Boolean(c.countsAsXSalada),
        }));

      return {
        kind: (entry.kind === 'combo' ? 'combo' : 'product') as 'combo' | 'product',
        refId: String(entry.refId || ''),
        name: String(entry.name || 'Item'),
        quantity: Math.max(1, Math.trunc(Number(entry.quantity) || 1)),
        unitPrice: Number(entry.unitPrice) || 0,
        lineTotal: Number(entry.lineTotal) || 0,
        estimatedUnitCost: Number(entry.estimatedUnitCost) || 0,
        xSaladasPerUnit: Math.max(0, Math.trunc(Number(entry.xSaladasPerUnit) || 0)),
        components,
      };
    });
  return parsed.length > 0 ? parsed : undefined;
}

export function mapShopSettingsRow(
  row: SupabaseShopSettingsRow,
  fallbackOwnerId = '',
): ShopSettings {
  return {
    ownerId: String(row.owner_email || fallbackOwnerId || row.tenant_id),
    establishmentName: String(row.establishment_name || DEFAULT_SHOP_SETTINGS.establishmentName),
    xSaladaPrice: Number(row.x_salada_price) || DEFAULT_SHOP_SETTINGS.xSaladaPrice,
    dailyGoal: Number(row.daily_goal) || 0,
    monthlyGoal: Number(row.monthly_goal) || 0,
    startDate: String(row.start_date || DEFAULT_SHOP_SETTINGS.startDate).slice(0, 10),
  };
}

export function mapProductRow(row: SupabaseProductRow): ProductRecord {
  const category = PRODUCT_CATEGORIES.includes(row.category as ProductCategory)
    ? (row.category as ProductCategory)
    : 'Outro';

  return {
    id: row.id,
    ownerId: String(row.owner_email || row.tenant_id),
    name: String(row.name || ''),
    category,
    unitPrice: Number(row.unit_price) || 0,
    countsAsXSalada: Boolean(row.counts_as_x_salada),
    active: row.active !== false,
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function mapComboRow(row: SupabaseComboRow): ComboRecord {
  return {
    id: row.id,
    ownerId: String(row.owner_email || row.tenant_id),
    name: String(row.name || ''),
    description: String(row.description || ''),
    items: parseComboItemsSafe(row.items),
    salePrice: Number(row.sale_price) || 0,
    estimatedCost: Number(row.estimated_cost) || 0,
    active: row.active !== false,
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function mapSaleRow(row: SupabaseSaleRow): SaleRecord {
  const saleMode: SaleMode | undefined =
    row.sale_mode === 'combo' ||
    row.sale_mode === 'mixed' ||
    row.sale_mode === 'individual'
      ? row.sale_mode
      : undefined;

  const saleOrigin: SaleOrigin = row.sale_origin === 'online' ? 'online' : 'manual';

  return {
    id: row.id,
    ownerId: String(row.owner_email || row.tenant_id),
    date: String(row.date || '').slice(0, 10),
    quantity: Number(row.quantity) || 0,
    unitPrice: Number(row.unit_price) || 0,
    totalAmount: Number(row.total_amount) || 0,
    paymentMethod: normalizePaymentMethod(row.payment_method),
    note: String(row.note || ''),
    saleMode,
    xSaladaCount:
      typeof row.x_salada_count === 'number' ? row.x_salada_count : undefined,
    combosCount:
      typeof row.combos_count === 'number' ? row.combos_count : undefined,
    items: parseSaleItemsSafe(row.items),
    saleOrigin,
    onlineOrderId: row.online_order_id ?? null,
    deliveryFee:
      row.delivery_fee !== undefined && row.delivery_fee !== null
        ? Number(row.delivery_fee) || 0
        : 0,
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function mapExpenseRow(row: SupabaseExpenseRow): ExpenseRecord {
  const category = EXPENSE_CATEGORIES.includes(row.category as ExpenseCategory)
    ? (row.category as ExpenseCategory)
    : 'Outros';

  return {
    id: row.id,
    ownerId: String(row.owner_email || row.tenant_id),
    description: String(row.description || ''),
    amount: Number(row.amount) || 0,
    category,
    date: String(row.date || '').slice(0, 10),
    paymentMethod: normalizePaymentMethod(row.payment_method),
    note: String(row.note || ''),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function buildSalePayloadForSupabase(
  input: SaleInput,
): {
  date: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  payment_method: string;
  note: string;
  sale_mode: SaleMode | null;
  x_salada_count: number | null;
  combos_count: number | null;
  items: SaleLineItemSnapshot[] | null;
  sale_origin: SaleOrigin;
  online_order_id: string | null;
  delivery_fee: number;
} {
  const quantity = Math.max(1, Math.trunc(Number(input.quantity)));
  const totalAmount =
    input.items && input.items.length > 0
      ? roundCurrency(input.items.reduce((acc, item) => acc + item.lineTotal, 0))
      : calculateSaleTotal(quantity, roundCurrency(Number(input.unitPrice)));
  const unitPrice =
    input.items && input.items.length > 0
      ? roundCurrency(totalAmount / quantity)
      : roundCurrency(Number(input.unitPrice));
  const date = sanitizeDateYYYYMMDD(input.date);
  const note = input.note.trim().slice(0, 240);

  if (quantity < 1 || quantity > 10000) {
    throw new Error('A quantidade deve ser de pelo menos 1 item.');
  }
  if (unitPrice <= 0 || totalAmount <= 0) {
    throw new Error('O valor total da venda deve ser maior que zero.');
  }

  return {
    date,
    quantity,
    unit_price: unitPrice,
    total_amount: totalAmount,
    payment_method: normalizePaymentMethod(input.paymentMethod),
    note,
    sale_mode: input.saleMode ?? null,
    x_salada_count:
      typeof input.xSaladaCount === 'number'
        ? Math.max(0, Math.trunc(input.xSaladaCount))
        : null,
    combos_count:
      typeof input.combosCount === 'number'
        ? Math.max(0, Math.trunc(input.combosCount))
        : null,
    items: input.items && input.items.length > 0 ? input.items.slice(0, 50) : null,
    sale_origin: input.saleOrigin === 'online' ? 'online' : 'manual',
    online_order_id: input.onlineOrderId ?? null,
    delivery_fee: roundCurrency(Math.max(0, Number(input.deliveryFee || 0))),
  };
}

export function buildExpensePayloadForSupabase(input: ExpenseInput): {
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  payment_method: string;
  note: string;
} {
  const description = input.description.trim().slice(0, 160);
  const amount = roundCurrency(Number(input.amount));
  const date = sanitizeDateYYYYMMDD(input.date);
  const note = input.note.trim().slice(0, 240);

  if (!description) {
    throw new Error('Informe a descrição da despesa.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('O valor da despesa deve ser maior que zero.');
  }

  return {
    description,
    amount,
    category: EXPENSE_CATEGORIES.includes(input.category) ? input.category : 'Outros',
    date,
    payment_method: normalizePaymentMethod(input.paymentMethod),
    note,
  };
}

export function buildProductPayloadForSupabase(input: ProductInput): {
  name: string;
  category: ProductCategory;
  unit_price: number;
  counts_as_x_salada: boolean;
  active: boolean;
} {
  const name = input.name.trim().slice(0, 80);
  const unitPrice = roundCurrency(Math.max(0, Number(input.unitPrice)));

  if (!name) {
    throw new Error('Informe o nome do produto.');
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 10000) {
    throw new Error('Informe um preço válido para o produto.');
  }

  return {
    name,
    category: PRODUCT_CATEGORIES.includes(input.category) ? input.category : 'Outro',
    unit_price: unitPrice,
    counts_as_x_salada: Boolean(input.countsAsXSalada),
    active: Boolean(input.active),
  };
}

export function buildComboPayloadForSupabase(input: ComboInput): {
  name: string;
  description: string;
  items: ComboProductItem[];
  sale_price: number;
  estimated_cost: number;
  active: boolean;
} {
  const name = input.name.trim().slice(0, 80);
  const description = input.description.trim().slice(0, 240);
  const salePrice = roundCurrency(Number(input.salePrice));
  const estimatedCost = roundCurrency(Math.max(0, Number(input.estimatedCost || 0)));
  const cleanItems = input.items
    .filter((i) => i.productId && i.quantity >= 1)
    .slice(0, 30)
    .map((i) => ({
      productId: i.productId,
      productName: i.productName.trim().slice(0, 80),
      quantity: Math.max(1, Math.trunc(i.quantity)),
      countsAsXSalada: Boolean(i.countsAsXSalada),
    }));

  if (!name) {
    throw new Error('Informe o nome do combo.');
  }
  if (cleanItems.length === 0) {
    throw new Error('Adicione pelo menos 1 produto ao combo.');
  }
  if (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice > 100000) {
    throw new Error('Informe um preço de venda válido para o combo.');
  }

  return {
    name,
    description,
    items: cleanItems,
    sale_price: salePrice,
    estimated_cost: estimatedCost,
    active: Boolean(input.active),
  };
}

export function buildSettingsPayloadForSupabase(input: Omit<ShopSettings, 'ownerId'>): {
  establishment_name: string;
  x_salada_price: number;
  daily_goal: number;
  monthly_goal: number;
  start_date: string;
} {
  const establishmentName = input.establishmentName.trim().slice(0, 80);
  const xSaladaPrice = roundCurrency(Number(input.xSaladaPrice));
  const dailyGoal = roundCurrency(Math.max(0, Number(input.dailyGoal)));
  const monthlyGoal = roundCurrency(Math.max(0, Number(input.monthlyGoal)));
  const startDate = sanitizeDateYYYYMMDD(input.startDate);

  if (!establishmentName) {
    throw new Error('Informe o nome do estabelecimento.');
  }
  if (!Number.isFinite(xSaladaPrice) || xSaladaPrice <= 0 || xSaladaPrice > 10000) {
    throw new Error('Informe um preço válido para o X-Salada.');
  }

  return {
    establishment_name: establishmentName,
    x_salada_price: xSaladaPrice,
    daily_goal: dailyGoal,
    monthly_goal: monthlyGoal,
    start_date: startDate,
  };
}

export function hasActiveTenantBillingAccess(
  tenant: Pick<SupabaseTenantRow, 'billing_exempt' | 'status'>,
  subscription: SupabaseSubscriptionRow | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (tenant.status !== 'active') return false;
  if (tenant.billing_exempt) return true;
  if (!subscription) return false;
  if (
    subscription.status === 'exempt' ||
    subscription.status === 'authorized' ||
    subscription.status === 'free'
  ) {
    return true;
  }
  if (subscription.status === 'trialing') {
    if (!subscription.trial_ends_at) return true;
    const trialEndMs = Date.parse(subscription.trial_ends_at);
    return Number.isFinite(trialEndMs) && trialEndMs > nowMs;
  }
  if (subscription.status === 'paused' && subscription.grace_until) {
    const graceMs = Date.parse(subscription.grace_until);
    return Number.isFinite(graceMs) && graceMs > nowMs;
  }
  return false;
}

export function buildTenantContextFromRows(
  member: SupabaseTenantMemberRow,
  subscription: SupabaseSubscriptionRow | null | undefined,
): TenantContext | null {
  const tenantRaw = Array.isArray(member.tenants)
    ? member.tenants[0]
    : member.tenants;
  if (!tenantRaw || !member.active || tenantRaw.status !== 'active') {
    return null;
  }

  const role: TenantRole = normalizeTenantRole(member.role);
  const subStatus: SubscriptionStatus = normalizeSubscriptionStatus(
    subscription?.status,
    Boolean(tenantRaw.billing_exempt),
  );

  return {
    tenantId: tenantRaw.id,
    slug: tenantRaw.slug,
    name: tenantRaw.name,
    role,
    isFounderAccount: Boolean(tenantRaw.is_founder_account),
    billingExempt: Boolean(tenantRaw.billing_exempt),
    subscriptionStatus: subStatus,
    graceUntil: subscription?.grace_until ?? null,
  };
}

export function mapSupabaseAuthErrorMessage(error: unknown): string {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Erro ao autenticar.';
  const lower = msg.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.';
  }
  if (lower.includes('jwt expired') || lower.includes('session_not_found') || lower.includes('refresh_token_not_found')) {
    return 'Sua sessão expirou. Faça login novamente.';
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.';
  }
  return msg;
}

// ==================== CARDAPIO DIGITAL & PEDIDOS ONLINE ====================

const VALID_ONLINE_STATUSES: ReadonlySet<OnlineOrderStatus> = new Set([
  'received',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'ready_for_pickup',
  'completed',
  'rejected',
  'cancelled',
]);

export function normalizeOnlineOrderStatus(raw: unknown): OnlineOrderStatus {
  const s = String(raw || '').trim().toLowerCase() as OnlineOrderStatus;
  return VALID_ONLINE_STATUSES.has(s) ? s : 'received';
}

export function normalizeOnlinePaymentMethod(raw: unknown): OnlineOrderPaymentMethod {
  const s = String(raw || '').trim();
  if (s === 'Pix') return 'Pix';
  if (s === 'Dinheiro') return 'Dinheiro';
  return 'Cartão';
}

export function normalizeOnlineFulfillment(raw: unknown): OnlineOrderFulfillment {
  return String(raw || '').trim().toLowerCase() === 'pickup' ? 'pickup' : 'delivery';
}

export function mapDigitalMenuSettingsRow(
  row: SupabaseDigitalMenuSettingsRow,
): DigitalMenuSettings {
  return {
    tenantId: row.tenant_id,
    slug: sanitizeMenuSlug(row.slug || 'mgw_lanches'),
    isActive: Boolean(row.is_active),
    isOpen: row.is_open !== false,
    storeName: String(row.store_name || 'MGW Lanches'),
    description: String(row.description || ''),
    phoneWhatsapp: String(row.phone_whatsapp || ''),
    address: String(row.address || ''),
    openingHours: String(row.opening_hours || ''),
    deliveryFee: roundCurrency(Math.max(0, Number(row.delivery_fee) || 0)),
    minimumOrderAmount: roundCurrency(Math.max(0, Number(row.minimum_order_amount) || 0)),
    acceptsDelivery: row.accepts_delivery !== false,
    acceptsPickup: row.accepts_pickup !== false,
    updatedAtMs: row.updated_at ? isoTimestampToMs(row.updated_at) : undefined,
  };
}

export function buildDigitalMenuSettingsPayloadForSupabase(
  input: DigitalMenuSettingsInput,
): {
  slug: string;
  is_active: boolean;
  is_open: boolean;
  store_name: string;
  description: string;
  phone_whatsapp: string;
  address: string;
  opening_hours: string;
  delivery_fee: number;
  minimum_order_amount: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
} {
  const storeName = input.storeName.trim().slice(0, 80);
  if (!storeName) {
    throw new Error('Informe o nome da loja no cardápio digital.');
  }
  const acceptsDelivery = Boolean(input.acceptsDelivery);
  const acceptsPickup = Boolean(input.acceptsPickup);
  if (!acceptsDelivery && !acceptsPickup) {
    throw new Error('Ative pelo menos Entrega ou Retirada no local.');
  }

  return {
    slug: sanitizeMenuSlug(input.slug),
    is_active: Boolean(input.isActive),
    is_open: Boolean(input.isOpen),
    store_name: storeName,
    description: input.description.trim().slice(0, 300),
    phone_whatsapp: input.phoneWhatsapp.trim().slice(0, 32),
    address: input.address.trim().slice(0, 240),
    opening_hours: input.openingHours.trim().slice(0, 160),
    delivery_fee: roundCurrency(Math.max(0, Math.min(1000, Number(input.deliveryFee) || 0))),
    minimum_order_amount: roundCurrency(
      Math.max(0, Math.min(10000, Number(input.minimumOrderAmount) || 0)),
    ),
    accepts_delivery: acceptsDelivery,
    accepts_pickup: acceptsPickup,
  };
}

function parseOrderItemComponents(raw: unknown): SaleLineComponentSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .slice(0, 30)
    .map((entry) => ({
      productId: String(entry.productId || ''),
      productName: String(entry.productName || 'Produto'),
      quantityPerUnit: Math.max(1, Math.trunc(Number(entry.quantityPerUnit) || 1)),
      totalQuantity: Math.max(1, Math.trunc(Number(entry.totalQuantity) || 1)),
      countsAsXSalada: Boolean(entry.countsAsXSalada),
    }));
}

export function mapOnlineOrderItemRow(
  row: SupabaseOnlineOrderItemRow,
): OnlineOrderItemSnapshot {
  return {
    id: row.id,
    itemKind: row.item_kind === 'combo' ? 'combo' : 'product',
    refId: row.ref_id,
    itemName: String(row.item_name || 'Item'),
    quantity: Math.max(1, Math.trunc(Number(row.quantity) || 1)),
    unitPrice: roundCurrency(Number(row.unit_price) || 0),
    lineTotal: roundCurrency(Number(row.line_total) || 0),
    estimatedUnitCost: roundCurrency(Math.max(0, Number(row.estimated_unit_cost) || 0)),
    xSaladasPerUnit: Math.max(0, Math.trunc(Number(row.x_saladas_per_unit) || 0)),
    components: parseOrderItemComponents(row.components),
    itemNote: String(row.item_note || ''),
  };
}

export function mapOnlineOrderStatusHistoryRow(
  row: SupabaseOnlineOrderStatusHistoryRow,
): OnlineOrderStatusEvent {
  const actorType =
    row.actor_type === 'customer' || row.actor_type === 'admin'
      ? row.actor_type
      : 'system';
  return {
    id: row.id,
    fromStatus: row.from_status ? normalizeOnlineOrderStatus(row.from_status) : null,
    toStatus: normalizeOnlineOrderStatus(row.to_status),
    reason: String(row.reason || ''),
    actorType,
    createdAtMs: isoTimestampToMs(row.created_at),
  };
}

export function mapOnlineOrderRow(
  row: SupabaseOnlineOrderRow,
  items: OnlineOrderItemSnapshot[],
  statusHistory: OnlineOrderStatusEvent[],
): OnlineOrderRecord {
  const orderNumber = Math.max(1, Math.trunc(Number(row.order_number) || 1));
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderNumber,
    orderCode: String(row.order_code || formatOrderNumber(orderNumber)),
    tokenHash: String(row.tracking_token_hash || ''),
    status: normalizeOnlineOrderStatus(row.status),
    fulfillmentType: normalizeOnlineFulfillment(row.fulfillment_type),
    customerName: String(row.customer_name || ''),
    customerPhone: String(row.customer_phone || ''),
    deliveryAddress: String(row.delivery_address || ''),
    deliveryReference: String(row.delivery_reference || ''),
    paymentMethod: normalizeOnlinePaymentMethod(row.payment_method),
    changeFor:
      row.change_for !== null && row.change_for !== undefined
        ? roundCurrency(Number(row.change_for) || 0)
        : null,
    customerNote: String(row.customer_note || ''),
    subtotalAmount: roundCurrency(Number(row.subtotal_amount) || 0),
    deliveryFee: roundCurrency(Number(row.delivery_fee) || 0),
    totalAmount: roundCurrency(Number(row.total_amount) || 0),
    rejectionReason: String(row.rejection_reason || ''),
    viewedAtMs: row.viewed_at ? isoTimestampToMs(row.viewed_at) : null,
    acceptedAtMs: row.accepted_at ? isoTimestampToMs(row.accepted_at) : null,
    preparingAtMs: row.preparing_at ? isoTimestampToMs(row.preparing_at) : null,
    readyAtMs: row.ready_at ? isoTimestampToMs(row.ready_at) : null,
    dispatchedAtMs: row.dispatched_at ? isoTimestampToMs(row.dispatched_at) : null,
    completedAtMs: row.completed_at ? isoTimestampToMs(row.completed_at) : null,
    cancelledAtMs: row.cancelled_at ? isoTimestampToMs(row.cancelled_at) : null,
    saleId: row.sale_id ?? null,
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
    items,
    statusHistory,
  };
}

export function mapPublicDigitalMenuRpcResponse(raw: unknown): PublicDigitalMenuPayload {
  if (!raw || typeof raw !== 'object') {
    return { found: false, store: null, products: [], combos: [], deliveryZones: [] };
  }
  const obj = raw as Record<string, unknown>;
  if (!obj.found || !obj.store || typeof obj.store !== 'object') {
    return { found: false, store: null, products: [], combos: [] };
  }
  const st = obj.store as Record<string, unknown>;
  const store: DigitalMenuSettingsInput = {
    slug: sanitizeMenuSlug(String(st.slug || 'mgw_lanches')),
    isActive: Boolean(st.isActive),
    isOpen: Boolean(st.isOpen),
    storeName: String(st.storeName || 'MGW Lanches'),
    description: String(st.description || ''),
    phoneWhatsapp: String(st.phoneWhatsapp || ''),
    address: String(st.address || ''),
    openingHours: String(st.openingHours || ''),
    deliveryFee: roundCurrency(Math.max(0, Number(st.deliveryFee) || 0)),
    minimumOrderAmount: roundCurrency(Math.max(0, Number(st.minimumOrderAmount) || 0)),
    acceptsDelivery: st.acceptsDelivery !== false,
    acceptsPickup: st.acceptsPickup !== false,
  };

  const products: PublicCatalogProduct[] = Array.isArray(obj.products)
    ? obj.products
        .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
        .map((p) => {
          const cat = String(p.category || 'Outro');
          return {
            id: String(p.id || ''),
            name: String(p.name || ''),
            category: PRODUCT_CATEGORIES.includes(cat as ProductCategory)
              ? (cat as ProductCategory)
              : 'Outro',
            unitPrice: roundCurrency(Math.max(0, Number(p.unitPrice) || 0)),
            countsAsXSalada: Boolean(p.countsAsXSalada),
          };
        })
    : [];

  const combos: PublicCatalogCombo[] = Array.isArray(obj.combos)
    ? obj.combos
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
        .map((c) => ({
          id: String(c.id || ''),
          name: String(c.name || ''),
          description: String(c.description || ''),
          items: parseComboItemsSafe(c.items),
          salePrice: roundCurrency(Math.max(0, Number(c.salePrice) || 0)),
        }))
    : [];

  const deliveryZones: DeliveryZone[] = Array.isArray(obj.deliveryZones)
    ? obj.deliveryZones
        .filter((z): z is Record<string, unknown> => Boolean(z && typeof z === 'object'))
        .map((z, index) => ({
          id: String(z.id || ''),
          name: String(z.name || ''),
          deliveryFee: roundCurrency(Math.max(0, Number(z.fee) || 0)),
          active: true,
          sortOrder: index,
        }))
        .filter((z) => z.id && z.name)
    : [];

  return { found: true, store, products, combos, deliveryZones };
}

export function mapPublicOrderTrackingRpcResponse(
  raw: unknown,
): PublicOrderTrackingRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.found || !obj.order || typeof obj.order !== 'object') return null;

  const o = obj.order as Record<string, unknown>;
  const orderNumber = Math.max(1, Math.trunc(Number(o.orderNumber) || 1));

  const items = Array.isArray(o.items)
    ? o.items
        .filter((it): it is Record<string, unknown> => Boolean(it && typeof it === 'object'))
        .map((it) => ({
          id: String(it.id || ''),
          itemKind: (it.itemKind === 'combo' ? 'combo' : 'product') as 'product' | 'combo',
          refId: String(it.refId || ''),
          itemName: String(it.itemName || 'Item'),
          quantity: Math.max(1, Math.trunc(Number(it.quantity) || 1)),
          unitPrice: roundCurrency(Number(it.unitPrice) || 0),
          lineTotal: roundCurrency(Number(it.lineTotal) || 0),
          itemNote: String(it.itemNote || ''),
        }))
    : [];

  const statusHistory: OnlineOrderStatusEvent[] = Array.isArray(o.statusHistory)
    ? o.statusHistory
        .filter((h): h is Record<string, unknown> => Boolean(h && typeof h === 'object'))
        .map((h) => ({
          id: String(h.id || ''),
          fromStatus: h.fromStatus ? normalizeOnlineOrderStatus(h.fromStatus) : null,
          toStatus: normalizeOnlineOrderStatus(h.toStatus),
          reason: String(h.reason || ''),
          createdAtMs: isoTimestampToMs(h.createdAt),
        }))
    : [];

  return {
    orderId: String(o.orderId || ''),
    tokenHash: String(o.tokenHash || ''),
    orderNumber,
    orderCode: String(o.orderCode || formatOrderNumber(orderNumber)),
    status: normalizeOnlineOrderStatus(o.status),
    fulfillmentType: normalizeOnlineFulfillment(o.fulfillmentType),
    customerName: String(o.customerName || ''),
    deliveryAddress: String(o.deliveryAddress || ''),
    deliveryReference: String(o.deliveryReference || ''),
    paymentMethod: normalizeOnlinePaymentMethod(o.paymentMethod),
    changeFor:
      o.changeFor !== null && o.changeFor !== undefined
        ? roundCurrency(Number(o.changeFor) || 0)
        : null,
    customerNote: String(o.customerNote || ''),
    subtotalAmount: roundCurrency(Number(o.subtotalAmount) || 0),
    deliveryFee: roundCurrency(Number(o.deliveryFee) || 0),
    totalAmount: roundCurrency(Number(o.totalAmount) || 0),
    rejectionReason: String(o.rejectionReason || ''),
    storeName: String(o.storeName || 'MGW Lanches'),
    storeSlug: String(o.storeSlug || 'mgw_lanches'),
    storeWhatsapp: String(o.storeWhatsapp || ''),
    storeAddress: String(o.storeAddress || ''),
    createdAtMs: isoTimestampToMs(o.createdAt),
    updatedAtMs: isoTimestampToMs(o.updatedAt),
    items,
    statusHistory,
  };
}

