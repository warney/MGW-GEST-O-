import {
  type ComboInput,
  type ComboProductItem,
  type ComboRecord,
  DEFAULT_SHOP_SETTINGS,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseRecord,
  normalizePaymentMethod,
  PRODUCT_CATEGORIES,
  type ProductCategory,
  type ProductInput,
  type ProductRecord,
  type SaleInput,
  type SaleLineItemSnapshot,
  type SaleMode,
  type SaleRecord,
  type ShopSettings,
  type SubscriptionStatus,
  type TenantContext,
  type TenantRole,
} from '../types/finance';
import { calculateSaleTotal, roundCurrency } from '../utils/finance';

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
  if (subscription.status === 'exempt' || subscription.status === 'authorized') {
    return true;
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

  const role: TenantRole = member.role === 'owner' ? 'owner' : 'admin';
  const subStatus: SubscriptionStatus =
    subscription?.status === 'authorized' ||
    subscription?.status === 'paused' ||
    subscription?.status === 'cancelled' ||
    subscription?.status === 'exempt'
      ? subscription.status
      : tenantRaw.billing_exempt
        ? 'exempt'
        : 'pending';

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
