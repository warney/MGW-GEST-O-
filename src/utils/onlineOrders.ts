import type {
  CreatePublicOrderPayload,
  DigitalMenuSettingsInput,
  OnlineOrderCartItem,
  OnlineOrderFulfillment,
  OnlineOrderPaymentMethod,
  OnlineOrderRecord,
  OnlineOrderStatus,
  PublicCatalogCombo,
  PublicCatalogProduct,
  PublicOrderTrackingRecord,
  SaleInput,
  SaleLineItemSnapshot,
  SaleMode,
  SaleRecord,
} from '../types/finance';
import {
  DEFAULT_SHOP_TIMEZONE,
  formatDateInTimezone,
  getLocalTodayDate,
  getMonthBounds,
  roundCurrency,
} from './finance';

export const ORDER_STATUS_LABELS: Record<OnlineOrderStatus, string> = {
  received: 'Pedido recebido',
  accepted: 'Aceito',
  preparing: 'Em preparação',
  ready: 'Pedido pronto',
  out_for_delivery: 'Saiu para entrega',
  ready_for_pickup: 'Disponível para retirada',
  completed: 'Concluído',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
};

export const ORDER_TERMINAL_STATUSES: ReadonlySet<OnlineOrderStatus> = new Set([
  'completed',
  'rejected',
  'cancelled',
]);

export const ORDER_ACTIVE_STATUSES: ReadonlySet<OnlineOrderStatus> = new Set([
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'ready_for_pickup',
]);

export const DEFAULT_DIGITAL_MENU_SETTINGS: DigitalMenuSettingsInput = {
  slug: 'mgw_lanches',
  isActive: false,
  isOpen: true,
  storeName: 'MGW Lanches',
  description: 'X-Salada artesanal e combos feitos na hora.',
  phoneWhatsapp: '',
  address: '',
  openingHours: 'Todos os dias · 18h às 23h30',
  pixKey: '',
  deliveryFee: 5,
  minimumOrderAmount: 15,
  acceptsDelivery: true,
  acceptsPickup: true,
  logoUrl: '',
  logoPath: '',
  bannerUrl: '',
  bannerPath: '',
};

export function normalizePixKeyInput(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 140);
}

export function shouldShowOrderPixPaymentBox(
  order: Pick<PublicOrderTrackingRecord, 'paymentMethod' | 'storePixKey' | 'status'>,
): boolean {
  if (order.paymentMethod !== 'Pix') return false;
  if (order.status === 'rejected' || order.status === 'cancelled') return false;
  return normalizePixKeyInput(order.storePixKey).length > 0;
}

export function formatDigitalMenuSaveErrorMessage(err: unknown): string {
  const fallback = 'Erro ao salvar configurações do cardápio digital.';
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown };
      const inner = typeof parsed.error === 'string' ? parsed.error : '';
      if (inner.toLowerCase().includes('permission') || inner.toLowerCase().includes('insufficient')) {
        return 'Permissão negada ao gravar no banco de dados. Verifique sua sessão ou tente novamente.';
      }
      if (inner.trim()) return inner.trim();
    } catch {
      // Fallback to raw error text if JSON parsing fails
    }
  }

  return trimmed;
}

export function sanitizeMenuSlug(raw: string, fallback = 'mgw_lanches'): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 60);
  if (cleaned.length < 2) return fallback;
  return cleaned;
}

export function formatOrderNumber(orderNumber: number): string {
  const n = Math.max(1, Math.trunc(orderNumber || 1));
  return `#${String(n).padStart(4, '0')}`;
}

export function formatDateTimeBR(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const d = new Date(ms);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatTimeBR(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const d = new Date(ms);
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function sanitizeWhatsappDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }
  return digits;
}

export function buildWhatsappUrl(phone: string, message?: string): string | null {
  const clean = sanitizeWhatsappDigits(phone);
  if (clean.length < 10) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${clean}${query}`;
}

export function isTerminalOrderStatus(status: OnlineOrderStatus): boolean {
  return ORDER_TERMINAL_STATUSES.has(status);
}

export function isActiveOrderStatus(status: OnlineOrderStatus): boolean {
  return ORDER_ACTIVE_STATUSES.has(status);
}

export function isUnreadNewOrder(order: Pick<OnlineOrderRecord, 'status' | 'viewedAtMs'>): boolean {
  return order.status === 'received' && !order.viewedAtMs;
}

export interface OrderProgressionAction {
  nextStatus: OnlineOrderStatus;
  label: string;
  tone: 'primary' | 'success' | 'danger';
  requiresReason: boolean;
}

export function getNextStatusActions(
  status: OnlineOrderStatus,
  fulfillmentType: OnlineOrderFulfillment,
): OrderProgressionAction[] {
  if (isTerminalOrderStatus(status)) {
    return [];
  }

  switch (status) {
    case 'received':
      return [
        { nextStatus: 'accepted', label: 'ACEITAR PEDIDO', tone: 'success', requiresReason: false },
        { nextStatus: 'rejected', label: 'RECUSAR PEDIDO', tone: 'danger', requiresReason: true },
      ];
    case 'accepted':
      return [
        { nextStatus: 'preparing', label: 'Iniciar preparo', tone: 'primary', requiresReason: false },
        { nextStatus: 'cancelled', label: 'Cancelar pedido', tone: 'danger', requiresReason: true },
      ];
    case 'preparing':
      return [
        { nextStatus: 'ready', label: 'Marcar como pronto', tone: 'primary', requiresReason: false },
        { nextStatus: 'cancelled', label: 'Cancelar pedido', tone: 'danger', requiresReason: true },
      ];
    case 'ready':
      return [
        fulfillmentType === 'delivery'
          ? { nextStatus: 'out_for_delivery', label: 'Saiu para entrega', tone: 'primary', requiresReason: false }
          : { nextStatus: 'ready_for_pickup', label: 'Disponível para retirada', tone: 'primary', requiresReason: false },
        { nextStatus: 'cancelled', label: 'Cancelar pedido', tone: 'danger', requiresReason: true },
      ];
    case 'out_for_delivery':
    case 'ready_for_pickup':
      return [
        { nextStatus: 'completed', label: 'Concluir pedido', tone: 'success', requiresReason: false },
        { nextStatus: 'cancelled', label: 'Cancelar pedido', tone: 'danger', requiresReason: true },
      ];
    default:
      return [];
  }
}

export function validateOrderStatusTransition(
  currentStatus: OnlineOrderStatus,
  nextStatus: OnlineOrderStatus,
  fulfillmentType: OnlineOrderFulfillment,
  reason: string,
): { valid: boolean; error?: string } {
  if (isTerminalOrderStatus(currentStatus)) {
    return { valid: false, error: 'Pedido já finalizado não permite alteração de status.' };
  }

  const trimmedReason = reason.trim();
  if ((nextStatus === 'rejected' || nextStatus === 'cancelled') && trimmedReason.length < 3) {
    return { valid: false, error: 'Informe o motivo para recusar ou cancelar o pedido (mínimo 3 caracteres).' };
  }

  const allowedMap: Record<OnlineOrderStatus, OnlineOrderStatus[]> = {
    received: ['accepted', 'rejected', 'cancelled'],
    accepted: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: [fulfillmentType === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup', 'cancelled'],
    out_for_delivery: ['completed', 'cancelled'],
    ready_for_pickup: ['completed', 'cancelled'],
    completed: [],
    rejected: [],
    cancelled: [],
  };

  if (!allowedMap[currentStatus].includes(nextStatus)) {
    return {
      valid: false,
      error: `Transição inválida de "${ORDER_STATUS_LABELS[currentStatus]}" para "${ORDER_STATUS_LABELS[nextStatus]}".`,
    };
  }

  return { valid: true };
}

export function getTrackingFlowSteps(
  fulfillmentType: OnlineOrderFulfillment,
): OnlineOrderStatus[] {
  return fulfillmentType === 'delivery'
    ? ['received', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed']
    : ['received', 'accepted', 'preparing', 'ready', 'ready_for_pickup', 'completed'];
}

export interface ComputedCartLine {
  kind: 'product' | 'combo';
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note: string;
  selectedAddons: Array<{ groupId: string; groupName: string; options: Array<{ id: string; name: string; price: number }> }>;
  xSaladasPerUnit: number;
}

export interface ComputedCartSummary {
  lines: ComputedCartLine[];
  missingItems: OnlineOrderCartItem[];
  totalItemsCount: number;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  minimumOrderAmount: number;
  belowMinimum: boolean;
  missingForMinimum: number;
}

export function computeCartSummary(
  cartItems: OnlineOrderCartItem[],
  products: PublicCatalogProduct[],
  combos: PublicCatalogCombo[],
  menuSettings: Pick<DigitalMenuSettingsInput, 'deliveryFee' | 'minimumOrderAmount'>,
  fulfillmentType: OnlineOrderFulfillment,
): ComputedCartSummary {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const comboMap = new Map(combos.map((c) => [c.id, c]));

  const lines: ComputedCartLine[] = [];
  const missingItems: OnlineOrderCartItem[] = [];
  let subtotal = 0;
  let totalItemsCount = 0;

  for (const raw of cartItems) {
    const qty = Math.trunc(Number(raw.quantity) || 0);
    if (qty <= 0) continue;

    if (raw.kind === 'product') {
      const prod = productMap.get(raw.id);
      if (!prod) {
        missingItems.push(raw);
        continue;
      }
      const selected = raw.selectedAddons || [];
      const addonGroups = prod.addonGroups || [];
      let addonUnitTotal = 0;
      const addonSnapshots = selected.flatMap((selection) => {
        const group = addonGroups.find((g) => g.id === selection.groupId);
        if (!group) return [];
        const options = (selection.optionIds || []).map((id) => group.options.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => Boolean(o && o.active));
        addonUnitTotal += options.reduce((sum, option) => sum + option.price, 0);
        return options.length ? [{ groupId: group.id, groupName: group.name, options: options.map((o) => ({ id: o.id, name: o.name, price: o.price })) }] : [];
      });
      const unitPrice = roundCurrency(prod.unitPrice + addonUnitTotal);
      const lineTotal = roundCurrency(unitPrice * qty);
      subtotal = roundCurrency(subtotal + lineTotal);
      totalItemsCount += qty;
      lines.push({
        kind: 'product',
        id: prod.id,
        name: prod.name,
        description: prod.category,
        quantity: qty,
        unitPrice,
        lineTotal,
        selectedAddons: addonSnapshots,
        note: (raw.note || '').trim().slice(0, 200),
        xSaladasPerUnit: prod.countsAsXSalada ? 1 : 0,
      });
    } else {
      const combo = comboMap.get(raw.id);
      if (!combo) {
        missingItems.push(raw);
        continue;
      }
      const lineTotal = roundCurrency(combo.salePrice * qty);
      subtotal = roundCurrency(subtotal + lineTotal);
      totalItemsCount += qty;
      const xPerUnit = combo.items.reduce(
        (acc, comp) => (comp.countsAsXSalada ? acc + Math.max(1, comp.quantity) : acc),
        0,
      );
      lines.push({
        kind: 'combo',
        id: combo.id,
        name: combo.name,
        description:
          combo.description ||
          combo.items.map((i) => `${i.quantity}x ${i.productName}`).join(' + '),
        quantity: qty,
        unitPrice: roundCurrency(combo.salePrice),
        lineTotal,
        selectedAddons: [],
        note: (raw.note || '').trim().slice(0, 200),
        xSaladasPerUnit: xPerUnit,
      });
    }
  }

  const deliveryFee =
    fulfillmentType === 'delivery' && lines.length > 0
      ? roundCurrency(Math.max(0, menuSettings.deliveryFee))
      : 0;
  const totalAmount = roundCurrency(subtotal + deliveryFee);
  const minimumOrderAmount = roundCurrency(Math.max(0, menuSettings.minimumOrderAmount));
  const belowMinimum = minimumOrderAmount > 0 && subtotal < minimumOrderAmount;
  const missingForMinimum = belowMinimum
    ? roundCurrency(minimumOrderAmount - subtotal)
    : 0;

  return {
    lines,
    missingItems,
    totalItemsCount,
    subtotal,
    deliveryFee,
    totalAmount,
    minimumOrderAmount,
    belowMinimum,
    missingForMinimum,
  };
}

export function validateCheckoutPayload(
  payload: Omit<CreatePublicOrderPayload, 'items'>,
  cartSummary: ComputedCartSummary,
  menuSettings: DigitalMenuSettingsInput,
): { valid: boolean; error?: string } {
  if (!menuSettings.isActive) {
    return { valid: false, error: 'O cardápio digital está desativado no momento.' };
  }
  if (!menuSettings.isOpen) {
    return { valid: false, error: 'A lanchonete está fechada no momento para novos pedidos.' };
  }
  if (cartSummary.missingItems.length > 0) {
    return {
      valid: false,
      error: 'Um ou mais itens do seu carrinho ficaram indisponíveis. Revise seu pedido.',
    };
  }
  if (cartSummary.lines.length === 0 || cartSummary.subtotal <= 0) {
    return { valid: false, error: 'Seu carrinho está vazio. Adicione pelo menos um item.' };
  }
  if (cartSummary.belowMinimum) {
    return {
      valid: false,
      error: `O pedido mínimo é R$ ${cartSummary.minimumOrderAmount.toFixed(2).replace('.', ',')}.`,
    };
  }

  if (payload.fulfillmentType === 'delivery' && !menuSettings.acceptsDelivery) {
    return { valid: false, error: 'Este estabelecimento não aceita entrega no momento.' };
  }
  if (payload.fulfillmentType === 'pickup' && !menuSettings.acceptsPickup) {
    return { valid: false, error: 'Este estabelecimento não aceita retirada no local no momento.' };
  }

  if (payload.customerName.trim().length < 2) {
    return { valid: false, error: 'Informe seu nome completo.' };
  }
  const phoneDigits = payload.customerPhone.replace(/\D/g, '');
  if (phoneDigits.length < 8) {
    return { valid: false, error: 'Informe um WhatsApp ou telefone válido com DDD.' };
  }
  if (payload.fulfillmentType === 'delivery' && payload.deliveryAddress.trim().length < 5) {
    return { valid: false, error: 'Informe o endereço completo para entrega.' };
  }

  if (!(['Pix', 'Dinheiro', 'Cartão'] as const).includes(payload.paymentMethod)) {
    return { valid: false, error: 'Selecione uma forma de pagamento válida.' };
  }

  if (
    payload.paymentMethod === 'Dinheiro' &&
    payload.changeFor !== null &&
    payload.changeFor > 0 &&
    payload.changeFor < cartSummary.totalAmount
  ) {
    return {
      valid: false,
      error: 'O valor informado para troco não pode ser menor que o total do pedido.',
    };
  }

  return { valid: true };
}

export function normalizeOrderPaymentToSaleMethod(
  method: OnlineOrderPaymentMethod,
): 'Pix' | 'Dinheiro' | 'Cartão de crédito' {
  if (method === 'Pix') return 'Pix';
  if (method === 'Dinheiro') return 'Dinheiro';
  return 'Cartão de crédito';
}

/**
 * Converte exatamente UM pedido online concluido em um SaleInput idempotente.
 * Nunca cria venda para pedidos pendentes, em andamento, recusados ou cancelados.
 */
export function buildSaleInputFromCompletedOrder(
  order: OnlineOrderRecord,
  dateOverride?: string,
  timezone: string = DEFAULT_SHOP_TIMEZONE,
): SaleInput {
  if (order.status !== 'completed') {
    throw new Error('Somente pedidos concluídos podem gerar lançamento financeiro de venda.');
  }

  let xSaladaCount = 0;
  let combosCount = 0;
  let totalItemUnits = 0;
  let hasCombo = false;
  let hasProduct = false;

  const saleItems: SaleLineItemSnapshot[] = order.items.map((item) => {
    const qty = Math.max(1, Math.trunc(item.quantity));
    xSaladaCount += item.xSaladasPerUnit * qty;
    totalItemUnits += qty;
    if (item.itemKind === 'combo') {
      hasCombo = true;
      combosCount += qty;
    } else {
      hasProduct = true;
    }

    return {
      kind: item.itemKind,
      refId: item.refId,
      name: item.itemName,
      quantity: qty,
      unitPrice: roundCurrency(item.unitPrice),
      lineTotal: roundCurrency(item.lineTotal),
      estimatedUnitCost: roundCurrency(Math.max(0, item.estimatedUnitCost || 0)),
      xSaladasPerUnit: Math.max(0, item.xSaladasPerUnit),
      components: item.components,
    };
  });

  const saleMode: SaleMode =
    hasCombo && hasProduct ? 'mixed' : hasCombo ? 'combo' : 'individual';
  const quantity = Math.max(1, xSaladaCount > 0 ? xSaladaCount : totalItemUnits);
  const deliveryFee = roundCurrency(Math.max(0, order.deliveryFee));
  const totalAmount = roundCurrency(
    Math.max(order.totalAmount, order.subtotalAmount + deliveryFee),
  );
  const unitPrice = roundCurrency(totalAmount / quantity);
  const saleDate =
    dateOverride ||
    formatDateInTimezone(
      order.completedAtMs ? new Date(order.completedAtMs) : new Date(),
      timezone,
    );
  const baseNote = `${formatOrderNumber(order.orderNumber)} · ${order.customerName.trim()}`;
  const fullNote = order.customerNote.trim()
    ? `${baseNote} · ${order.customerNote.trim()}`
    : baseNote;

  return {
    date: saleDate,
    quantity,
    unitPrice,
    totalAmount,
    paymentMethod: normalizeOrderPaymentToSaleMethod(order.paymentMethod),
    note: fullNote.slice(0, 240),
    saleMode,
    xSaladaCount,
    combosCount,
    items: saleItems,
    saleOrigin: 'online',
    onlineOrderId: order.id,
    onlineOrderNumber: order.orderNumber,
    deliveryFee,
  };
}

export interface OnlineOrdersDashboardStats {
  receivedTodayCount: number;
  pendingApprovalCount: number;
  unviewedNewCount: number;
  inProgressCount: number;
  completedTodayCount: number;
  rejectedOrCancelledTodayCount: number;
  onlineRevenueToday: number;
  onlineRevenueMonth: number;
  onlineUnitsSoldToday: number;
  onlineUnitsSoldMonth: number;
}

export function getSaleTotalProductUnits(sale: SaleRecord): number {
  if (sale.items && sale.items.length > 0) {
    return sale.items.reduce((acc, item) => {
      if (item.components && item.components.length > 0) {
        return (
          acc +
          item.components.reduce((cAcc, c) => cAcc + Math.max(1, c.totalQuantity), 0)
        );
      }
      return acc + Math.max(1, item.quantity);
    }, 0);
  }
  return Math.max(0, sale.quantity);
}

export function computeOnlineOrdersDashboardStats(
  orders: OnlineOrderRecord[],
  sales: SaleRecord[],
  referenceDate: string,
): OnlineOrdersDashboardStats {
  const monthBounds = getMonthBounds(referenceDate);

  let receivedTodayCount = 0;
  let pendingApprovalCount = 0;
  let unviewedNewCount = 0;
  let inProgressCount = 0;
  let completedTodayCount = 0;
  let rejectedOrCancelledTodayCount = 0;

  for (const order of orders) {
    const orderDay = getLocalTodayDate(new Date(order.createdAtMs));
    if (orderDay === referenceDate) {
      receivedTodayCount += 1;
    }

    if (order.status === 'received') {
      pendingApprovalCount += 1;
      if (!order.viewedAtMs) {
        unviewedNewCount += 1;
      }
    } else if (isActiveOrderStatus(order.status)) {
      inProgressCount += 1;
    } else if (order.status === 'completed') {
      const doneDay = getLocalTodayDate(
        new Date(order.completedAtMs || order.updatedAtMs || order.createdAtMs),
      );
      if (doneDay === referenceDate) {
        completedTodayCount += 1;
      }
    } else if (order.status === 'rejected' || order.status === 'cancelled') {
      const endDay = getLocalTodayDate(
        new Date(order.cancelledAtMs || order.updatedAtMs || order.createdAtMs),
      );
      if (endDay === referenceDate) {
        rejectedOrCancelledTodayCount += 1;
      }
    }
  }

  let onlineRevenueToday = 0;
  let onlineRevenueMonth = 0;
  let onlineUnitsSoldToday = 0;
  let onlineUnitsSoldMonth = 0;

  for (const sale of sales) {
    if (sale.saleOrigin !== 'online') continue;
    const units = getSaleTotalProductUnits(sale);
    if (sale.date === referenceDate) {
      onlineRevenueToday = roundCurrency(onlineRevenueToday + sale.totalAmount);
      onlineUnitsSoldToday += units;
    }
    if (sale.date >= monthBounds.start && sale.date <= monthBounds.end) {
      onlineRevenueMonth = roundCurrency(onlineRevenueMonth + sale.totalAmount);
      onlineUnitsSoldMonth += units;
    }
  }

  return {
    receivedTodayCount,
    pendingApprovalCount,
    unviewedNewCount,
    inProgressCount,
    completedTodayCount,
    rejectedOrCancelledTodayCount,
    onlineRevenueToday,
    onlineRevenueMonth,
    onlineUnitsSoldToday,
    onlineUnitsSoldMonth,
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateTrackingSecretToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
