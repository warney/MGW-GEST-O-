import type {
  OnlineOrderCartItem,
  OnlineOrderFulfillment,
  OnlineOrderPaymentMethod,
} from '../types/finance';

export const CUSTOMER_PROFILE_STORAGE_KEY = 'mgw_menu_customer_profile_v1';

export interface StoredCustomerProfile {
  customerName: string;
  customerPhone: string;
  fulfillmentType: OnlineOrderFulfillment;
  deliveryAddress: string;
  deliveryReference: string;
  paymentMethod: OnlineOrderPaymentMethod;
}

export function buildCartStorageKey(slug: string): string {
  const clean = slug.trim().toLowerCase() || 'default';
  return `mgw_menu_cart_${clean}`;
}

export function getStoreMonogram(storeName: string): string {
  const cleaned = storeName.trim();
  if (!cleaned) return 'M';
  const match = cleaned.match(/[A-Za-zÀ-ÿ0-9]/);
  return match ? match[0].toUpperCase() : cleaned.charAt(0).toUpperCase();
}

export function formatComboComposition(
  items: Array<{ quantity: number; productName: string }>,
): string {
  return items
    .filter((i) => i.quantity > 0 && i.productName.trim().length > 0)
    .map((i) => `${i.quantity}x ${i.productName.trim()}`)
    .join(' + ');
}

function normalizeCompositionText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^inclui\s*:\s*/i, '')
    .replace(/\b(\d+)x(?=\s|$)/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token))
    .join(' ');
}

export function shouldShowComboComposition(
  description: string,
  items: Array<{ quantity: number; productName: string }>,
): boolean {
  const composition = formatComboComposition(items);
  if (!composition) return false;
  const trimmedDesc = description.trim();
  if (!trimmedDesc) return true;

  const normDesc = normalizeCompositionText(trimmedDesc);
  const normComp = normalizeCompositionText(composition);
  if (!normDesc || !normComp) return true;

  return normDesc !== normComp;
}

export function parseStoredCart(raw: string | null): OnlineOrderCartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid: OnlineOrderCartItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      const kind = obj.kind === 'combo' || obj.kind === 'product' ? obj.kind : null;
      const id = typeof obj.id === 'string' ? obj.id.trim() : '';
      const qtyRaw = typeof obj.quantity === 'number' ? Math.floor(obj.quantity) : 0;
      const note = typeof obj.note === 'string' ? obj.note.slice(0, 200) : '';
      if (!kind || !id || qtyRaw <= 0) continue;
      valid.push({
        kind,
        id,
        quantity: Math.min(99, qtyRaw),
        note,
      });
    }
    return valid;
  } catch {
    return [];
  }
}

export function serializeStoredCart(cart: OnlineOrderCartItem[]): string {
  const clean = cart
    .filter((item) => item.id && item.quantity > 0)
    .map((item) => ({
      kind: item.kind,
      id: item.id,
      quantity: Math.min(99, Math.max(1, Math.floor(item.quantity))),
      note: (item.note || '').slice(0, 200),
    }));
  return JSON.stringify(clean);
}

export function parseStoredCustomerProfile(
  raw: string | null,
): Partial<StoredCustomerProfile> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;

    const result: Partial<StoredCustomerProfile> = {};
    if (typeof obj.customerName === 'string') {
      result.customerName = obj.customerName.slice(0, 80);
    }
    if (typeof obj.customerPhone === 'string') {
      result.customerPhone = obj.customerPhone.slice(0, 24);
    }
    if (obj.fulfillmentType === 'delivery' || obj.fulfillmentType === 'pickup') {
      result.fulfillmentType = obj.fulfillmentType;
    }
    if (typeof obj.deliveryAddress === 'string') {
      result.deliveryAddress = obj.deliveryAddress.slice(0, 200);
    }
    if (typeof obj.deliveryReference === 'string') {
      result.deliveryReference = obj.deliveryReference.slice(0, 140);
    }
    if (
      obj.paymentMethod === 'Pix' ||
      obj.paymentMethod === 'Dinheiro' ||
      obj.paymentMethod === 'Cartão'
    ) {
      result.paymentMethod = obj.paymentMethod;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

export function serializeStoredCustomerProfile(
  profile: StoredCustomerProfile,
): string {
  return JSON.stringify({
    customerName: profile.customerName.trim().slice(0, 80),
    customerPhone: profile.customerPhone.trim().slice(0, 24),
    fulfillmentType: profile.fulfillmentType,
    deliveryAddress: profile.deliveryAddress.trim().slice(0, 200),
    deliveryReference: profile.deliveryReference.trim().slice(0, 140),
    paymentMethod: profile.paymentMethod,
  });
}

export interface MenuCategoryCounts {
  all: number;
  combos: number;
  Lanche: number;
  Bebida: number;
  Adicional: number;
  Outro: number;
}

export function computeMenuCategoryCounts(
  products: Array<{ category: string }>,
  combosCount: number,
): MenuCategoryCounts {
  const counts: MenuCategoryCounts = {
    all: products.length + combosCount,
    combos: combosCount,
    Lanche: 0,
    Bebida: 0,
    Adicional: 0,
    Outro: 0,
  };

  for (const product of products) {
    if (product.category === 'Lanche') counts.Lanche += 1;
    else if (product.category === 'Bebida') counts.Bebida += 1;
    else if (product.category === 'Adicional') counts.Adicional += 1;
    else counts.Outro += 1;
  }

  return counts;
}

export function computeCashChangeAmount(
  changeFor: number | null,
  totalAmount: number,
): number | null {
  if (changeFor === null || !Number.isFinite(changeFor) || changeFor <= totalAmount) {
    return null;
  }
  return Math.round((changeFor - totalAmount) * 100) / 100;
}

export function isBeverageCategory(category: string): boolean {
  const normalized = category
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    normalized === 'bebida' ||
    normalized === 'bebidas' ||
    normalized.includes('bebida') ||
    normalized.includes('refrigerante') ||
    normalized.includes('suco')
  );
}

export function groupProductsByCategory<T extends { category: string }>(
  products: T[],
): Array<{ category: string; isBeverage: boolean; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const product of products) {
    const key = (product.category || '').trim() || 'Outro';
    const existing = map.get(key);
    if (existing) {
      existing.push(product);
    } else {
      map.set(key, [product]);
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => {
      const aBev = isBeverageCategory(a);
      const bBev = isBeverageCategory(b);
      if (aBev !== bBev) return aBev ? -1 : 1;
      return a.localeCompare(b, 'pt-BR');
    })
    .map(([category, items]) => ({
      category,
      isBeverage: isBeverageCategory(category),
      items,
    }));
}

export interface ComboTitleHighlightParts {
  prefix: string;
  highlightNumber: string | null;
  suffix: string;
}

export function splitComboTitleHighlight(title: string): ComboTitleHighlightParts {
  const clean = title.trim();
  const match = clean.match(/^(.*?\b)(\d{1,2})(?![0-9a-zA-ZÀ-ÿ])(.*)$/);
  if (!match || !match[1].trim()) {
    return { prefix: clean, highlightNumber: null, suffix: '' };
  }
  return {
    prefix: match[1],
    highlightNumber: match[2],
    suffix: match[3] || '',
  };
}

export type ComboPromoBadgeKind = 'most_ordered' | 'best_value' | 'shareable';

export interface ComboPromoBadge {
  kind: ComboPromoBadgeKind;
  line1: string;
  line2: string;
}

export interface ComboPromoCandidate {
  id: string;
  name: string;
  description: string;
  salePrice: number;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    countsAsXSalada: boolean;
  }>;
  orderCount?: number;
  salesCount?: number;
  isMostOrdered?: boolean;
  promoTag?: string;
}

export interface ProductPriceLookupItem {
  id: string;
  unitPrice: number;
}

export function resolveComboPromoBadges(
  combos: ComboPromoCandidate[],
  products: ProductPriceLookupItem[],
): Record<string, ComboPromoBadge> {
  const result: Record<string, ComboPromoBadge> = {};
  if (combos.length === 0) return result;

  const productPriceById = new Map<string, number>();
  for (const p of products) {
    if (p.id && Number.isFinite(p.unitPrice) && p.unitPrice > 0) {
      productPriceById.set(p.id, p.unitPrice);
    }
  }

  // 1) MAIS PEDIDO — strictly from explicit admin config or positive real sales/order count
  let topOrderComboId: string | null = null;
  let topOrderCount = 0;
  for (const combo of combos) {
    if (combo.promoTag === 'MAIS PEDIDO' || combo.isMostOrdered) {
      result[combo.id] = { kind: 'most_ordered', line1: 'MAIS', line2: 'PEDIDO' };
    }
    const count = Math.max(
      0,
      Number(combo.orderCount ?? combo.salesCount ?? 0) || 0,
    );
    if (count > topOrderCount) {
      topOrderCount = count;
      topOrderComboId = combo.id;
    }
  }
  if (topOrderComboId && !Object.values(result).some((b) => b.kind === 'most_ordered')) {
    result[topOrderComboId] = { kind: 'most_ordered', line1: 'MAIS', line2: 'PEDIDO' };
  }

  // 2) MELHOR CUSTO-BENEFÍCIO — strictly computed from real standalone product prices vs combo salePrice
  let bestValueComboId: string | null = null;
  let bestSavingsPct = 0;
  let bestAbsoluteSavings = 0;

  for (const combo of combos) {
    if (result[combo.id]) continue;
    if (combo.promoTag === 'MELHOR CUSTO-BENEFÍCIO') {
      result[combo.id] = {
        kind: 'best_value',
        line1: 'MELHOR',
        line2: 'CUSTO-BENEFÍCIO',
      };
      continue;
    }
    if (combo.items.length === 0 || combo.salePrice <= 0) continue;

    let allResolved = true;
    let standaloneTotal = 0;
    for (const item of combo.items) {
      const unitPrice = productPriceById.get(item.productId);
      if (unitPrice === undefined || item.quantity <= 0) {
        allResolved = false;
        break;
      }
      standaloneTotal += unitPrice * item.quantity;
    }

    if (!allResolved || standaloneTotal <= combo.salePrice) continue;
    const absoluteSavings = standaloneTotal - combo.salePrice;
    const savingsPct = absoluteSavings / standaloneTotal;
    if (savingsPct < 0.05) continue;

    if (
      savingsPct > bestSavingsPct + 0.0001 ||
      (Math.abs(savingsPct - bestSavingsPct) <= 0.0001 &&
        absoluteSavings > bestAbsoluteSavings)
    ) {
      bestValueComboId = combo.id;
      bestSavingsPct = savingsPct;
      bestAbsoluteSavings = absoluteSavings;
    }
  }

  if (bestValueComboId) {
    result[bestValueComboId] = {
      kind: 'best_value',
      line1: 'MELHOR',
      line2: 'CUSTO-BENEFÍCIO',
    };
  }

  // 3) IDEAL PARA COMPARTILHAR — strictly grounded in >= 3 main snack units or explicit sharing text
  for (const combo of combos) {
    if (result[combo.id]) continue;
    const totalMainUnits = combo.items.reduce(
      (sum, item) => sum + (item.countsAsXSalada ? Math.max(0, item.quantity) : 0),
      0,
    );
    const mentionsSharing = /\b(compartilhar|fam[ií]lia|galera|amigos)\b/i.test(
      `${combo.name} ${combo.description}`,
    );

    if (
      combo.promoTag === 'IDEAL PARA COMPARTILHAR' ||
      totalMainUnits >= 3 ||
      mentionsSharing
    ) {
      result[combo.id] = {
        kind: 'shareable',
        line1: 'IDEAL',
        line2: 'PARA COMPARTILHAR',
      };
    }
  }

  return result;
}

export function formatCategorySectionTitle(category: string): string {
  const clean = category.trim();
  if (!clean) return 'Outros';
  const normalized = clean
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (normalized === 'bebida' || normalized === 'bebidas') {
    return 'Bebidas Geladas';
  }
  if (normalized === 'lanche') {
    return 'Lanches';
  }
  return clean;
}

export function formatCategoryTabLabel(category: string): string {
  const clean = category.trim();
  if (!clean) return 'Outros';
  const normalized = clean
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (normalized === 'bebida') return 'Bebidas';
  if (normalized === 'lanche') return 'Lanches';
  return clean;
}

