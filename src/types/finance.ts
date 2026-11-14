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
  | 'sales'
  | 'expenses'
  | 'reports'
  | 'settings';

export interface ProductRecord {
  id: string;
  ownerId: string;
  name: string;
  category: ProductCategory;
  unitPrice: number;
  countsAsXSalada: boolean;
  active: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ProductInput {
  name: string;
  category: ProductCategory;
  unitPrice: number;
  countsAsXSalada: boolean;
  active: boolean;
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
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ComboInput {
  name: string;
  description: string;
  items: ComboProductItem[];
  salePrice: number;
  estimatedCost: number;
  active: boolean;
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
  paymentMethod: PaymentMethod;
  note: string;
  saleMode?: SaleMode;
  xSaladaCount?: number;
  combosCount?: number;
  items?: SaleLineItemSnapshot[];
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
};
