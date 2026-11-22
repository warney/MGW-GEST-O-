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

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

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
}

export interface PublicCatalogCombo {
  id: string;
  name: string;
  description: string;
  items: ComboProductItem[];
  salePrice: number;
  imageUrl?: string;
}

export interface PublicDigitalMenuPayload {
  found: boolean;
  store: DigitalMenuSettingsInput | null;
  products: PublicCatalogProduct[];
  combos: PublicCatalogCombo[];
}

export interface OnlineOrderCartItem {
  kind: 'product' | 'combo';
  id: string;
  quantity: number;
  note?: string;
}

export interface CreatePublicOrderPayload {
  slug?: string;
  customerName: string;
  customerPhone: string;
  fulfillmentType: OnlineOrderFulfillment;
  deliveryAddress: string;
  deliveryReference: string;
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
  orderNumber: number;
  orderCode: string;
  tokenHash: string;
  status: OnlineOrderStatus;
  fulfillmentType: OnlineOrderFulfillment;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryReference: string;
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
    itemNote: string;
  }>;
  statusHistory: OnlineOrderStatusEvent[];
}

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
}

export interface ComboProductItem {
  productId: string;
  productName: string;
  quantity: number;
  countsAsXSalada: boolean;
}

export interface ComboRecord {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  items: ComboProductItem[];
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
  items: ComboProductItem[];
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
  accessAllowed?: boolean;
  accessBlockReason?: TenantBillingBlockReason | null;
}

export interface AuthSessionUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}
