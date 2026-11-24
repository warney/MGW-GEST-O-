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
