import type { BusinessSegment } from './segments';

export const ADMIN_EMAILS = [
  'warney.fernandes22@gmail.com',
  'fernandes38mk@gmail.com',
] as const;

export const SEPARATE_SHOP_EMAIL = 'gf3163666@gmail.com';

export type WorkspaceId = 'mgw_lanches' | 'gf_lanches';

export interface WorkspaceAccess {
  id: WorkspaceId;
  label: string;
  defaultEstablishmentName: string;
  isSeparateAccount: boolean;
}

export const MGW_WORKSPACE: WorkspaceAccess = {
  id: 'mgw_lanches',
  label: 'MGW Lanches',
  defaultEstablishmentName: 'MGW Lanches',
  isSeparateAccount: false,
};

export const GF_WORKSPACE: WorkspaceAccess = {
  id: 'gf_lanches',
  label: 'Outro Lanche (Conta Separada)',
  defaultEstablishmentName: 'Meu Lanche',
  isSeparateAccount: true,
};

export function resolveWorkspaceForEmail(
  email?: string | null,
): WorkspaceAccess | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (ADMIN_EMAILS.some((allowed) => allowed.toLowerCase() === normalized)) {
    return MGW_WORKSPACE;
  }
  if (normalized === SEPARATE_SHOP_EMAIL.toLowerCase()) {
    return GF_WORKSPACE;
  }
  return null;
}

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  return resolveWorkspaceForEmail(email) !== null;
}

export const PAYMENT_METHODS = [
  'Pix',
  'Dinheiro',
  'Cartão de débito',
  'Cartão de crédito',
  'Outros',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number] | 'Crédito';

export function normalizePaymentMethod(
  raw: string | undefined | null,
): (typeof PAYMENT_METHODS)[number] {
  if (raw === 'Crédito' || raw === 'Cartão de crédito') {
    return 'Cartão de crédito';
  }
  if (
    raw === 'Pix' ||
    raw === 'Dinheiro' ||
    raw === 'Cartão de débito' ||
    raw === 'Outros'
  ) {
    return raw;
  }
  return 'Dinheiro';
}

export const PRODUCT_CATEGORIES = [
  'Lanche',
  'Bebida',
  'Adicional',
  'Outro',
] as const;

// Categories are tenant-defined. PRODUCT_CATEGORIES remains only as legacy defaults.
export type ProductCategory = string;

export interface ProductCategoryRecord {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface AddonOptionRecord {
  id: string;
  groupId: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
}

export interface AddonGroupRecord {
  id: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  active: boolean;
  sortOrder: number;
  options: AddonOptionRecord[];
}

export interface PublicProductAddonGroup extends AddonGroupRecord {}

export interface SelectedProductAddon {
  groupId: string;
  optionIds: string[];
}

export const EXPENSE_CATEGORIES = [
  'Ingredientes',
  'Carnes e hambúrgueres',
  'Pães',
  'Queijos e frios',
  'Bebidas',
  'Embalagens',
  'Gás',
  'Energia',
  'Transporte',
  'Outros',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type DashboardGranularity = 'daily' | 'weekly' | 'monthly';

export type ReportPeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

export type AppRoute =
  | 'dashboard'
  | 'orders'
  | 'delivery'
  | 'delivery_customers'
  | 'delivery_couriers'
  | 'delivery_dispatch'
  | 'delivery_regions'
  | 'delivery_finance'
  | 'delivery_reports'
  | 'inventory'
  | 'sales'
  | 'expenses'
  | 'reports'
  | 'settings';

export type SaleOrigin = 'manual' | 'online';

export type OnlineOrderStatus =
  | 'received'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'ready_for_pickup'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type OnlineOrderFulfillment = 'delivery' | 'pickup';

export type OnlineOrderPaymentMethod = 'Pix' | 'Dinheiro' | 'Cartão';

export interface DigitalMenuSettings {
  tenantId: string;
  slug: string;
  isActive: boolean;
  isOpen: boolean;
  storeName: string;
  description: string;
  phoneWhatsapp: string;
  address: string;
  openingHours: string;
  pixKey: string;
  deliveryFee: number;
  minimumOrderAmount: number;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  logoUrl?: string;
  logoPath?: string;
  bannerUrl?: string;
  bannerPath?: string;
  updatedAtMs?: number;
}

export type DigitalMenuSettingsInput = Omit<
  DigitalMenuSettings,
  'tenantId' | 'updatedAtMs'
>;

export interface PublicCatalogProduct {
  id: string;
  name: string;
  category: ProductCategory;
  unitPrice: number;
  countsAsXSalada: boolean;
  imageUrl?: string;
  addonGroups?: PublicProductAddonGroup[];
}

export interface PublicCatalogCombo {
  id: string;
  name: string;
  description: string;
  items: ComboProductItem[];
  salePrice: number;
  imageUrl?: string;
  category?: string;
  isAvailable?: boolean;
  maxAvailableQty?: number | null;
}

export interface PublicDigitalMenuPayload {
  found: boolean;
  store: (DigitalMenuSettingsInput & { timezone?: string; businessSegment?: BusinessSegment }) | null;
  products: PublicCatalogProduct[];
  combos: PublicCatalogCombo[];
  deliveryPricing?: PublicDeliveryPricingSettings | null;
  deliveryRegions?: PublicDeliveryRegion[];
}

export interface OnlineOrderCartItem {
  kind: 'product' | 'combo';
  id: string;
  quantity: number;
  note?: string;
  selectedAddons?: SelectedProductAddon[];
}

export interface CreatePublicOrderPayload {
  slug?: string;
  customerName: string;
  customerPhone: string;
  fulfillmentType: OnlineOrderFulfillment;
  deliveryAddress: string;
  deliveryReference: string;
  deliveryNeighborhood?: string;
  deliveryCity?: string;
  deliveryRegionId?: string | null;
  paymentMethod: OnlineOrderPaymentMethod;
  changeFor: number | null;
  customerNote: string;
  items: OnlineOrderCartItem[];
}

export interface CreatePublicOrderResponse {
  orderId: string;
  orderNumber: number;
  orderCode: string;
  trackingToken: string;
  tokenHash?: string;
  status: OnlineOrderStatus;
  subtotalAmount: number;
  deliveryFee: number;
  totalAmount: number;
  deliveryRegionName?: string;
  deliveryNeighborhood?: string;
  deliveryCity?: string;
  deliveryFeeRule?: DeliveryFeeRuleApplied;
  deliveryFreeApplied?: boolean;
}

export interface OnlineOrderItemSnapshot {
  id: string;
  itemKind: 'product' | 'combo';
  refId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  estimatedUnitCost: number;
  xSaladasPerUnit: number;
  components: SaleLineComponentSnapshot[];
  selectedAddons: Array<{ groupId: string; groupName: string; options: Array<{ id: string; name: string; price: number }> }>;
  itemNote: string;
}

export interface OnlineOrderStatusEvent {
  id: string;
  fromStatus: OnlineOrderStatus | null;
  toStatus: OnlineOrderStatus;
  reason: string;
  actorType?: 'customer' | 'admin' | 'system';
  createdAtMs: number;
}

export interface OnlineOrderRecord {
  id: string;
  tenantId: string;
  customerId?: string | null;
  orderNumber: number;
  orderCode: string;
  tokenHash: string;
  status: OnlineOrderStatus;
  fulfillmentType: OnlineOrderFulfillment;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryReference: string;
  deliveryRegionId?: string | null;
  deliveryRegionName?: string;
  deliveryNeighborhood?: string;
  deliveryCity?: string;
  deliveryBaseFee?: number;
  deliveryFeeRule?: DeliveryFeeRuleApplied;
  deliveryMinimumOrderApplied?: number;
  deliveryFreeApplied?: boolean;
  deliveryFreeThresholdApplied?: number;
  paymentMethod: OnlineOrderPaymentMethod;
  changeFor: number | null;
  customerNote: string;
  subtotalAmount: number;
  deliveryFee: number;
  totalAmount: number;
  rejectionReason: string;
  viewedAtMs: number | null;
  acceptedAtMs: number | null;
  preparingAtMs: number | null;
  readyAtMs: number | null;
  dispatchedAtMs: number | null;
  completedAtMs: number | null;
  cancelledAtMs: number | null;
  saleId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  items: OnlineOrderItemSnapshot[];
  statusHistory: OnlineOrderStatusEvent[];
}

export interface PublicOrderTrackingRecord {
  orderId: string;
  tokenHash?: string;
  orderNumber: number;
  orderCode: string;
  status: OnlineOrderStatus;
  fulfillmentType: OnlineOrderFulfillment;
  customerName: string;
  deliveryAddress: string;
  deliveryReference: string;
  deliveryRegionName?: string;
  deliveryNeighborhood?: string;
  deliveryCity?: string;
  deliveryBaseFee?: number;
  deliveryFeeRule?: DeliveryFeeRuleApplied;
  deliveryMinimumOrderApplied?: number;
  deliveryFreeApplied?: boolean;
  deliveryFreeThresholdApplied?: number;
  paymentMethod: OnlineOrderPaymentMethod;
  changeFor: number | null;
  customerNote: string;
  subtotalAmount: number;
  deliveryFee: number;
  totalAmount: number;
  rejectionReason: string;
  storeName: string;
  storeSlug: string;
  storeWhatsapp: string;
  storeAddress: string;
  storePixKey: string;
  createdAtMs: number;
  updatedAtMs: number;
  items: Array<{
    id: string;
    itemKind: 'product' | 'combo';
    refId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    selectedAddons: Array<{ groupId: string; groupName: string; options: Array<{ id: string; name: string; price: number }> }>;
    itemNote: string;
  }>;
  statusHistory: OnlineOrderStatusEvent[];
}

export type ProductVolumeUnit = 'ml' | 'l' | 'g' | 'kg' | 'un';

export type ProductSaleUnit =
  | 'unidade'
  | 'garrafa'
  | 'lata'
  | 'pacote'
  | 'caixa'
  | 'fardo';

export type ProductPackageType = 'individual' | 'pacote' | 'caixa' | 'fardo';

export interface ProductRecord {
  id: string;
  ownerId: string;
  name: string;
  category: ProductCategory;
  unitPrice: number;
  countsAsXSalada: boolean;
  active: boolean;
  imageUrl?: string;
  imagePath?: string;
  description?: string;
  internalCode?: string | null;
  costPrice?: number;
  brand?: string;
  notes?: string;
  barcode?: string | null;
  volumeValue?: number | null;
  volumeUnit?: ProductVolumeUnit | null;
  saleUnit?: ProductSaleUnit;
  packageType?: ProductPackageType;
  unitsPerPackage?: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ProductInput {
  preferredId?: string;
  name: string;
  category: ProductCategory;
  unitPrice: number;
  countsAsXSalada: boolean;
  active: boolean;
  imageUrl?: string;
  imagePath?: string;
  description?: string;
  internalCode?: string | null;
  costPrice?: number;
  brand?: string;
  notes?: string;
  barcode?: string | null;
  volumeValue?: number | null;
  volumeUnit?: ProductVolumeUnit | null;
  saleUnit?: ProductSaleUnit;
  packageType?: ProductPackageType;
  unitsPerPackage?: number;
}

export interface ComboProductItem {
  productId: string;
  productName: string;
  quantity: number;
  countsAsXSalada: boolean;
}

export interface ComboComponentRecord {
  id: string;
  tenantId: string;
  comboId: string;
  productId: string;
  quantity: number;
  unitLabel: string;
  conversionFactor: number;
  packagingConversionId: string | null;
  baseQuantity: number;
  unitCostSnapshot: number;
  totalCostSnapshot: number;
  sortOrder: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ComboComponentInput {
  productId: string;
  quantity: number;
  unitLabel?: string;
  conversionFactor?: number;
  packagingConversionId?: string | null;
}

export interface ComboRecord {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  category?: string;
  notes?: string;
  items: ComboProductItem[];
  components?: ComboComponentRecord[];
  salePrice: number;
  estimatedCost: number;
  active: boolean;
  imageUrl?: string;
  imagePath?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ComboInput {
  preferredId?: string;
  name: string;
  description: string;
  category?: string;
  notes?: string;
  items: ComboProductItem[];
  components?: ComboComponentInput[];
  salePrice: number;
  estimatedCost: number;
  active: boolean;
  imageUrl?: string;
  imagePath?: string;
}

export type SaleMode = 'individual' | 'combo' | 'mixed';

export interface SaleLineComponentSnapshot {
  productId: string;
  productName: string;
  quantityPerUnit: number;
  totalQuantity: number;
  countsAsXSalada: boolean;
}

export interface SaleLineItemSnapshot {
  kind: 'product' | 'combo';
  refId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  selectedAddons?: Array<{
    groupId: string;
    groupName: string;
    options: Array<{ id: string; name: string; price: number }>;
  }>;
  estimatedUnitCost: number;
  xSaladasPerUnit: number;
  components: SaleLineComponentSnapshot[];
}

export interface SaleRecord {
  id: string;
  ownerId: string;
  date: string; // YYYY-MM-DD
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  note: string;
  saleMode?: SaleMode;
  xSaladaCount?: number;
  combosCount?: number;
  items?: SaleLineItemSnapshot[];
  saleOrigin?: SaleOrigin;
  onlineOrderId?: string | null;
  onlineOrderNumber?: number | null;
  deliveryFee?: number;
  customerId?: string | null;
  customerName?: string;
  customerAddress?: string;
  customerNumber?: string;
  customerNeighborhood?: string;
  customerComplement?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ExpenseRecord {
  id: string;
  ownerId: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  note: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ShopSettings {
  ownerId: string;
  establishmentName: string;
  xSaladaPrice: number;
  dailyGoal: number;
  monthlyGoal: number;
  startDate: string; // YYYY-MM-DD
  timezone?: string;
}

export interface SaleOrderDraftItem {
  kind: 'product' | 'combo';
  refId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  estimatedUnitCost: number;
  components: Array<{
    productId: string;
    productName: string;
    quantityPerUnit: number;
    countsAsXSalada: boolean;
  }>;
}

export interface SaleInput {
  date: string;
  quantity: number;
  unitPrice: number;
  totalAmount?: number;
  paymentMethod: PaymentMethod;
  note: string;
  saleMode?: SaleMode;
  xSaladaCount?: number;
  combosCount?: number;
  items?: SaleLineItemSnapshot[];
  saleOrigin?: SaleOrigin;
  onlineOrderId?: string | null;
  onlineOrderNumber?: number | null;
  deliveryFee?: number;
  customerId?: string | null;
  customerName?: string;
  customerAddress?: string;
  customerNumber?: string;
  customerNeighborhood?: string;
  customerComplement?: string;
}

export interface ExpenseInput {
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  paymentMethod: PaymentMethod;
  note: string;
}

export const DEFAULT_SHOP_SETTINGS: Omit<ShopSettings, 'ownerId'> = {
  establishmentName: 'MGW Lanches',
  xSaladaPrice: 22.0,
  dailyGoal: 800.0,
  monthlyGoal: 18000.0,
  startDate: '2026-01-01',
  timezone: 'America/Manaus',
};


export type TenantRole = 'owner' | 'admin' | 'manager' | 'staff';

export type SubscriptionStatus =
  | 'pending'
  | 'trialing'
  | 'active'
  | 'authorized'
  | 'past_due'
  | 'paused'
  | 'cancelled'
  | 'expired'
  | 'suspended'
  | 'free'
  | 'exempt';

export type RetentionStatus = 'none' | 'active_retention' | 'expired';

export type TenantBillingBlockReason =
  | 'trial_expired'
  | 'grace_expired'
  | 'cancelled_ended'
  | 'retention_active'
  | 'billing_pending'
  | 'tenant_suspended'
  | 'subscription_missing';

export interface TenantContext {
  tenantId: string;
  slug: string;
  name: string;
  role: TenantRole;
  isFounderAccount: boolean;
  billingExempt: boolean;
  subscriptionStatus: SubscriptionStatus;
  graceUntil: string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  endedAt?: string | null;
  retentionStartedAt?: string | null;
  retentionEndsAt?: string | null;
  retentionStatus?: RetentionStatus;
  onboardingCompleted?: boolean;
  businessSegment?: BusinessSegment;
  accessAllowed?: boolean;
  accessBlockReason?: TenantBillingBlockReason | null;
}

export interface AuthSessionUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

// ==================== MGW DELIVERY — CLIENTES ====================

export type DeliveryCustomerClassification =
  | 'new'
  | 'recurring'
  | 'vip'
  | 'inactive';

export interface DeliveryCustomerClassificationConfig {
  recurringMinOrders: number;
  vipMinOrders: number;
  vipMinSpent: number;
  inactiveDays: number;
}

export interface DeliveryCustomerAddressRecord {
  id: string;
  tenantId: string;
  customerId: string;
  label: string;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  reference: string;
  city: string;
  state: string;
  isPrimary: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface DeliveryCustomerAddressInput {
  label?: string;
  cep?: string;
  street: string;
  number?: string;
  neighborhood?: string;
  complement?: string;
  reference?: string;
  city?: string;
  state?: string;
  isPrimary?: boolean;
}

export interface DeliveryCustomerRecord {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  email: string;
  cpf: string;
  birthDate: string | null;
  notes: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface DeliveryCustomerInput {
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  birthDate?: string | null;
  notes?: string;
}

export interface DeliveryCustomerWithMetrics {
  customer: DeliveryCustomerRecord;
  addresses: DeliveryCustomerAddressRecord[];
  primaryAddress: DeliveryCustomerAddressRecord | null;
  orders: OnlineOrderRecord[];
  validOrdersCount: number;
  cancelledOrdersCount: number;
  totalSpent: number;
  averageTicket: number;
  firstOrderAtMs: number | null;
  lastOrderAtMs: number | null;
  classification: DeliveryCustomerClassification;
}

// ==================== MGW DELIVERY — ENTREGADORES (MOTOBOYS) ====================

export type DeliveryCourierStatus = 'active' | 'inactive';

export type DeliveryCourierAvailability = 'available' | 'unavailable';

export type DeliveryCourierType = 'own' | 'outsourced';

export type CourierOperationalAvailability =
  | 'available'
  | 'occupied'
  | 'unavailable';

export interface DeliveryCourierRecord {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  whatsapp: string;
  normalizedWhatsapp: string;
  cpf: string;
  email: string;
  motorcycleBrand: string;
  motorcycleModel: string;
  motorcycleColor: string;
  motorcyclePlate: string;
  courierType: DeliveryCourierType;
  status: DeliveryCourierStatus;
  availabilityStatus: DeliveryCourierAvailability;
  notes: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface DeliveryCourierInput {
  name: string;
  phone: string;
  whatsapp?: string;
  cpf?: string;
  email?: string;
  motorcycleBrand?: string;
  motorcycleModel?: string;
  motorcycleColor?: string;
  motorcyclePlate?: string;
  courierType?: DeliveryCourierType;
  status?: DeliveryCourierStatus;
  availabilityStatus?: DeliveryCourierAvailability;
  notes?: string;
}

// ==================== MGW DELIVERY — CENTRAL DE DESPACHO ====================

export type DeliveryDispatchStatus =
  | 'awaiting_dispatch'
  | 'courier_assigned'
  | 'awaiting_acceptance'
  | 'delivery_accepted'
  | 'preparing'
  | 'ready_for_dispatch'
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_rejected'
  | 'delivery_cancelled';

export type DeliveryDispatchActorType = 'admin' | 'courier' | 'system';

export interface DeliveryDispatchHistoryRecord {
  id: string;
  tenantId: string;
  dispatchId: string;
  orderId: string;
  courierId: string | null;
  courierName: string;
  fromStatus: DeliveryDispatchStatus | null;
  toStatus: DeliveryDispatchStatus;
  actorUserId: string | null;
  actorEmail: string;
  actorType: DeliveryDispatchActorType;
  reason: string;
  createdAtMs: number;
}

export interface DeliveryDispatchRecord {
  id: string;
  tenantId: string;
  orderId: string;
  courierId: string;
  dispatchStatus: DeliveryDispatchStatus;
  courierNameSnapshot: string;
  courierPhoneSnapshot: string;
  courierTypeSnapshot: DeliveryCourierType;
  assignedByUserId: string | null;
  assignedByEmail: string;
  assignedAtMs: number;
  acceptedAtMs: number | null;
  dispatchedAtMs: number | null;
  deliveredAtMs: number | null;
  rejectedAtMs: number | null;
  cancelledAtMs: number | null;
  rejectionReason: string;
  cancellationReason: string;
  notes: string;
  createdAtMs: number;
  updatedAtMs: number;
}

// ==================== MGW DELIVERY — REGIÕES E TAXAS DE ENTREGA ====================

export type DeliveryRegionStatus = 'active' | 'inactive';

export type DeliveryPricingMode = 'by_neighborhood' | 'by_region' | 'default_only';

export type DeliveryFeeRuleApplied =
  | 'neighborhood'
  | 'region'
  | 'default_fallback'
  | 'store_default'
  | 'pickup';

export interface DeliveryRegionRecord {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  neighborhoods: string[];
  description: string;
  deliveryFee: number;
  minimumOrderAmount: number;
  estimatedTime: string;
  status: DeliveryRegionStatus;
  isTemporarilySuspended: boolean;
  suspensionReason: string;
  scheduleEnabled: boolean;
  scheduleDays: number[]; // 0=Dom .. 6=Sáb
  scheduleStart: string; // HH:MM
  scheduleEnd: string; // HH:MM
  notes: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface DeliveryRegionInput {
  name: string;
  city: string;
  neighborhoods: string[];
  description?: string;
  deliveryFee: number;
  minimumOrderAmount?: number;
  estimatedTime?: string;
  status?: DeliveryRegionStatus;
  isTemporarilySuspended?: boolean;
  suspensionReason?: string;
  scheduleEnabled?: boolean;
  scheduleDays?: number[];
  scheduleStart?: string;
  scheduleEnd?: string;
  notes?: string;
}

export interface PublicDeliveryRegion {
  id: string;
  name: string;
  city: string;
  neighborhoods: string[];
  description: string;
  deliveryFee: number;
  minimumOrderAmount: number;
  estimatedTime: string;
  status: DeliveryRegionStatus;
  isTemporarilySuspended: boolean;
  suspensionReason: string;
  scheduleEnabled: boolean;
  scheduleDays: number[];
  scheduleStart: string;
  scheduleEnd: string;
}

export interface DeliveryPricingSettings {
  tenantId: string;
  pricingMode: DeliveryPricingMode;
  defaultFeeEnabled: boolean;
  defaultDeliveryFee: number;
  defaultMinimumOrderAmount: number;
  defaultEstimatedTime: string;
  freeDeliveryEnabled: boolean;
  freeDeliveryMinAmount: number;
  updatedAtMs?: number;
}

export type DeliveryPricingSettingsInput = Omit<
  DeliveryPricingSettings,
  'tenantId' | 'updatedAtMs'
>;

export type PublicDeliveryPricingSettings = DeliveryPricingSettingsInput;

export interface DeliveryCoverageResolution {
  available: boolean;
  reasonCode:
    | 'pickup'
    | 'matched_region'
    | 'default_fallback'
    | 'store_default'
    | 'missing_neighborhood'
    | 'region_inactive'
    | 'region_suspended'
    | 'outside_schedule'
    | 'outside_coverage';
  message: string;
  matchedRegion: PublicDeliveryRegion | null;
  matchedNeighborhood: string;
  matchedCity: string;
  baseDeliveryFee: number;
  appliedDeliveryFee: number;
  minimumOrderAmount: number;
  estimatedTime: string;
  feeRule: DeliveryFeeRuleApplied;
  freeDeliveryApplied: boolean;
  freeDeliveryThreshold: number;
  missingForFreeDelivery: number;
}

// ==================== ETAPA 4 — ESTOQUE PROFISSIONAL (SEGMENTO ADEGA) ====================

export type InventoryStockStatus = 'normal' | 'near_minimum' | 'low' | 'out_of_stock';

export type InventoryMovementType =
  | 'manual_entry'
  | 'purchase_receipt'
  | 'manual_exit'
  | 'loss'
  | 'damage'
  | 'expiry'
  | 'internal_consumption'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'inventory_adjustment'
  | 'return_in'
  | 'combo_consumption';

export type InventoryMovementDirection = 'in' | 'out';

export type InventoryMovementOriginType =
  | 'manual'
  | 'purchase_receipt'
  | 'inventory_count'
  | 'adjustment'
  | 'return'
  | 'combo_consumption'
  | 'sale'
  | 'online_order';

export interface InventoryBalanceRecord {
  id: string;
  tenantId: string;
  productId: string;
  availableQty: number;
  reservedQty: number;
  minStockQty: number;
  averageUnitCost: number;
  lastCostPrice: number;
  allowNegativeStock: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface InventoryPackagingConversionRecord {
  id: string;
  tenantId: string;
  productId: string;
  packageLabel: string;
  packageType: ProductSaleUnit;
  factorToBase: number;
  isDefaultPurchase: boolean;
  active: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface InventoryPackagingConversionInput {
  productId: string;
  packageLabel: string;
  packageType: ProductSaleUnit;
  factorToBase: number;
  isDefaultPurchase?: boolean;
  active?: boolean;
}

export interface InventoryMovementRecord {
  id: string;
  tenantId: string;
  productId: string;
  movementType: InventoryMovementType;
  direction: InventoryMovementDirection;
  inputQuantity: number;
  inputUnit: string;
  conversionFactorUsed: number;
  baseQuantity: number;
  previousBalance: number;
  newBalance: number;
  unitCost: number;
  totalCost: number;
  previousAvgCost: number;
  newAvgCost: number;
  reason: string;
  notes: string;
  originType: InventoryMovementOriginType;
  originId: string | null;
  supplierId: string | null;
  packagingConversionId: string | null;
  idempotencyKey: string;
  actorUserId: string | null;
  actorEmail: string;
  createdAtMs: number;
}

export interface RecordInventoryMovementInput {
  productId: string;
  movementType: Exclude<InventoryMovementType, 'purchase_receipt' | 'inventory_adjustment'>;
  inputQuantity: number;
  inputUnit?: string;
  conversionFactor?: number;
  totalCost?: number | null;
  reason?: string;
  notes?: string;
  supplierId?: string | null;
  packagingConversionId?: string | null;
  idempotencyKey?: string;
  allowNegativeOverride?: boolean;
}

export interface SupplierRecord {
  id: string;
  tenantId: string;
  name: string;
  tradeName: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SupplierInput {
  name: string;
  tradeName?: string;
  document?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  notes?: string;
  active?: boolean;
}

export interface ProductSupplierLinkRecord {
  id: string;
  tenantId: string;
  productId: string;
  supplierId: string;
  supplierSku: string;
  lastUnitCost: number;
  isPreferred: boolean;
  notes: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ProductSupplierLinkInput {
  productId: string;
  supplierId: string;
  supplierSku?: string;
  lastUnitCost?: number;
  isPreferred?: boolean;
  notes?: string;
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface PurchaseOrderItemRecord {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  productId: string;
  packagingConversionId: string | null;
  unitLabel: string;
  conversionFactor: number;
  orderedQty: number;
  orderedBaseQty: number;
  receivedBaseQty: number;
  unitCost: number;
  totalCost: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PurchaseOrderRecord {
  id: string;
  tenantId: string;
  orderNumber: number;
  supplierId: string;
  status: PurchaseOrderStatus;
  paymentTerms: string;
  expectedDeliveryDate: string | null;
  discountAmount: number;
  additionalExpenses: number;
  itemsSubtotal: number;
  totalAmount: number;
  notes: string;
  idempotencyKey: string;
  cancelledReason: string;
  cancelledAtMs: number | null;
  createdByEmail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PurchaseOrderItemInput {
  productId: string;
  packagingConversionId?: string | null;
  unitLabel: string;
  conversionFactor: number;
  orderedQty: number;
  unitCost: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  status?: 'draft' | 'pending';
  paymentTerms?: string;
  expectedDeliveryDate?: string | null;
  discountAmount?: number;
  additionalExpenses?: number;
  notes?: string;
  items: PurchaseOrderItemInput[];
  idempotencyKey?: string;
}

export interface PurchaseReceiptItemRecord {
  id: string;
  tenantId: string;
  receiptId: string;
  purchaseOrderItemId: string;
  productId: string;
  receivedQty: number;
  unitLabel: string;
  conversionFactor: number;
  receivedBaseQty: number;
  unitCost: number;
  totalCost: number;
  movementId: string;
  createdAtMs: number;
}

export interface PurchaseReceiptRecord {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  receiptNumber: number;
  notes: string;
  idempotencyKey: string;
  receivedByEmail: string;
  receivedAtMs: number;
}

export interface ReceivePurchaseItemInput {
  purchaseOrderItemId: string;
  receivedQty: number;
  unitCost?: number;
}

export type InventoryCountStatus = 'open' | 'finalized' | 'cancelled';

export interface InventoryCountRecord {
  id: string;
  tenantId: string;
  countNumber: number;
  title: string;
  status: InventoryCountStatus;
  notes: string;
  startedByEmail: string;
  finalizedByEmail: string;
  finalizedAtMs: number | null;
  idempotencyKey: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface InventoryCountItemRecord {
  id: string;
  tenantId: string;
  countId: string;
  productId: string;
  expectedQty: number;
  countedQty: number | null;
  differenceQty: number;
  unitCostSnapshot: number;
  estimatedDifferenceValue: number;
  adjustmentMovementId: string | null;
  notes: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type ComboConsumptionOriginType =
  | 'combo_consumption'
  | 'sale'
  | 'online_order';

export interface ComboConsumptionItemSnapshot {
  id: string;
  tenantId: string;
  consumptionId: string;
  productId: string | null;
  productNameSnapshot: string;
  componentQtyPerCombo: number;
  unitLabel: string;
  conversionFactor: number;
  baseQtyPerCombo: number;
  totalBaseQtyDeducted: number;
  unitCostSnapshot: number;
  totalCostSnapshot: number;
  movementId: string;
  createdAtMs: number;
}

export interface ComboConsumptionRecord {
  id: string;
  tenantId: string;
  comboId: string | null;
  comboNameSnapshot: string;
  comboQuantity: number;
  salePriceSnapshot: number;
  totalCostSnapshot: number;
  originType: ComboConsumptionOriginType;
  originId: string | null;
  notes: string;
  idempotencyKey: string;
  actorUserId: string | null;
  actorEmail: string;
  createdAtMs: number;
  items: ComboConsumptionItemSnapshot[];
}

export interface ComboAvailabilityComponentDetail {
  productId: string;
  productName: string;
  unitLabel: string;
  conversionFactor: number;
  requiredPerComboInput: number;
  requiredPerComboBase: number;
  requiredTotalBase: number;
  availableQty: number;
  allowNegativeStock: boolean;
  sufficient: boolean;
  maxCombosFromComponent: number | null;
}

export interface ComboAvailabilityResult {
  comboId: string;
  comboName: string;
  requestedQuantity: number;
  available: boolean;
  maxProducibleQty: number | null;
  limitingProductId: string | null;
  limitingProductName: string | null;
  components: ComboAvailabilityComponentDetail[];
}

export interface ConsumeComboInput {
  comboId: string;
  comboQuantity: number;
  originType?: ComboConsumptionOriginType;
  originId?: string | null;
  notes?: string;
  idempotencyKey?: string;
}

export interface ConsumeComboResult {
  consumptionId: string;
  comboId: string;
  comboQuantity: number;
  totalCost: number;
  idempotentReplay: boolean;
  movements: Array<{
    productId: string;
    movementId: string;
    deductedBaseQty: number;
    newBalance: number;
  }>;
}

export interface InventoryDataBundle {
  balances: InventoryBalanceRecord[];
  packagingConversions: InventoryPackagingConversionRecord[];
  movements: InventoryMovementRecord[];
  suppliers: SupplierRecord[];
  productSuppliers: ProductSupplierLinkRecord[];
  purchaseOrders: PurchaseOrderRecord[];
  purchaseOrderItems: PurchaseOrderItemRecord[];
  purchaseReceipts: PurchaseReceiptRecord[];
  purchaseReceiptItems: PurchaseReceiptItemRecord[];
  inventoryCounts: InventoryCountRecord[];
  inventoryCountItems: InventoryCountItemRecord[];
  comboConsumptions?: ComboConsumptionRecord[];
}
