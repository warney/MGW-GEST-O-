import {
  type ComboComponentRecord,
  type ComboConsumptionItemSnapshot,
  type ComboConsumptionOriginType,
  type ComboConsumptionRecord,
  type ComboInput,
  type ComboProductItem,
  type ComboRecord,
  DEFAULT_SHOP_SETTINGS,
  type DeliveryCourierAvailability,
  type DeliveryCourierInput,
  type DeliveryCourierRecord,
  type DeliveryCourierStatus,
  type DeliveryCourierType,
  type DeliveryCustomerAddressInput,
  type DeliveryCustomerAddressRecord,
  type DeliveryCustomerClassificationConfig,
  type DeliveryCustomerInput,
  type DeliveryCustomerRecord,
  type DeliveryDispatchActorType,
  type DeliveryDispatchHistoryRecord,
  type DeliveryDispatchRecord,
  type DeliveryDispatchStatus,
  type DeliveryFeeRuleApplied,
  type DeliveryPricingMode,
  type DeliveryPricingSettings,
  type DeliveryPricingSettingsInput,
  type DeliveryRegionInput,
  type DeliveryRegionRecord,
  type DeliveryRegionStatus,
  type DigitalMenuSettings,
  type DigitalMenuSettingsInput,
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
  type ProductPackageType,
  type ProductRecord,
  type ProductSaleUnit,
  type ProductVolumeUnit,
  type PublicCatalogCombo,
  type PublicCatalogProduct,
  type PublicDeliveryPricingSettings,
  type PublicDeliveryRegion,
  type PublicDigitalMenuPayload,
  type PublicOrderTrackingRecord,
  type RetentionStatus,
  type SaleInput,
  type SaleLineComponentSnapshot,
  type SaleLineItemSnapshot,
  type SaleMode,
  type SaleOrigin,
  type SaleRecord,
  type ShopSettings,
  type SubscriptionStatus,
  type TenantBillingBlockReason,
  type TenantContext,
  type TenantRole,
  type InventoryBalanceRecord,
  type InventoryCountItemRecord,
  type InventoryCountRecord,
  type InventoryCountStatus,
  type InventoryMovementDirection,
  type InventoryMovementOriginType,
  type InventoryMovementRecord,
  type InventoryMovementType,
  type InventoryPackagingConversionInput,
  type InventoryPackagingConversionRecord,
  type ProductSupplierLinkInput,
  type ProductSupplierLinkRecord,
  type PurchaseOrderItemRecord,
  type PurchaseOrderRecord,
  type PurchaseOrderStatus,
  type PurchaseReceiptItemRecord,
  type PurchaseReceiptRecord,
  type SupplierInput,
  type SupplierRecord,
} from '../types/finance';
import {
  normalizeCourierPlateForStorage,
  normalizeCourierType,
} from '../utils/deliveryCouriers';
import {
  DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
  isValidCustomerPhone,
  isValidOptionalCpf,
  normalizeClassificationConfig,
  normalizeCustomerPhone,
} from '../utils/deliveryCustomers';
import {
  DEFAULT_DELIVERY_PRICING_SETTINGS,
  deduplicateNeighborhoods,
  isValidTimeHHMM,
  normalizeDeliveryGeoText,
} from '../utils/deliveryRegions';
import { calculateSaleTotal, DEFAULT_SHOP_TIMEZONE, roundCurrency } from '../utils/finance';
import {
  formatOrderNumber,
  normalizePixKeyInput,
  sanitizeMenuSlug,
} from '../utils/onlineOrders';
import {
  normalizeRetentionStatus,
  normalizeSubscriptionStatus,
  normalizeTenantRole,
} from './rbacPolicy';

import { normalizeBusinessSegment } from './segmentEngine';
import {
  hasExplicitUniversalProductFields,
  isValidBarcodeFormat,
  MAX_PRODUCT_MONEY_VALUE,
  MAX_PRODUCT_VOLUME_VALUE,
  MAX_UNITS_PER_PACKAGE,
  normalizeBarcodeInput,
  normalizePackageType,
  normalizeSaleUnit,
  normalizeVolumeUnit,
} from '../utils/universalProducts';

export interface SupabaseTenantRow {
  id: string;
  slug: string;
  name: string;
  is_founder_account: boolean;
  billing_exempt: boolean;
  status: string;
  onboarding_completed?: boolean;
  business_segment?: string | null;
}

export interface SupabaseSubscriptionRow {
  status: string;
  grace_until: string | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  ended_at?: string | null;
  retention_started_at?: string | null;
  retention_ends_at?: string | null;
  retention_status?: string | null;
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
  timezone?: string | null;
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
  image_url?: string | null;
  image_path?: string | null;
  description?: string | null;
  internal_code?: string | null;
  cost_price?: number | string | null;
  brand?: string | null;
  notes?: string | null;
  barcode?: string | null;
  volume_value?: number | string | null;
  volume_unit?: string | null;
  sale_unit?: string | null;
  package_type?: string | null;
  units_per_package?: number | string | null;
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
  category?: string | null;
  notes?: string | null;
  items: unknown;
  sale_price: number | string;
  estimated_cost: number | string;
  active: boolean;
  image_url?: string | null;
  image_path?: string | null;
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
  customer_id?: string | null;
  customer_name?: string | null;
  customer_address?: string | null;
  customer_number?: string | null;
  customer_neighborhood?: string | null;
  customer_complement?: string | null;
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
  pix_key?: string | null;
  logo_url?: string | null;
  logo_path?: string | null;
  banner_url?: string | null;
  banner_path?: string | null;
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
  selected_addons?: unknown;
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
  customer_id?: string | null;
  order_number: number;
  order_code: string;
  tracking_token_hash: string;
  status: string;
  fulfillment_type: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_reference: string;
  delivery_region_id?: string | null;
  delivery_region_name?: string | null;
  delivery_neighborhood?: string | null;
  delivery_city?: string | null;
  delivery_base_fee?: number | string | null;
  delivery_fee_rule?: string | null;
  delivery_minimum_order_applied?: number | string | null;
  delivery_free_applied?: boolean | null;
  delivery_free_threshold_applied?: number | string | null;
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

export interface SupabaseDeliveryCustomerRow {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  normalized_phone: string;
  email: string;
  cpf: string;
  birth_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseDeliveryCustomerAddressRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  label: string;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  reference: string;
  city: string;
  state: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupabaseDeliveryCustomerClassificationSettingsRow {
  tenant_id: string;
  recurring_min_orders: number;
  vip_min_orders: number;
  vip_min_spent: number | string;
  inactive_days: number;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseDeliveryCourierRow {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  normalized_phone: string;
  whatsapp: string;
  normalized_whatsapp: string;
  cpf: string;
  email: string;
  motorcycle_brand: string;
  motorcycle_model: string;
  motorcycle_color: string;
  motorcycle_plate: string;
  courier_type?: string | null;
  status: string;
  availability_status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseDeliveryDispatchRow {
  id: string;
  tenant_id: string;
  order_id: string;
  courier_id: string;
  dispatch_status: string;
  courier_name_snapshot: string;
  courier_phone_snapshot: string;
  courier_type_snapshot: string;
  assigned_by_user_id: string | null;
  assigned_by_email: string;
  assigned_at: string;
  accepted_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  rejection_reason: string;
  cancellation_reason: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseDeliveryDispatchHistoryRow {
  id: string;
  tenant_id: string;
  dispatch_id: string;
  order_id: string;
  courier_id: string | null;
  courier_name: string;
  from_status: string | null;
  to_status: string;
  actor_user_id: string | null;
  actor_email: string;
  actor_type: string;
  reason: string;
  created_at: string;
}

export interface SupabaseDeliveryRegionRow {
  id: string;
  tenant_id: string;
  name: string;
  city: string;
  normalized_city: string;
  neighborhoods: string[];
  normalized_neighborhoods: string[];
  description: string;
  delivery_fee: number | string;
  minimum_order_amount: number | string;
  estimated_time: string;
  status: string;
  is_temporarily_suspended: boolean;
  suspension_reason: string;
  schedule_enabled: boolean;
  schedule_days: number[];
  schedule_start: string;
  schedule_end: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseDeliveryPricingSettingsRow {
  tenant_id: string;
  pricing_mode: string;
  default_fee_enabled: boolean;
  default_delivery_fee: number | string;
  default_minimum_order_amount: number | string;
  default_estimated_time: string;
  free_delivery_enabled: boolean;
  free_delivery_min_amount: number | string;
  created_at?: string;
  updated_at?: string;
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
  const tz = typeof row.timezone === 'string' && row.timezone.trim()
    ? row.timezone.trim()
    : DEFAULT_SHOP_SETTINGS.timezone;

  return {
    ownerId: String(row.owner_email || fallbackOwnerId || row.tenant_id),
    establishmentName: String(row.establishment_name || DEFAULT_SHOP_SETTINGS.establishmentName),
    xSaladaPrice: Number(row.x_salada_price) || DEFAULT_SHOP_SETTINGS.xSaladaPrice,
    dailyGoal: Number(row.daily_goal) || 0,
    monthlyGoal: Number(row.monthly_goal) || 0,
    startDate: String(row.start_date || DEFAULT_SHOP_SETTINGS.startDate).slice(0, 10),
    timezone: tz,
  };
}

export function mapProductRow(row: SupabaseProductRow): ProductRecord {
  const category = String(row.category || 'Outro').trim() || 'Outro';
  const rawCost =
    row.cost_price !== undefined && row.cost_price !== null
      ? Number(row.cost_price)
      : undefined;
  const rawVolumeVal =
    row.volume_value !== undefined && row.volume_value !== null
      ? Number(row.volume_value)
      : null;
  const normalizedVolUnit = normalizeVolumeUnit(row.volume_unit) ?? null;
  const rawUnitsPerPkg =
    row.units_per_package !== undefined && row.units_per_package !== null
      ? Number(row.units_per_package)
      : undefined;

  const record: ProductRecord = {
    id: row.id,
    ownerId: String(row.owner_email || row.tenant_id),
    name: String(row.name || ''),
    category,
    unitPrice: Number(row.unit_price) || 0,
    countsAsXSalada: Boolean(row.counts_as_x_salada),
    active: row.active !== false,
    imageUrl: typeof row.image_url === 'string' ? row.image_url : '',
    imagePath: typeof row.image_path === 'string' ? row.image_path : '',
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };

  if (typeof row.description === 'string') {
    record.description = row.description;
  }
  if (row.internal_code !== undefined) {
    record.internalCode = row.internal_code ? String(row.internal_code).trim() : null;
  }
  if (rawCost !== undefined && Number.isFinite(rawCost) && rawCost >= 0) {
    record.costPrice = roundCurrency(rawCost);
  }
  if (typeof row.brand === 'string') {
    record.brand = row.brand;
  }
  if (typeof row.notes === 'string') {
    record.notes = row.notes;
  }
  if (row.barcode !== undefined) {
    record.barcode = normalizeBarcodeInput(row.barcode);
  }
  if (
    rawVolumeVal !== null &&
    Number.isFinite(rawVolumeVal) &&
    rawVolumeVal > 0 &&
    normalizedVolUnit
  ) {
    record.volumeValue = rawVolumeVal;
    record.volumeUnit = normalizedVolUnit;
  } else if (row.volume_value !== undefined || row.volume_unit !== undefined) {
    record.volumeValue = null;
    record.volumeUnit = null;
  }
  if (row.sale_unit !== undefined && row.sale_unit !== null) {
    record.saleUnit = normalizeSaleUnit(row.sale_unit);
  }
  if (row.package_type !== undefined && row.package_type !== null) {
    record.packageType = normalizePackageType(row.package_type);
  }
  if (
    rawUnitsPerPkg !== undefined &&
    Number.isInteger(rawUnitsPerPkg) &&
    rawUnitsPerPkg >= 1
  ) {
    record.unitsPerPackage = rawUnitsPerPkg;
  }

  return record;
}

export function mapComboRow(
  row: SupabaseComboRow,
  components?: ComboComponentRecord[],
): ComboRecord {
  const mapped: ComboRecord = {
    id: row.id,
    ownerId: String(row.owner_email || row.tenant_id),
    name: String(row.name || ''),
    description: String(row.description || ''),
    items: parseComboItemsSafe(row.items),
    salePrice: Number(row.sale_price) || 0,
    estimatedCost: Number(row.estimated_cost) || 0,
    active: row.active !== false,
    imageUrl: typeof row.image_url === 'string' ? row.image_url : '',
    imagePath: typeof row.image_path === 'string' ? row.image_path : '',
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
  if (typeof row.category === 'string' && row.category.trim()) {
    mapped.category = row.category.trim();
  }
  if (typeof row.notes === 'string' && row.notes.trim()) {
    mapped.notes = row.notes.trim();
  }
  if (components && components.length > 0) {
    mapped.components = components;
  }
  return mapped;
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
    customerId: typeof row.customer_id === 'string' && row.customer_id.trim() ? row.customer_id : null,
    customerName: String(row.customer_name || '').trim(),
    customerAddress: String(row.customer_address || '').trim(),
    customerNumber: String(row.customer_number || '').trim(),
    customerNeighborhood: String(row.customer_neighborhood || '').trim(),
    customerComplement: String(row.customer_complement || '').trim(),
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
  customer_id: string | null;
  customer_name: string;
  customer_address: string;
  customer_number: string;
  customer_neighborhood: string;
  customer_complement: string;
} {
  const quantity = Math.max(1, Math.trunc(Number(input.quantity)));
  const deliveryFee = roundCurrency(Math.max(0, Number(input.deliveryFee || 0)));
  const totalAmount =
    typeof input.totalAmount === 'number' &&
    Number.isFinite(input.totalAmount) &&
    input.totalAmount > 0
      ? roundCurrency(input.totalAmount)
      : input.items && input.items.length > 0
        ? roundCurrency(
            input.items.reduce((acc, item) => acc + item.lineTotal, 0) + deliveryFee,
          )
        : calculateSaleTotal(quantity, roundCurrency(Number(input.unitPrice)));
  const unitPrice =
    (input.items && input.items.length > 0) ||
    (typeof input.totalAmount === 'number' && input.totalAmount > 0)
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
    customer_id:
      typeof input.customerId === 'string' && input.customerId.trim().length > 0
        ? input.customerId.trim()
        : null,
    customer_name: (input.customerName || '').trim().slice(0, 120),
    customer_address: (input.customerAddress || '').trim().slice(0, 200),
    customer_number: (input.customerNumber || '').trim().slice(0, 40),
    customer_neighborhood: (input.customerNeighborhood || '').trim().slice(0, 120),
    customer_complement: (input.customerComplement || '').trim().slice(0, 160),
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
  image_url: string;
  image_path: string;
  description?: string;
  internal_code?: string | null;
  cost_price?: number;
  brand?: string;
  notes?: string;
  barcode?: string | null;
  volume_value?: number | null;
  volume_unit?: ProductVolumeUnit | null;
  sale_unit?: ProductSaleUnit;
  package_type?: ProductPackageType;
  units_per_package?: number;
} {
  const name = input.name.trim().slice(0, 80);
  const rawPrice = Number(input.unitPrice);

  if (!name) {
    throw new Error('Informe o nome do produto.');
  }
  if (!Number.isFinite(rawPrice) || rawPrice < 0 || rawPrice > MAX_PRODUCT_MONEY_VALUE) {
    throw new Error('Informe um preço válido para o produto.');
  }

  const basePayload: ReturnType<typeof buildProductPayloadForSupabase> = {
    name,
    category: String(input.category || 'Outro').trim().slice(0, 60) || 'Outro',
    unit_price: roundCurrency(rawPrice),
    counts_as_x_salada: Boolean(input.countsAsXSalada),
    active: Boolean(input.active),
    image_url: String(input.imageUrl || '').trim(),
    image_path: String(input.imagePath || '').trim(),
  };

  if (!hasExplicitUniversalProductFields(input)) {
    return basePayload;
  }

  if (input.description !== undefined) {
    basePayload.description = input.description.trim().slice(0, 400);
  }
  if (input.internalCode !== undefined) {
    const cleanCode = (input.internalCode || '').trim().slice(0, 40);
    basePayload.internal_code = cleanCode || null;
  }
  if (input.costPrice !== undefined) {
    const rawCost = Number(input.costPrice);
    if (!Number.isFinite(rawCost) || rawCost < 0 || rawCost > MAX_PRODUCT_MONEY_VALUE) {
      throw new Error('Informe um custo de aquisição válido (maior ou igual a zero).');
    }
    basePayload.cost_price = roundCurrency(rawCost);
  }
  if (input.brand !== undefined) {
    basePayload.brand = input.brand.trim().slice(0, 80);
  }
  if (input.notes !== undefined) {
    basePayload.notes = input.notes.trim().slice(0, 400);
  }
  if (input.barcode !== undefined) {
    const cleanBarcode = normalizeBarcodeInput(input.barcode);
    if (cleanBarcode !== null && !isValidBarcodeFormat(cleanBarcode)) {
      throw new Error('Código de barras inválido. Use de 8 a 14 dígitos numéricos.');
    }
    basePayload.barcode = cleanBarcode;
  }
  if (input.volumeValue !== undefined || input.volumeUnit !== undefined) {
    const volVal =
      input.volumeValue === null || input.volumeValue === undefined
        ? null
        : Number(input.volumeValue);
    const volUnit = normalizeVolumeUnit(input.volumeUnit) ?? null;

    if ((volVal === null) !== (volUnit === null)) {
      throw new Error('Informe o volume/quantidade junto com a unidade de medida.');
    }
    if (volVal !== null && (!Number.isFinite(volVal) || volVal <= 0 || volVal > MAX_PRODUCT_VOLUME_VALUE)) {
      throw new Error('O volume ou quantidade deve ser maior que zero.');
    }
    basePayload.volume_value = volVal !== null ? Number(volVal.toFixed(3)) : null;
    basePayload.volume_unit = volUnit;
  }
  if (input.saleUnit !== undefined) {
    basePayload.sale_unit = normalizeSaleUnit(input.saleUnit);
  }
  if (input.packageType !== undefined) {
    basePayload.package_type = normalizePackageType(input.packageType);
  }
  if (input.unitsPerPackage !== undefined) {
    const units = Number(input.unitsPerPackage);
    if (!Number.isInteger(units) || units < 1 || units > MAX_UNITS_PER_PACKAGE) {
      throw new Error('Unidades por embalagem deve ser um número inteiro maior ou igual a 1.');
    }
    basePayload.units_per_package = units;
  }

  return basePayload;
}

export function buildComboPayloadForSupabase(input: ComboInput): {
  name: string;
  description: string;
  items: ComboProductItem[];
  sale_price: number;
  estimated_cost: number;
  active: boolean;
  image_url: string;
  image_path: string;
  category?: string;
  notes?: string;
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

  const payload: {
    name: string;
    description: string;
    items: ComboProductItem[];
    sale_price: number;
    estimated_cost: number;
    active: boolean;
    image_url: string;
    image_path: string;
    category?: string;
    notes?: string;
  } = {
    name,
    description,
    items: cleanItems,
    sale_price: salePrice,
    estimated_cost: estimatedCost,
    active: Boolean(input.active),
    image_url: String(input.imageUrl || '').trim(),
    image_path: String(input.imagePath || '').trim(),
  };

  if (input.category !== undefined) {
    payload.category = String(input.category || '').trim().slice(0, 60);
  }
  if (input.notes !== undefined) {
    payload.notes = String(input.notes || '').trim().slice(0, 600);
  }

  return payload;
}

export function buildSettingsPayloadForSupabase(input: Omit<ShopSettings, 'ownerId'>): {
  establishment_name: string;
  x_salada_price: number;
  daily_goal: number;
  monthly_goal: number;
  start_date: string;
  timezone?: string;
} {
  const establishmentName = input.establishmentName.trim().slice(0, 80);
  const xSaladaPrice = roundCurrency(Number(input.xSaladaPrice));
  const dailyGoal = roundCurrency(Math.max(0, Number(input.dailyGoal)));
  const monthlyGoal = roundCurrency(Math.max(0, Number(input.monthlyGoal)));
  const startDate = sanitizeDateYYYYMMDD(input.startDate);
  const timezone = typeof input.timezone === 'string' && input.timezone.trim()
    ? input.timezone.trim().slice(0, 80)
    : undefined;

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
    ...(timezone ? { timezone } : {}),
  };
}

export interface TenantBillingAccessEvaluation {
  allowed: boolean;
  reason: TenantBillingBlockReason | null;
  status: SubscriptionStatus;
  retentionStatus: RetentionStatus;
}

export function evaluateTenantBillingAccess(
  tenant: Pick<SupabaseTenantRow, 'billing_exempt' | 'status'>,
  subscription: SupabaseSubscriptionRow | null | undefined,
  nowMs = Date.now(),
): TenantBillingAccessEvaluation {
  const retentionStatus: RetentionStatus = normalizeRetentionStatus(
    subscription?.retention_status,
  );
  const subStatus: SubscriptionStatus = normalizeSubscriptionStatus(
    subscription?.status,
    Boolean(tenant.billing_exempt),
  );

  if (tenant.status !== 'active') {
    return {
      allowed: false,
      reason: 'tenant_suspended',
      status: subStatus,
      retentionStatus,
    };
  }

  if (retentionStatus !== 'none') {
    return {
      allowed: false,
      reason: 'retention_active',
      status: subStatus,
      retentionStatus,
    };
  }

  if (tenant.billing_exempt) {
    return {
      allowed: true,
      reason: null,
      status: subStatus,
      retentionStatus,
    };
  }

  if (!subscription) {
    return {
      allowed: false,
      reason: 'subscription_missing',
      status: 'pending',
      retentionStatus,
    };
  }

  if (
    subStatus === 'exempt' ||
    subStatus === 'authorized' ||
    subStatus === 'active' ||
    subStatus === 'free'
  ) {
    return {
      allowed: true,
      reason: null,
      status: subStatus,
      retentionStatus,
    };
  }

  if (subStatus === 'trialing') {
    const trialEndMs = subscription.trial_ends_at
      ? Date.parse(subscription.trial_ends_at)
      : Number.NaN;
    const allowed = Number.isFinite(trialEndMs) && trialEndMs > nowMs;
    return {
      allowed,
      reason: allowed ? null : 'trial_expired',
      status: subStatus,
      retentionStatus,
    };
  }

  if (subStatus === 'past_due' || subStatus === 'paused') {
    const graceMs = subscription.grace_until
      ? Date.parse(subscription.grace_until)
      : Number.NaN;
    const allowed = Number.isFinite(graceMs) && graceMs > nowMs;
    return {
      allowed,
      reason: allowed ? null : 'grace_expired',
      status: subStatus,
      retentionStatus,
    };
  }

  if (subStatus === 'cancelled') {
    const periodEndMs = subscription.current_period_end
      ? Date.parse(subscription.current_period_end)
      : Number.NaN;
    const allowed = Number.isFinite(periodEndMs) && periodEndMs > nowMs;
    return {
      allowed,
      reason: allowed ? null : 'cancelled_ended',
      status: subStatus,
      retentionStatus,
    };
  }

  if (subStatus === 'expired') {
    return {
      allowed: false,
      reason: 'trial_expired',
      status: subStatus,
      retentionStatus,
    };
  }

  if (subStatus === 'suspended') {
    return {
      allowed: false,
      reason: 'tenant_suspended',
      status: subStatus,
      retentionStatus,
    };
  }

  return {
    allowed: false,
    reason: 'billing_pending',
    status: subStatus,
    retentionStatus,
  };
}

export function hasActiveTenantBillingAccess(
  tenant: Pick<SupabaseTenantRow, 'billing_exempt' | 'status'>,
  subscription: SupabaseSubscriptionRow | null | undefined,
  nowMs = Date.now(),
): boolean {
  return evaluateTenantBillingAccess(tenant, subscription, nowMs).allowed;
}

export function buildTenantContextFromRows(
  member: SupabaseTenantMemberRow,
  subscription: SupabaseSubscriptionRow | null | undefined,
  nowMs = Date.now(),
): TenantContext | null {
  const tenantRaw = Array.isArray(member.tenants)
    ? member.tenants[0]
    : member.tenants;
  if (
    !tenantRaw ||
    !member.active ||
    (tenantRaw.status !== 'active' && tenantRaw.status !== 'suspended')
  ) {
    return null;
  }

  const role: TenantRole = normalizeTenantRole(member.role);
  const access = evaluateTenantBillingAccess(tenantRaw, subscription, nowMs);

  return {
    tenantId: tenantRaw.id,
    slug: tenantRaw.slug,
    name: tenantRaw.name,
    role,
    isFounderAccount: Boolean(tenantRaw.is_founder_account),
    billingExempt: Boolean(tenantRaw.billing_exempt),
    subscriptionStatus: access.status,
    graceUntil: subscription?.grace_until ?? null,
    trialEndsAt: subscription?.trial_ends_at ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    endedAt: subscription?.ended_at ?? null,
    retentionStartedAt: subscription?.retention_started_at ?? null,
    retentionEndsAt: subscription?.retention_ends_at ?? null,
    retentionStatus: access.retentionStatus,
    onboardingCompleted: tenantRaw.onboarding_completed !== false,
    businessSegment: normalizeBusinessSegment(tenantRaw.business_segment),
    accessAllowed: access.allowed,
    accessBlockReason: access.reason,
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
    pixKey: normalizePixKeyInput(String(row.pix_key || '')),
    logoUrl: typeof row.logo_url === 'string' ? row.logo_url : '',
    logoPath: typeof row.logo_path === 'string' ? row.logo_path : '',
    bannerUrl: typeof row.banner_url === 'string' ? row.banner_url : '',
    bannerPath: typeof row.banner_path === 'string' ? row.banner_path : '',
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
  pix_key: string;
  delivery_fee: number;
  minimum_order_amount: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  logo_url: string;
  logo_path: string;
  banner_url: string;
  banner_path: string;
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
    pix_key: normalizePixKeyInput(input.pixKey || ''),
    delivery_fee: roundCurrency(Math.max(0, Math.min(1000, Number(input.deliveryFee) || 0))),
    minimum_order_amount: roundCurrency(
      Math.max(0, Math.min(10000, Number(input.minimumOrderAmount) || 0)),
    ),
    accepts_delivery: acceptsDelivery,
    accepts_pickup: acceptsPickup,
    // Persistir URLs e caminhos dos arquivos enviados ao Supabase Storage.
    logo_url: (input.logoUrl || '').trim(),
    logo_path: (input.logoPath || '').trim(),
    banner_url: (input.bannerUrl || '').trim(),
    banner_path: (input.bannerPath || '').trim(),
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

function parseSelectedAddonSnapshots(raw: unknown): Array<{ groupId: string; groupName: string; options: Array<{ id: string; name: string; price: number }> }> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((g): g is Record<string, unknown> => Boolean(g && typeof g === 'object')).slice(0, 30).map((g) => ({
    groupId: String(g.groupId || ''),
    groupName: String(g.groupName || 'Adicionais'),
    options: Array.isArray(g.options) ? g.options.filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object')).slice(0, 30).map((o) => ({ id: String(o.id || ''), name: String(o.name || ''), price: roundCurrency(Math.max(0, Number(o.price) || 0)) })) : [],
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
    selectedAddons: parseSelectedAddonSnapshots(row.selected_addons),
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

export function normalizeDeliveryFeeRule(raw: unknown): DeliveryFeeRuleApplied {
  const s = String(raw || '').trim().toLowerCase();
  if (
    s === 'neighborhood' ||
    s === 'region' ||
    s === 'default_fallback' ||
    s === 'store_default' ||
    s === 'pickup'
  ) {
    return s;
  }
  return 'store_default';
}

export function normalizeDeliveryPricingMode(raw: unknown): DeliveryPricingMode {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'by_region' || s === 'default_only') return s;
  return 'by_neighborhood';
}

export function mapOnlineOrderRow(
  row: SupabaseOnlineOrderRow,
  items: OnlineOrderItemSnapshot[],
  statusHistory: OnlineOrderStatusEvent[],
): OnlineOrderRecord {
  const orderNumber = Math.max(1, Math.trunc(Number(row.order_number) || 1));
  const deliveryFee = roundCurrency(Number(row.delivery_fee) || 0);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id ?? null,
    orderNumber,
    orderCode: String(row.order_code || formatOrderNumber(orderNumber)),
    tokenHash: String(row.tracking_token_hash || ''),
    status: normalizeOnlineOrderStatus(row.status),
    fulfillmentType: normalizeOnlineFulfillment(row.fulfillment_type),
    customerName: String(row.customer_name || ''),
    customerPhone: String(row.customer_phone || ''),
    deliveryAddress: String(row.delivery_address || ''),
    deliveryReference: String(row.delivery_reference || ''),
    deliveryRegionId: row.delivery_region_id ?? null,
    deliveryRegionName: String(row.delivery_region_name || ''),
    deliveryNeighborhood: String(row.delivery_neighborhood || ''),
    deliveryCity: String(row.delivery_city || ''),
    deliveryBaseFee:
      row.delivery_base_fee !== undefined && row.delivery_base_fee !== null
        ? roundCurrency(Number(row.delivery_base_fee) || 0)
        : deliveryFee,
    deliveryFeeRule: normalizeDeliveryFeeRule(row.delivery_fee_rule),
    deliveryMinimumOrderApplied: roundCurrency(
      Number(row.delivery_minimum_order_applied) || 0,
    ),
    deliveryFreeApplied: Boolean(row.delivery_free_applied),
    deliveryFreeThresholdApplied: roundCurrency(
      Number(row.delivery_free_threshold_applied) || 0,
    ),
    paymentMethod: normalizeOnlinePaymentMethod(row.payment_method),
    changeFor:
      row.change_for !== null && row.change_for !== undefined
        ? roundCurrency(Number(row.change_for) || 0)
        : null,
    customerNote: String(row.customer_note || ''),
    subtotalAmount: roundCurrency(Number(row.subtotal_amount) || 0),
    deliveryFee,
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

function parseScheduleDays(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return [0, 1, 2, 3, 4, 5, 6];
  const valid = Array.from(
    new Set(
      raw
        .map((v) => Math.trunc(Number(v)))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    ),
  ).sort((a, b) => a - b);
  return valid.length > 0 ? valid : [0, 1, 2, 3, 4, 5, 6];
}

export function mapPublicDigitalMenuRpcResponse(raw: unknown): PublicDigitalMenuPayload {
  if (!raw || typeof raw !== 'object') {
    return {
      found: false,
      store: null,
      products: [],
      combos: [],
      deliveryPricing: null,
      deliveryRegions: [],
    };
  }
  const obj = raw as Record<string, unknown>;
  if (!obj.found || !obj.store || typeof obj.store !== 'object') {
    return {
      found: false,
      store: null,
      products: [],
      combos: [],
      deliveryPricing: null,
      deliveryRegions: [],
    };
  }
  const st = obj.store as Record<string, unknown>;
  const store: DigitalMenuSettingsInput & { timezone?: string; businessSegment?: ReturnType<typeof normalizeBusinessSegment> } = {
    slug: sanitizeMenuSlug(String(st.slug || 'mgw_lanches')),
    isActive: Boolean(st.isActive),
    isOpen: Boolean(st.isOpen),
    storeName: String(st.storeName || 'MGW Lanches'),
    description: String(st.description || ''),
    phoneWhatsapp: String(st.phoneWhatsapp || ''),
    address: String(st.address || ''),
    openingHours: String(st.openingHours || ''),
    pixKey: normalizePixKeyInput(String(st.pixKey || '')),
    logoUrl: typeof st.logoUrl === 'string' ? st.logoUrl : '',
    bannerUrl: typeof st.bannerUrl === 'string' ? st.bannerUrl : '',
    deliveryFee: roundCurrency(Math.max(0, Number(st.deliveryFee) || 0)),
    minimumOrderAmount: roundCurrency(Math.max(0, Number(st.minimumOrderAmount) || 0)),
    acceptsDelivery: st.acceptsDelivery !== false,
    acceptsPickup: st.acceptsPickup !== false,
    timezone:
      typeof st.timezone === 'string' && st.timezone.trim()
        ? st.timezone.trim()
        : DEFAULT_SHOP_TIMEZONE,
    businessSegment: normalizeBusinessSegment(st.businessSegment ?? st.business_segment),
  };

  const products: PublicCatalogProduct[] = Array.isArray(obj.products)
    ? obj.products
        .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
        .map((p) => {
          const cat = String(p.category || 'Outro');
          return {
            id: String(p.id || ''),
            name: String(p.name || ''),
            category: cat.trim() || 'Outro',
            unitPrice: roundCurrency(Math.max(0, Number(p.unitPrice) || 0)),
            countsAsXSalada: Boolean(p.countsAsXSalada),
            imageUrl: typeof p.imageUrl === 'string' ? p.imageUrl : '',
            addonGroups: Array.isArray(p.addonGroups)
              ? (p.addonGroups as PublicCatalogProduct['addonGroups'])
              : undefined,
          };
        })
    : [];

  const combos: PublicCatalogCombo[] = Array.isArray(obj.combos)
    ? obj.combos
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
        .map((c) => {
          const combo: PublicCatalogCombo = {
            id: String(c.id || ''),
            name: String(c.name || ''),
            description: String(c.description || ''),
            items: parseComboItemsSafe(c.items),
            salePrice: roundCurrency(Math.max(0, Number(c.salePrice) || 0)),
            imageUrl: typeof c.imageUrl === 'string' ? c.imageUrl : '',
          };
          if (typeof c.category === 'string' && c.category.trim()) {
            combo.category = c.category.trim();
          }
          if (typeof c.isAvailable === 'boolean') {
            combo.isAvailable = c.isAvailable;
          }
          if (c.maxAvailableQty !== undefined) {
            combo.maxAvailableQty =
              c.maxAvailableQty === null
                ? null
                : Math.max(0, Math.trunc(Number(c.maxAvailableQty) || 0));
          }
          return combo;
        })
    : [];

  let deliveryPricing: PublicDeliveryPricingSettings | null = null;
  if (obj.deliveryPricing && typeof obj.deliveryPricing === 'object') {
    const dp = obj.deliveryPricing as Record<string, unknown>;
    deliveryPricing = {
      pricingMode: normalizeDeliveryPricingMode(dp.pricingMode),
      defaultFeeEnabled: Boolean(dp.defaultFeeEnabled),
      defaultDeliveryFee: roundCurrency(Math.max(0, Number(dp.defaultDeliveryFee) || 0)),
      defaultMinimumOrderAmount: roundCurrency(
        Math.max(0, Number(dp.defaultMinimumOrderAmount) || 0),
      ),
      defaultEstimatedTime: String(dp.defaultEstimatedTime || ''),
      freeDeliveryEnabled: Boolean(dp.freeDeliveryEnabled),
      freeDeliveryMinAmount: roundCurrency(
        Math.max(0, Number(dp.freeDeliveryMinAmount) || 0),
      ),
    };
  }

  const deliveryRegions: PublicDeliveryRegion[] = Array.isArray(obj.deliveryRegions)
    ? obj.deliveryRegions
        .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
        .map((r) => ({
          id: String(r.id || ''),
          name: String(r.name || '').trim(),
          city: String(r.city || '').trim(),
          neighborhoods: Array.isArray(r.neighborhoods)
            ? r.neighborhoods.map((n) => String(n || '').trim()).filter(Boolean)
            : [],
          description: String(r.description || ''),
          deliveryFee: roundCurrency(Math.max(0, Number(r.deliveryFee) || 0)),
          minimumOrderAmount: roundCurrency(Math.max(0, Number(r.minimumOrderAmount) || 0)),
          estimatedTime: String(r.estimatedTime || ''),
          status: r.status === 'inactive' ? 'inactive' : 'active',
          isTemporarilySuspended: Boolean(r.isTemporarilySuspended),
          suspensionReason: String(r.suspensionReason || ''),
          scheduleEnabled: Boolean(r.scheduleEnabled),
          scheduleDays: parseScheduleDays(r.scheduleDays),
          scheduleStart: isValidTimeHHMM(String(r.scheduleStart || ''))
            ? String(r.scheduleStart)
            : '00:00',
          scheduleEnd: isValidTimeHHMM(String(r.scheduleEnd || ''))
            ? String(r.scheduleEnd)
            : '23:59',
        }))
    : [];

  return {
    found: true,
    store,
    products,
    combos,
    deliveryPricing,
    deliveryRegions,
  };
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
          selectedAddons: parseSelectedAddonSnapshots(it.selectedAddons),
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

  const deliveryFee = roundCurrency(Number(o.deliveryFee) || 0);

  return {
    orderId: String(o.orderId || ''),
    orderNumber,
    orderCode: String(o.orderCode || formatOrderNumber(orderNumber)),
    status: normalizeOnlineOrderStatus(o.status),
    fulfillmentType: normalizeOnlineFulfillment(o.fulfillmentType),
    customerName: String(o.customerName || ''),
    deliveryAddress: String(o.deliveryAddress || ''),
    deliveryReference: String(o.deliveryReference || ''),
    deliveryRegionName: String(o.deliveryRegionName || ''),
    deliveryNeighborhood: String(o.deliveryNeighborhood || ''),
    deliveryCity: String(o.deliveryCity || ''),
    deliveryBaseFee:
      o.deliveryBaseFee !== undefined && o.deliveryBaseFee !== null
        ? roundCurrency(Number(o.deliveryBaseFee) || 0)
        : deliveryFee,
    deliveryFeeRule: normalizeDeliveryFeeRule(o.deliveryFeeRule),
    deliveryMinimumOrderApplied: roundCurrency(
      Number(o.deliveryMinimumOrderApplied) || 0,
    ),
    deliveryFreeApplied: Boolean(o.deliveryFreeApplied),
    deliveryFreeThresholdApplied: roundCurrency(
      Number(o.deliveryFreeThresholdApplied) || 0,
    ),
    paymentMethod: normalizeOnlinePaymentMethod(o.paymentMethod),
    changeFor:
      o.changeFor !== null && o.changeFor !== undefined
        ? roundCurrency(Number(o.changeFor) || 0)
        : null,
    customerNote: String(o.customerNote || ''),
    subtotalAmount: roundCurrency(Number(o.subtotalAmount) || 0),
    deliveryFee,
    totalAmount: roundCurrency(Number(o.totalAmount) || 0),
    rejectionReason: String(o.rejectionReason || ''),
    storeName: String(o.storeName || 'MGW Lanches'),
    storeSlug: String(o.storeSlug || 'mgw_lanches'),
    storeWhatsapp: String(o.storeWhatsapp || ''),
    storeAddress: String(o.storeAddress || ''),
    storePixKey: normalizePixKeyInput(String(o.storePixKey || '')),
    createdAtMs: isoTimestampToMs(o.createdAt),
    updatedAtMs: isoTimestampToMs(o.updatedAt),
    items,
    statusHistory,
  };
}

// ==================== MGW DELIVERY — CLIENTES ====================

export function mapDeliveryCustomerRow(
  row: SupabaseDeliveryCustomerRow,
): DeliveryCustomerRecord {
  const phone = String(row.phone || '');
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: String(row.name || '').trim(),
    phone,
    normalizedPhone: String(row.normalized_phone || normalizeCustomerPhone(phone)),
    email: String(row.email || ''),
    cpf: String(row.cpf || ''),
    birthDate: row.birth_date ? String(row.birth_date).slice(0, 10) : null,
    notes: String(row.notes || ''),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function buildDeliveryCustomerPayloadForSupabase(
  input: DeliveryCustomerInput,
): {
  name: string;
  phone: string;
  normalized_phone: string;
  email: string;
  cpf: string;
  birth_date: string | null;
  notes: string;
} {
  const name = String(input.name || '').trim().slice(0, 120);
  if (name.length < 2) {
    throw new Error('Informe o nome completo do cliente (mínimo 2 caracteres).');
  }

  const rawPhone = String(input.phone || '').trim().slice(0, 32);
  if (!isValidCustomerPhone(rawPhone)) {
    throw new Error('Informe um telefone/WhatsApp válido com DDD.');
  }
  const normalizedPhone = normalizeCustomerPhone(rawPhone);

  const email = String(input.email || '').trim().toLowerCase().slice(0, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe um e-mail válido ou deixe o campo em branco.');
  }

  const cpfDigits = String(input.cpf || '').replace(/\D/g, '').slice(0, 14);
  if (!isValidOptionalCpf(cpfDigits)) {
    throw new Error('O CPF informado é inválido. Deixe em branco se não desejar informar.');
  }

  let birthDate: string | null = null;
  const rawBirth = String(input.birthDate || '').trim();
  if (rawBirth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawBirth)) {
      throw new Error('Data de nascimento inválida. Use AAAA-MM-DD.');
    }
    birthDate = rawBirth;
  }

  return {
    name,
    phone: rawPhone,
    normalized_phone: normalizedPhone,
    email,
    cpf: cpfDigits,
    birth_date: birthDate,
    notes: String(input.notes || '').trim().slice(0, 1000),
  };
}

export function mapDeliveryCustomerAddressRow(
  row: SupabaseDeliveryCustomerAddressRow,
): DeliveryCustomerAddressRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    label: String(row.label || ''),
    cep: String(row.cep || ''),
    street: String(row.street || ''),
    number: String(row.number || ''),
    neighborhood: String(row.neighborhood || ''),
    complement: String(row.complement || ''),
    reference: String(row.reference || ''),
    city: String(row.city || ''),
    state: String(row.state || ''),
    isPrimary: Boolean(row.is_primary),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function buildDeliveryCustomerAddressPayloadForSupabase(
  input: DeliveryCustomerAddressInput,
): {
  label: string;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  reference: string;
  city: string;
  state: string;
  is_primary: boolean;
} {
  const street = String(input.street || '').trim().slice(0, 200);
  if (street.length < 3) {
    throw new Error('Informe a rua/logradouro do endereço.');
  }
  const cepDigits = String(input.cep || '').replace(/\D/g, '').slice(0, 8);
  const formattedCep =
    cepDigits.length === 8
      ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`
      : cepDigits;

  return {
    label: String(input.label || '').trim().slice(0, 40),
    cep: formattedCep,
    street,
    number: String(input.number || '').trim().slice(0, 30),
    neighborhood: String(input.neighborhood || '').trim().slice(0, 100),
    complement: String(input.complement || '').trim().slice(0, 120),
    reference: String(input.reference || '').trim().slice(0, 160),
    city: String(input.city || '').trim().slice(0, 100),
    state: String(input.state || '').trim().toUpperCase().slice(0, 10),
    is_primary: Boolean(input.isPrimary),
  };
}

export function mapDeliveryCustomerClassificationSettingsRow(
  row?: SupabaseDeliveryCustomerClassificationSettingsRow | null,
): DeliveryCustomerClassificationConfig {
  if (!row) return { ...DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG };
  return normalizeClassificationConfig({
    recurringMinOrders: Number(row.recurring_min_orders),
    vipMinOrders: Number(row.vip_min_orders),
    vipMinSpent: Number(row.vip_min_spent),
    inactiveDays: Number(row.inactive_days),
  });
}

export function buildDeliveryCustomerClassificationPayloadForSupabase(
  config: DeliveryCustomerClassificationConfig,
): {
  recurring_min_orders: number;
  vip_min_orders: number;
  vip_min_spent: number;
  inactive_days: number;
} {
  const clean = normalizeClassificationConfig(config);
  return {
    recurring_min_orders: clean.recurringMinOrders,
    vip_min_orders: clean.vipMinOrders,
    vip_min_spent: clean.vipMinSpent,
    inactive_days: clean.inactiveDays,
  };
}

// ==================== MGW DELIVERY — ENTREGADORES (MOTOBOYS) ====================

function normalizeCourierStatus(raw: unknown): DeliveryCourierStatus {
  return raw === 'inactive' ? 'inactive' : 'active';
}

function normalizeCourierAvailability(
  raw: unknown,
  status: DeliveryCourierStatus,
): DeliveryCourierAvailability {
  if (status === 'inactive') return 'unavailable';
  return raw === 'unavailable' ? 'unavailable' : 'available';
}

export function mapDeliveryCourierRow(
  row: SupabaseDeliveryCourierRow,
): DeliveryCourierRecord {
  const phone = String(row.phone || '');
  const whatsapp = String(row.whatsapp || '');
  const status = normalizeCourierStatus(row.status);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: String(row.name || '').trim(),
    phone,
    normalizedPhone: String(row.normalized_phone || normalizeCustomerPhone(phone)),
    whatsapp,
    normalizedWhatsapp: String(
      row.normalized_whatsapp || (whatsapp ? normalizeCustomerPhone(whatsapp) : ''),
    ),
    cpf: String(row.cpf || ''),
    email: String(row.email || ''),
    motorcycleBrand: String(row.motorcycle_brand || ''),
    motorcycleModel: String(row.motorcycle_model || ''),
    motorcycleColor: String(row.motorcycle_color || ''),
    motorcyclePlate: String(row.motorcycle_plate || ''),
    courierType: normalizeCourierType(row.courier_type),
    status,
    availabilityStatus: normalizeCourierAvailability(
      row.availability_status,
      status,
    ),
    notes: String(row.notes || ''),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function buildDeliveryCourierPayloadForSupabase(
  input: DeliveryCourierInput,
): {
  name: string;
  phone: string;
  normalized_phone: string;
  whatsapp: string;
  normalized_whatsapp: string;
  cpf: string;
  email: string;
  motorcycle_brand: string;
  motorcycle_model: string;
  motorcycle_color: string;
  motorcycle_plate: string;
  courier_type: DeliveryCourierType;
  status: DeliveryCourierStatus;
  availability_status: DeliveryCourierAvailability;
  notes: string;
} {
  const name = String(input.name || '').trim().slice(0, 120);
  if (name.length < 2) {
    throw new Error('Informe o nome completo do entregador (mínimo 2 caracteres).');
  }

  const rawPhone = String(input.phone || '').trim().slice(0, 32);
  if (!isValidCustomerPhone(rawPhone)) {
    throw new Error('Informe um telefone válido com DDD para o entregador.');
  }
  const normalizedPhone = normalizeCustomerPhone(rawPhone);

  const rawWhatsapp = String(input.whatsapp || '').trim().slice(0, 32);
  if (rawWhatsapp && !isValidCustomerPhone(rawWhatsapp)) {
    throw new Error('Informe um WhatsApp válido com DDD ou deixe o campo em branco.');
  }
  const normalizedWhatsapp = rawWhatsapp
    ? normalizeCustomerPhone(rawWhatsapp)
    : '';

  const email = String(input.email || '').trim().toLowerCase().slice(0, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe um e-mail válido ou deixe o campo em branco.');
  }

  const cpfDigits = String(input.cpf || '').replace(/\D/g, '').slice(0, 14);
  if (!isValidOptionalCpf(cpfDigits)) {
    throw new Error('O CPF informado é inválido. Deixe em branco se preferir.');
  }

  const courierType = normalizeCourierType(input.courierType);
  const status = normalizeCourierStatus(input.status);
  const availabilityStatus = normalizeCourierAvailability(
    input.availabilityStatus,
    status,
  );

  return {
    name,
    phone: rawPhone,
    normalized_phone: normalizedPhone,
    whatsapp: rawWhatsapp,
    normalized_whatsapp: normalizedWhatsapp,
    cpf: cpfDigits,
    email,
    motorcycle_brand: String(input.motorcycleBrand || '').trim().slice(0, 60),
    motorcycle_model: String(input.motorcycleModel || '').trim().slice(0, 80),
    motorcycle_color: String(input.motorcycleColor || '').trim().slice(0, 40),
    motorcycle_plate: normalizeCourierPlateForStorage(input.motorcyclePlate),
    courier_type: courierType,
    status,
    availability_status: availabilityStatus,
    notes: String(input.notes || '').trim().slice(0, 1000),
  };
}

// ==================== MGW DELIVERY — CENTRAL DE DESPACHO ====================

const VALID_DISPATCH_STATUSES: ReadonlySet<DeliveryDispatchStatus> = new Set([
  'awaiting_dispatch',
  'courier_assigned',
  'awaiting_acceptance',
  'delivery_accepted',
  'preparing',
  'ready_for_dispatch',
  'out_for_delivery',
  'delivered',
  'delivery_rejected',
  'delivery_cancelled',
]);

export function normalizeDispatchStatus(raw: unknown): DeliveryDispatchStatus {
  const s = String(raw || '').trim().toLowerCase() as DeliveryDispatchStatus;
  return VALID_DISPATCH_STATUSES.has(s) ? s : 'awaiting_acceptance';
}

function normalizeDispatchActorType(raw: unknown): DeliveryDispatchActorType {
  if (raw === 'courier' || raw === 'system') return raw;
  return 'admin';
}

export function mapDeliveryDispatchRow(
  row: SupabaseDeliveryDispatchRow,
): DeliveryDispatchRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderId: row.order_id,
    courierId: row.courier_id,
    dispatchStatus: normalizeDispatchStatus(row.dispatch_status),
    courierNameSnapshot: String(row.courier_name_snapshot || '').trim(),
    courierPhoneSnapshot: String(row.courier_phone_snapshot || '').trim(),
    courierTypeSnapshot: normalizeCourierType(row.courier_type_snapshot),
    assignedByUserId: row.assigned_by_user_id ?? null,
    assignedByEmail: String(row.assigned_by_email || '').trim(),
    assignedAtMs: isoTimestampToMs(row.assigned_at),
    acceptedAtMs: row.accepted_at ? isoTimestampToMs(row.accepted_at) : null,
    dispatchedAtMs: row.dispatched_at ? isoTimestampToMs(row.dispatched_at) : null,
    deliveredAtMs: row.delivered_at ? isoTimestampToMs(row.delivered_at) : null,
    rejectedAtMs: row.rejected_at ? isoTimestampToMs(row.rejected_at) : null,
    cancelledAtMs: row.cancelled_at ? isoTimestampToMs(row.cancelled_at) : null,
    rejectionReason: String(row.rejection_reason || '').trim(),
    cancellationReason: String(row.cancellation_reason || '').trim(),
    notes: String(row.notes || '').trim(),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function mapDeliveryDispatchHistoryRow(
  row: SupabaseDeliveryDispatchHistoryRow,
): DeliveryDispatchHistoryRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    dispatchId: row.dispatch_id,
    orderId: row.order_id,
    courierId: row.courier_id ?? null,
    courierName: String(row.courier_name || '').trim(),
    fromStatus: row.from_status ? normalizeDispatchStatus(row.from_status) : null,
    toStatus: normalizeDispatchStatus(row.to_status),
    actorUserId: row.actor_user_id ?? null,
    actorEmail: String(row.actor_email || '').trim(),
    actorType: normalizeDispatchActorType(row.actor_type),
    reason: String(row.reason || '').trim(),
    createdAtMs: isoTimestampToMs(row.created_at),
  };
}

// ==================== MGW DELIVERY — REGIÕES E TAXAS ====================

export function mapDeliveryRegionRow(
  row: SupabaseDeliveryRegionRow,
): DeliveryRegionRecord {
  const status: DeliveryRegionStatus =
    row.status === 'inactive' ? 'inactive' : 'active';
  const neighborhoods = Array.isArray(row.neighborhoods)
    ? deduplicateNeighborhoods(row.neighborhoods.map((n) => String(n || '')))
    : [];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: String(row.name || '').trim(),
    city: String(row.city || '').trim(),
    neighborhoods,
    description: String(row.description || ''),
    deliveryFee: roundCurrency(Math.max(0, Number(row.delivery_fee) || 0)),
    minimumOrderAmount: roundCurrency(
      Math.max(0, Number(row.minimum_order_amount) || 0),
    ),
    estimatedTime: String(row.estimated_time || ''),
    status,
    isTemporarilySuspended: Boolean(row.is_temporarily_suspended),
    suspensionReason: String(row.suspension_reason || ''),
    scheduleEnabled: Boolean(row.schedule_enabled),
    scheduleDays: parseScheduleDays(row.schedule_days),
    scheduleStart: isValidTimeHHMM(row.schedule_start)
      ? row.schedule_start
      : '00:00',
    scheduleEnd: isValidTimeHHMM(row.schedule_end) ? row.schedule_end : '23:59',
    notes: String(row.notes || ''),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function buildDeliveryRegionPayloadForSupabase(
  input: DeliveryRegionInput,
): {
  name: string;
  city: string;
  normalized_city: string;
  neighborhoods: string[];
  normalized_neighborhoods: string[];
  description: string;
  delivery_fee: number;
  minimum_order_amount: number;
  estimated_time: string;
  status: DeliveryRegionStatus;
  is_temporarily_suspended: boolean;
  suspension_reason: string;
  schedule_enabled: boolean;
  schedule_days: number[];
  schedule_start: string;
  schedule_end: string;
  notes: string;
} {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (name.length < 2) {
    throw new Error('Informe o nome da região de entrega (mínimo 2 caracteres).');
  }

  const city = String(input.city || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (city.length < 2) {
    throw new Error('Informe o município da região.');
  }

  const neighborhoods = deduplicateNeighborhoods(input.neighborhoods || []);
  if (neighborhoods.length === 0) {
    throw new Error('Adicione ao menos um bairro atendido para esta região.');
  }

  const deliveryFee = roundCurrency(Number(input.deliveryFee));
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
    throw new Error('A taxa de entrega não pode ser negativa.');
  }

  const minimumOrder = roundCurrency(Number(input.minimumOrderAmount ?? 0));
  if (!Number.isFinite(minimumOrder) || minimumOrder < 0) {
    throw new Error('O pedido mínimo da região não pode ser negativo.');
  }

  const status: DeliveryRegionStatus =
    input.status === 'inactive' ? 'inactive' : 'active';
  const suspended = Boolean(input.isTemporarilySuspended);
  const scheduleEnabled = Boolean(input.scheduleEnabled);
  const scheduleStart = isValidTimeHHMM(input.scheduleStart || '')
    ? String(input.scheduleStart).trim()
    : '00:00';
  const scheduleEnd = isValidTimeHHMM(input.scheduleEnd || '')
    ? String(input.scheduleEnd).trim()
    : '23:59';

  return {
    name,
    city,
    normalized_city: normalizeDeliveryGeoText(city),
    neighborhoods,
    normalized_neighborhoods: neighborhoods.map((n) => normalizeDeliveryGeoText(n)),
    description: String(input.description || '').trim().slice(0, 300),
    delivery_fee: deliveryFee,
    minimum_order_amount: minimumOrder,
    estimated_time: String(input.estimatedTime || '').trim().slice(0, 60),
    status,
    is_temporarily_suspended: suspended,
    suspension_reason: suspended
      ? String(input.suspensionReason || '').trim().slice(0, 300)
      : '',
    schedule_enabled: scheduleEnabled,
    schedule_days: parseScheduleDays(input.scheduleDays),
    schedule_start: scheduleStart,
    schedule_end: scheduleEnd,
    notes: String(input.notes || '').trim().slice(0, 1000),
  };
}

export function mapDeliveryPricingSettingsRow(
  row?: SupabaseDeliveryPricingSettingsRow | null,
  tenantId = '',
  fallbackMenu?: Pick<DigitalMenuSettings, 'deliveryFee' | 'minimumOrderAmount'> | null,
): DeliveryPricingSettings {
  if (!row) {
    return {
      tenantId,
      ...DEFAULT_DELIVERY_PRICING_SETTINGS,
      defaultDeliveryFee: roundCurrency(
        Math.max(0, fallbackMenu?.deliveryFee ?? DEFAULT_DELIVERY_PRICING_SETTINGS.defaultDeliveryFee),
      ),
      defaultMinimumOrderAmount: roundCurrency(
        Math.max(
          0,
          fallbackMenu?.minimumOrderAmount ??
            DEFAULT_DELIVERY_PRICING_SETTINGS.defaultMinimumOrderAmount,
        ),
      ),
    };
  }

  return {
    tenantId: row.tenant_id || tenantId,
    pricingMode: normalizeDeliveryPricingMode(row.pricing_mode),
    defaultFeeEnabled: Boolean(row.default_fee_enabled),
    defaultDeliveryFee: roundCurrency(Math.max(0, Number(row.default_delivery_fee) || 0)),
    defaultMinimumOrderAmount: roundCurrency(
      Math.max(0, Number(row.default_minimum_order_amount) || 0),
    ),
    defaultEstimatedTime: String(row.default_estimated_time || ''),
    freeDeliveryEnabled: Boolean(row.free_delivery_enabled),
    freeDeliveryMinAmount: roundCurrency(
      Math.max(0, Number(row.free_delivery_min_amount) || 0),
    ),
    updatedAtMs: row.updated_at ? isoTimestampToMs(row.updated_at) : undefined,
  };
}

export function buildDeliveryPricingSettingsPayloadForSupabase(
  input: DeliveryPricingSettingsInput,
): {
  pricing_mode: DeliveryPricingMode;
  default_fee_enabled: boolean;
  default_delivery_fee: number;
  default_minimum_order_amount: number;
  default_estimated_time: string;
  free_delivery_enabled: boolean;
  free_delivery_min_amount: number;
} {
  const defaultFee = roundCurrency(Number(input.defaultDeliveryFee));
  if (!Number.isFinite(defaultFee) || defaultFee < 0) {
    throw new Error('A taxa padrão de entrega não pode ser negativa.');
  }
  const defaultMin = roundCurrency(Number(input.defaultMinimumOrderAmount));
  if (!Number.isFinite(defaultMin) || defaultMin < 0) {
    throw new Error('O pedido mínimo padrão não pode ser negativo.');
  }
  const freeMin = roundCurrency(Number(input.freeDeliveryMinAmount));
  if (!Number.isFinite(freeMin) || freeMin < 0) {
    throw new Error('O valor mínimo para entrega grátis não pode ser negativo.');
  }
  if (input.freeDeliveryEnabled && freeMin <= 0) {
    throw new Error('Informe um valor mínimo maior que zero para entrega grátis.');
  }

  return {
    pricing_mode: normalizeDeliveryPricingMode(input.pricingMode),
    default_fee_enabled: Boolean(input.defaultFeeEnabled),
    default_delivery_fee: defaultFee,
    default_minimum_order_amount: defaultMin,
    default_estimated_time: String(input.defaultEstimatedTime || '').trim().slice(0, 60),
    free_delivery_enabled: Boolean(input.freeDeliveryEnabled),
    free_delivery_min_amount: freeMin,
  };
}

// ==================== ETAPA 4 — ESTOQUE PROFISSIONAL (ADEGA) ====================

export interface SupabaseInventoryBalanceRow {
  id: string;
  tenant_id: string;
  product_id: string;
  available_qty: number | string;
  reserved_qty: number | string;
  min_stock_qty: number | string;
  average_unit_cost: number | string;
  last_cost_price: number | string;
  allow_negative_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupabaseInventoryPackagingConversionRow {
  id: string;
  tenant_id: string;
  product_id: string;
  package_label: string;
  package_type: string;
  factor_to_base: number | string;
  is_default_purchase: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupabaseInventoryMovementRow {
  id: string;
  tenant_id: string;
  product_id: string;
  movement_type: string;
  direction: string;
  input_quantity: number | string;
  input_unit: string;
  conversion_factor_used: number | string;
  base_quantity: number | string;
  previous_balance: number | string;
  new_balance: number | string;
  unit_cost: number | string;
  total_cost: number | string;
  previous_avg_cost: number | string;
  new_avg_cost: number | string;
  reason: string;
  notes: string;
  origin_type: string;
  origin_id: string | null;
  supplier_id: string | null;
  packaging_conversion_id: string | null;
  idempotency_key: string;
  actor_user_id: string | null;
  actor_email: string;
  created_at: string;
}

export interface SupabaseSupplierRow {
  id: string;
  tenant_id: string;
  name: string;
  trade_name: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupabaseProductSupplierRow {
  id: string;
  tenant_id: string;
  product_id: string;
  supplier_id: string;
  supplier_sku: string;
  last_unit_cost: number | string;
  is_preferred: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SupabasePurchaseOrderRow {
  id: string;
  tenant_id: string;
  order_number: number | string;
  supplier_id: string;
  status: string;
  payment_terms: string;
  expected_delivery_date: string | null;
  discount_amount: number | string;
  additional_expenses: number | string;
  items_subtotal: number | string;
  total_amount: number | string;
  notes: string;
  idempotency_key: string;
  cancelled_reason: string;
  cancelled_at: string | null;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

export interface SupabasePurchaseOrderItemRow {
  id: string;
  tenant_id: string;
  purchase_order_id: string;
  product_id: string;
  packaging_conversion_id: string | null;
  unit_label: string;
  conversion_factor: number | string;
  ordered_qty: number | string;
  ordered_base_qty: number | string;
  received_base_qty: number | string;
  unit_cost: number | string;
  total_cost: number | string;
  created_at: string;
  updated_at: string;
}

export interface SupabasePurchaseReceiptRow {
  id: string;
  tenant_id: string;
  purchase_order_id: string;
  receipt_number: number | string;
  notes: string;
  idempotency_key: string;
  received_by_email: string;
  received_at: string;
}

export interface SupabasePurchaseReceiptItemRow {
  id: string;
  tenant_id: string;
  receipt_id: string;
  purchase_order_item_id: string;
  product_id: string;
  received_qty: number | string;
  unit_label: string;
  conversion_factor: number | string;
  received_base_qty: number | string;
  unit_cost: number | string;
  total_cost: number | string;
  movement_id: string;
  created_at: string;
}

export interface SupabaseInventoryCountRow {
  id: string;
  tenant_id: string;
  count_number: number | string;
  title: string;
  status: string;
  notes: string;
  started_by_email: string;
  finalized_by_email: string;
  finalized_at: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseInventoryCountItemRow {
  id: string;
  tenant_id: string;
  count_id: string;
  product_id: string;
  expected_qty: number | string;
  counted_qty: number | string | null;
  difference_qty: number | string;
  unit_cost_snapshot: number | string;
  estimated_difference_value: number | string;
  adjustment_movement_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

function roundQtyMapper(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

function roundUnitCostMapper(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function mapInventoryBalanceRow(
  row: SupabaseInventoryBalanceRow,
): InventoryBalanceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    availableQty: roundQtyMapper(row.available_qty),
    reservedQty: Math.max(0, roundQtyMapper(row.reserved_qty)),
    minStockQty: Math.max(0, roundQtyMapper(row.min_stock_qty)),
    averageUnitCost: roundUnitCostMapper(row.average_unit_cost),
    lastCostPrice: roundUnitCostMapper(row.last_cost_price),
    allowNegativeStock: Boolean(row.allow_negative_stock),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function mapInventoryPackagingConversionRow(
  row: SupabaseInventoryPackagingConversionRow,
): InventoryPackagingConversionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    packageLabel: String(row.package_label || ''),
    packageType: normalizeSaleUnit(row.package_type),
    factorToBase: Math.max(0.001, roundQtyMapper(row.factor_to_base)),
    isDefaultPurchase: Boolean(row.is_default_purchase),
    active: Boolean(row.active),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function buildInventoryPackagingConversionPayloadForSupabase(
  input: InventoryPackagingConversionInput,
): {
  product_id: string;
  package_label: string;
  package_type: ProductSaleUnit;
  factor_to_base: number;
  is_default_purchase: boolean;
  active: boolean;
} {
  const label = String(input.packageLabel || '').trim().slice(0, 60);
  if (!label) {
    throw new Error('Informe o nome da embalagem (ex.: Caixa c/ 12).');
  }
  const factor = roundQtyMapper(input.factorToBase);
  if (factor <= 0 || factor > 10000) {
    throw new Error('Fator de conversão deve ser maior que zero e até 10.000.');
  }
  return {
    product_id: input.productId,
    package_label: label,
    package_type: normalizeSaleUnit(input.packageType),
    factor_to_base: factor,
    is_default_purchase: Boolean(input.isDefaultPurchase),
    active: input.active !== false,
  };
}

export function mapInventoryMovementRow(
  row: SupabaseInventoryMovementRow,
): InventoryMovementRecord {
  const rawType = String(row.movement_type || 'manual_entry');
  const movementType: InventoryMovementType =
    rawType === 'manual_entry' ||
    rawType === 'purchase_receipt' ||
    rawType === 'manual_exit' ||
    rawType === 'loss' ||
    rawType === 'damage' ||
    rawType === 'expiry' ||
    rawType === 'internal_consumption' ||
    rawType === 'adjustment_in' ||
    rawType === 'adjustment_out' ||
    rawType === 'inventory_adjustment' ||
    rawType === 'return_in' ||
    rawType === 'combo_consumption'
      ? rawType
      : 'manual_entry';

  const direction: InventoryMovementDirection =
    row.direction === 'out' ? 'out' : 'in';

  const rawOrigin = String(row.origin_type || 'manual');
  const originType: InventoryMovementOriginType =
    rawOrigin === 'purchase_receipt' ||
    rawOrigin === 'inventory_count' ||
    rawOrigin === 'adjustment' ||
    rawOrigin === 'return' ||
    rawOrigin === 'combo_consumption' ||
    rawOrigin === 'sale' ||
    rawOrigin === 'online_order'
      ? rawOrigin
      : 'manual';

  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    movementType,
    direction,
    inputQuantity: roundQtyMapper(row.input_quantity),
    inputUnit: String(row.input_unit || 'unidade'),
    conversionFactorUsed: Math.max(0.001, roundQtyMapper(row.conversion_factor_used)),
    baseQuantity: roundQtyMapper(row.base_quantity),
    previousBalance: roundQtyMapper(row.previous_balance),
    newBalance: roundQtyMapper(row.new_balance),
    unitCost: roundUnitCostMapper(row.unit_cost),
    totalCost: roundCurrency(Math.max(0, Number(row.total_cost) || 0)),
    previousAvgCost: roundUnitCostMapper(row.previous_avg_cost),
    newAvgCost: roundUnitCostMapper(row.new_avg_cost),
    reason: String(row.reason || ''),
    notes: String(row.notes || ''),
    originType,
    originId: row.origin_id || null,
    supplierId: row.supplier_id || null,
    packagingConversionId: row.packaging_conversion_id || null,
    idempotencyKey: String(row.idempotency_key || ''),
    actorUserId: row.actor_user_id || null,
    actorEmail: String(row.actor_email || ''),
    createdAtMs: isoTimestampToMs(row.created_at),
  };
}

export function mapSupplierRow(row: SupabaseSupplierRow): SupplierRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: String(row.name || ''),
    tradeName: String(row.trade_name || ''),
    document: String(row.document || ''),
    phone: String(row.phone || ''),
    whatsapp: String(row.whatsapp || ''),
    email: String(row.email || ''),
    address: String(row.address || ''),
    notes: String(row.notes || ''),
    active: row.active !== false,
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function buildSupplierPayloadForSupabase(input: SupplierInput): {
  name: string;
  trade_name: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
} {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (name.length < 2) {
    throw new Error('Informe o nome do fornecedor (mínimo 2 caracteres).');
  }
  return {
    name,
    trade_name: String(input.tradeName || '').trim().slice(0, 120),
    document: String(input.document || '').trim().slice(0, 32),
    phone: String(input.phone || '').trim().slice(0, 32),
    whatsapp: String(input.whatsapp || '').trim().slice(0, 32),
    email: String(input.email || '').trim().slice(0, 120),
    address: String(input.address || '').trim().slice(0, 300),
    notes: String(input.notes || '').trim().slice(0, 600),
    active: input.active !== false,
  };
}

export function mapProductSupplierRow(
  row: SupabaseProductSupplierRow,
): ProductSupplierLinkRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    supplierId: row.supplier_id,
    supplierSku: String(row.supplier_sku || ''),
    lastUnitCost: roundUnitCostMapper(row.last_unit_cost),
    isPreferred: Boolean(row.is_preferred),
    notes: String(row.notes || ''),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function buildProductSupplierPayloadForSupabase(
  input: ProductSupplierLinkInput,
): {
  product_id: string;
  supplier_id: string;
  supplier_sku: string;
  last_unit_cost: number;
  is_preferred: boolean;
  notes: string;
} {
  return {
    product_id: input.productId,
    supplier_id: input.supplierId,
    supplier_sku: String(input.supplierSku || '').trim().slice(0, 60),
    last_unit_cost: roundUnitCostMapper(input.lastUnitCost ?? 0),
    is_preferred: Boolean(input.isPreferred),
    notes: String(input.notes || '').trim().slice(0, 300),
  };
}

export function mapPurchaseOrderRow(
  row: SupabasePurchaseOrderRow,
): PurchaseOrderRecord {
  const rawStatus = String(row.status || 'pending');
  const status: PurchaseOrderStatus =
    rawStatus === 'draft' ||
    rawStatus === 'pending' ||
    rawStatus === 'partially_received' ||
    rawStatus === 'received' ||
    rawStatus === 'cancelled'
      ? rawStatus
      : 'pending';

  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderNumber: Math.max(1, Number(row.order_number) || 1),
    supplierId: row.supplier_id,
    status,
    paymentTerms: String(row.payment_terms || ''),
    expectedDeliveryDate: row.expected_delivery_date || null,
    discountAmount: roundCurrency(Math.max(0, Number(row.discount_amount) || 0)),
    additionalExpenses: roundCurrency(
      Math.max(0, Number(row.additional_expenses) || 0),
    ),
    itemsSubtotal: roundCurrency(Math.max(0, Number(row.items_subtotal) || 0)),
    totalAmount: roundCurrency(Math.max(0, Number(row.total_amount) || 0)),
    notes: String(row.notes || ''),
    idempotencyKey: String(row.idempotency_key || ''),
    cancelledReason: String(row.cancelled_reason || ''),
    cancelledAtMs: row.cancelled_at ? isoTimestampToMs(row.cancelled_at) : null,
    createdByEmail: String(row.created_by_email || ''),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function mapPurchaseOrderItemRow(
  row: SupabasePurchaseOrderItemRow,
): PurchaseOrderItemRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    purchaseOrderId: row.purchase_order_id,
    productId: row.product_id,
    packagingConversionId: row.packaging_conversion_id || null,
    unitLabel: String(row.unit_label || 'unidade'),
    conversionFactor: Math.max(0.001, roundQtyMapper(row.conversion_factor)),
    orderedQty: roundQtyMapper(row.ordered_qty),
    orderedBaseQty: roundQtyMapper(row.ordered_base_qty),
    receivedBaseQty: Math.max(0, roundQtyMapper(row.received_base_qty)),
    unitCost: roundUnitCostMapper(row.unit_cost),
    totalCost: roundCurrency(Math.max(0, Number(row.total_cost) || 0)),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function mapPurchaseReceiptRow(
  row: SupabasePurchaseReceiptRow,
): PurchaseReceiptRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    purchaseOrderId: row.purchase_order_id,
    receiptNumber: Math.max(1, Number(row.receipt_number) || 1),
    notes: String(row.notes || ''),
    idempotencyKey: String(row.idempotency_key || ''),
    receivedByEmail: String(row.received_by_email || ''),
    receivedAtMs: isoTimestampToMs(row.received_at),
  };
}

export function mapPurchaseReceiptItemRow(
  row: SupabasePurchaseReceiptItemRow,
): PurchaseReceiptItemRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    receiptId: row.receipt_id,
    purchaseOrderItemId: row.purchase_order_item_id,
    productId: row.product_id,
    receivedQty: roundQtyMapper(row.received_qty),
    unitLabel: String(row.unit_label || 'unidade'),
    conversionFactor: Math.max(0.001, roundQtyMapper(row.conversion_factor)),
    receivedBaseQty: roundQtyMapper(row.received_base_qty),
    unitCost: roundUnitCostMapper(row.unit_cost),
    totalCost: roundCurrency(Math.max(0, Number(row.total_cost) || 0)),
    movementId: row.movement_id,
    createdAtMs: isoTimestampToMs(row.created_at),
  };
}

export function mapInventoryCountRow(
  row: SupabaseInventoryCountRow,
): InventoryCountRecord {
  const rawStatus = String(row.status || 'open');
  const status: InventoryCountStatus =
    rawStatus === 'finalized' || rawStatus === 'cancelled' ? rawStatus : 'open';
  return {
    id: row.id,
    tenantId: row.tenant_id,
    countNumber: Math.max(1, Number(row.count_number) || 1),
    title: String(row.title || ''),
    status,
    notes: String(row.notes || ''),
    startedByEmail: String(row.started_by_email || ''),
    finalizedByEmail: String(row.finalized_by_email || ''),
    finalizedAtMs: row.finalized_at ? isoTimestampToMs(row.finalized_at) : null,
    idempotencyKey: String(row.idempotency_key || ''),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function mapInventoryCountItemRow(
  row: SupabaseInventoryCountItemRow,
): InventoryCountItemRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    countId: row.count_id,
    productId: row.product_id,
    expectedQty: roundQtyMapper(row.expected_qty),
    countedQty:
      row.counted_qty !== null && row.counted_qty !== undefined
        ? roundQtyMapper(row.counted_qty)
        : null,
    differenceQty: roundQtyMapper(row.difference_qty),
    unitCostSnapshot: roundUnitCostMapper(row.unit_cost_snapshot),
    estimatedDifferenceValue: roundCurrency(
      Number(row.estimated_difference_value) || 0,
    ),
    adjustmentMovementId: row.adjustment_movement_id || null,
    notes: String(row.notes || ''),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

// ==================== ETAPA 5 — COMPOSICAO E CONSUMO DE COMBOS (ADEGA) ====================

export interface SupabaseComboComponentRow {
  id: string;
  tenant_id: string;
  combo_id: string;
  product_id: string;
  quantity: number | string;
  unit_label: string;
  conversion_factor: number | string;
  packaging_conversion_id: string | null;
  base_quantity: number | string;
  unit_cost_snapshot: number | string;
  total_cost_snapshot: number | string;
  sort_order: number | string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseComboConsumptionRow {
  id: string;
  tenant_id: string;
  combo_id: string | null;
  combo_name_snapshot: string;
  combo_quantity: number | string;
  sale_price_snapshot: number | string;
  total_cost_snapshot: number | string;
  origin_type: string;
  origin_id: string | null;
  notes: string;
  idempotency_key: string;
  actor_user_id: string | null;
  actor_email: string;
  created_at: string;
}

export interface SupabaseComboConsumptionItemRow {
  id: string;
  tenant_id: string;
  consumption_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  component_qty_per_combo: number | string;
  unit_label: string;
  conversion_factor: number | string;
  base_qty_per_combo: number | string;
  total_base_qty_deducted: number | string;
  unit_cost_snapshot: number | string;
  total_cost_snapshot: number | string;
  movement_id: string;
  created_at: string;
}

export function mapComboComponentRow(
  row: SupabaseComboComponentRow,
): ComboComponentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    comboId: row.combo_id,
    productId: row.product_id,
    quantity: Math.max(0.001, roundQtyMapper(row.quantity)),
    unitLabel: String(row.unit_label || 'unidade'),
    conversionFactor: Math.max(0.001, roundQtyMapper(row.conversion_factor)),
    packagingConversionId: row.packaging_conversion_id || null,
    baseQuantity: Math.max(0.001, roundQtyMapper(row.base_quantity)),
    unitCostSnapshot: roundUnitCostMapper(row.unit_cost_snapshot),
    totalCostSnapshot: roundCurrency(Math.max(0, Number(row.total_cost_snapshot) || 0)),
    sortOrder: Math.max(0, Math.trunc(Number(row.sort_order) || 0)),
    createdAtMs: isoTimestampToMs(row.created_at),
    updatedAtMs: isoTimestampToMs(row.updated_at),
  };
}

export function mapComboConsumptionItemRow(
  row: SupabaseComboConsumptionItemRow,
): ComboConsumptionItemSnapshot {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    consumptionId: row.consumption_id,
    productId: row.product_id || null,
    productNameSnapshot: String(row.product_name_snapshot || ''),
    componentQtyPerCombo: roundQtyMapper(row.component_qty_per_combo),
    unitLabel: String(row.unit_label || 'unidade'),
    conversionFactor: Math.max(0.001, roundQtyMapper(row.conversion_factor)),
    baseQtyPerCombo: roundQtyMapper(row.base_qty_per_combo),
    totalBaseQtyDeducted: roundQtyMapper(row.total_base_qty_deducted),
    unitCostSnapshot: roundUnitCostMapper(row.unit_cost_snapshot),
    totalCostSnapshot: roundCurrency(Math.max(0, Number(row.total_cost_snapshot) || 0)),
    movementId: row.movement_id,
    createdAtMs: isoTimestampToMs(row.created_at),
  };
}

export function mapComboConsumptionRow(
  row: SupabaseComboConsumptionRow,
  items: ComboConsumptionItemSnapshot[] = [],
): ComboConsumptionRecord {
  const rawOrigin = String(row.origin_type || 'combo_consumption');
  const originType: ComboConsumptionOriginType =
    rawOrigin === 'sale' || rawOrigin === 'online_order'
      ? rawOrigin
      : 'combo_consumption';

  return {
    id: row.id,
    tenantId: row.tenant_id,
    comboId: row.combo_id || null,
    comboNameSnapshot: String(row.combo_name_snapshot || ''),
    comboQuantity: Math.max(0.001, roundQtyMapper(row.combo_quantity)),
    salePriceSnapshot: roundCurrency(Math.max(0, Number(row.sale_price_snapshot) || 0)),
    totalCostSnapshot: roundCurrency(Math.max(0, Number(row.total_cost_snapshot) || 0)),
    originType,
    originId: row.origin_id || null,
    notes: String(row.notes || ''),
    idempotencyKey: String(row.idempotency_key || ''),
    actorUserId: row.actor_user_id || null,
    actorEmail: String(row.actor_email || ''),
    createdAtMs: isoTimestampToMs(row.created_at),
    items,
  };
}


