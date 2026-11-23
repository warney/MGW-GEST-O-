import type {
  OnlineOrderFulfillment,
  OnlineOrderPaymentMethod,
  OnlineOrderRecord,
  OnlineOrderStatus,
  PublicOrderTrackingRecord,
} from '../types/finance';
import { formatCurrencyBRL, roundCurrency } from './finance';
import {
  formatDateTimeBR,
  formatOrderNumber,
  ORDER_STATUS_LABELS,
} from './onlineOrders';

export type PrintPaperFormat = '80mm' | '58mm' | 'a4';
export type PrintCopyMode = 'complete' | 'kitchen';

export interface PrintableOrderAddonGroup {
  groupId: string;
  groupName: string;
  options: Array<{ id: string; name: string; price: number }>;
}

export interface PrintableOrderItem {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  itemNote: string;
  selectedAddons?: PrintableOrderAddonGroup[];
}

export interface PrintableOrderSource {
  id: string;
  orderNumber: number;
  status: OnlineOrderStatus;
  fulfillmentType: OnlineOrderFulfillment;
  paymentMethod: OnlineOrderPaymentMethod;
  changeFor: number | null;
  subtotalAmount: number;
  deliveryFee: number;
  discountAmount?: number;
  totalAmount: number;
  customerNote: string;
  createdAtMs: number;
  items: PrintableOrderItem[];
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryReference?: string;
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
}

export interface PrintableOrderLineAddon {
  groupName: string;
  optionsSummary: string;
}

export interface PrintableOrderLine {
  id: string;
  quantity: number;
  name: string;
  unitPriceFormatted: string;
  lineTotalFormatted: string;
  addons: PrintableOrderLineAddon[];
  note: string;
}

export interface PrintableOrderDocument {
  orderNumberFormatted: string;
  statusLabel: string;
  createdAtFormatted: string;
  storeName: string;
  storePhone: string;
  storeAddress: string;
  mode: PrintCopyMode;
  modeLabel: string;
  showPrices: boolean;
  fulfillmentLabel: string;
  isDelivery: boolean;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryReference: string;
  paymentMethod: OnlineOrderPaymentMethod;
  changeForFormatted: string | null;
  changeReturnFormatted: string | null;
  subtotalFormatted: string;
  discountFormatted: string | null;
  deliveryFeeFormatted: string;
  totalFormatted: string;
  customerNote: string;
  lines: PrintableOrderLine[];
}

export function fromOnlineOrderRecord(
  order: OnlineOrderRecord,
  storeMeta: { storeName: string; storePhone?: string; storeAddress?: string },
): PrintableOrderSource {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    paymentMethod: order.paymentMethod,
    changeFor: order.changeFor,
    subtotalAmount: order.subtotalAmount,
    deliveryFee: order.deliveryFee,
    totalAmount: order.totalAmount,
    customerNote: order.customerNote,
    createdAtMs: order.createdAtMs,
    items: order.items,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    deliveryReference: order.deliveryReference,
    storeName: storeMeta.storeName || 'MGW GESTÃO',
    storePhone: storeMeta.storePhone,
    storeAddress: storeMeta.storeAddress,
  };
}

export function fromPublicTrackingRecord(
  order: PublicOrderTrackingRecord,
): PrintableOrderSource {
  return {
    id: order.orderId,
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    paymentMethod: order.paymentMethod,
    changeFor: order.changeFor,
    subtotalAmount: order.subtotalAmount,
    deliveryFee: order.deliveryFee,
    totalAmount: order.totalAmount,
    customerNote: order.customerNote,
    createdAtMs: order.createdAtMs,
    items: order.items,
    customerName: order.customerName,
    deliveryAddress: order.deliveryAddress,
    deliveryReference: order.deliveryReference,
    storeName: storeNameFallback(order.storeName),
    storePhone: order.storeWhatsapp,
    storeAddress: order.storeAddress,
  };
}

function storeNameFallback(name: string): string {
  return (name || '').trim() || 'MGW GESTÃO';
}

function formatLineAddons(
  selectedAddons: PrintableOrderAddonGroup[] | undefined,
  showPrices: boolean,
): PrintableOrderLineAddon[] {
  if (!selectedAddons || selectedAddons.length === 0) return [];
  const result: PrintableOrderLineAddon[] = [];

  for (const group of selectedAddons) {
    if (!group.options || group.options.length === 0) continue;
    const summary = group.options
      .map((opt) =>
        showPrices && opt.price > 0
          ? `${opt.name} (+${formatCurrencyBRL(opt.price)})`
          : opt.name,
      )
      .join(', ');
    if (summary) {
      result.push({
        groupName: group.groupName,
        optionsSummary: summary,
      });
    }
  }

  return result;
}

export function buildPrintableOrderDocument(
  source: PrintableOrderSource,
  mode: PrintCopyMode = 'complete',
): PrintableOrderDocument {
  const showPrices = mode === 'complete';
  const isDelivery = source.fulfillmentType === 'delivery';

  const changeForNumber =
    source.paymentMethod === 'Dinheiro' &&
    typeof source.changeFor === 'number' &&
    Number.isFinite(source.changeFor) &&
    source.changeFor > 0
      ? roundCurrency(source.changeFor)
      : null;

  const changeReturnNumber =
    changeForNumber !== null
      ? roundCurrency(Math.max(0, changeForNumber - source.totalAmount))
      : null;

  const discountNumber =
    typeof source.discountAmount === 'number' &&
    Number.isFinite(source.discountAmount) &&
    source.discountAmount > 0
      ? roundCurrency(source.discountAmount)
      : null;

  return {
    orderNumberFormatted: formatOrderNumber(source.orderNumber),
    statusLabel: ORDER_STATUS_LABELS[source.status] ?? source.status,
    createdAtFormatted: formatDateTimeBR(source.createdAtMs),
    storeName: source.storeName.trim() || 'MGW GESTÃO',
    storePhone: (source.storePhone || '').trim(),
    storeAddress: (source.storeAddress || '').trim(),
    mode,
    modeLabel: mode === 'kitchen' ? 'VIA COZINHA' : 'COMANDA DO PEDIDO',
    showPrices,
    fulfillmentLabel: isDelivery ? 'ENTREGA' : 'RETIRADA NO BALCÃO',
    isDelivery,
    customerName: (source.customerName || '').trim(),
    customerPhone: (source.customerPhone || '').trim(),
    deliveryAddress: isDelivery ? (source.deliveryAddress || '').trim() : '',
    deliveryReference: isDelivery ? (source.deliveryReference || '').trim() : '',
    paymentMethod: source.paymentMethod,
    changeForFormatted:
      changeForNumber !== null ? formatCurrencyBRL(changeForNumber) : null,
    changeReturnFormatted:
      changeReturnNumber !== null ? formatCurrencyBRL(changeReturnNumber) : null,
    subtotalFormatted: formatCurrencyBRL(source.subtotalAmount),
    discountFormatted:
      discountNumber !== null ? formatCurrencyBRL(discountNumber) : null,
    deliveryFeeFormatted:
      !isDelivery || source.deliveryFee <= 0
        ? 'Grátis'
        : formatCurrencyBRL(source.deliveryFee),
    totalFormatted: formatCurrencyBRL(source.totalAmount),
    customerNote: (source.customerNote || '').trim(),
    lines: source.items.map((item) => ({
      id: item.id,
      quantity: Math.max(1, Math.trunc(item.quantity || 1)),
      name: item.itemName,
      unitPriceFormatted: formatCurrencyBRL(item.unitPrice),
      lineTotalFormatted: formatCurrencyBRL(item.lineTotal),
      addons: formatLineAddons(item.selectedAddons, showPrices),
      note: (item.itemNote || '').trim(),
    })),
  };
}

export function getPrintPageCss(format: PrintPaperFormat): string {
  if (format === '58mm') {
    return [
      '@page { size: 58mm auto; margin: 2mm; }',
      '@media print { #mgw-printable-receipt { width: 54mm !important; max-width: 54mm !important; font-size: 10px !important; line-height: 1.3 !important; } }',
    ].join('\n');
  }
  if (format === 'a4') {
    return [
      '@page { size: A4 portrait; margin: 14mm; }',
      '@media print { #mgw-printable-receipt { max-width: 180mm !important; width: 100% !important; font-size: 12px !important; line-height: 1.45 !important; } }',
    ].join('\n');
  }
  return [
    '@page { size: 80mm auto; margin: 3mm; }',
    '@media print { #mgw-printable-receipt { width: 74mm !important; max-width: 74mm !important; font-size: 11px !important; line-height: 1.35 !important; } }',
  ].join('\n');
}
