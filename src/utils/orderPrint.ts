import type {
  OnlineOrderFulfillment,
  OnlineOrderPaymentMethod,
  OnlineOrderRecord,
  OnlineOrderStatus,
  PublicOrderTrackingRecord,
  SaleRecord,
} from '../types/finance';
import { normalizePaymentMethod } from '../types/finance';
import {
  formatCurrencyBRL,
  formatDateBR,
  formatSaleCustomerAddressLine,
  formatSaleItemsSummary,
  roundCurrency,
} from './finance';
import {
  formatDateTimeBR,
  formatOrderNumber,
  ORDER_STATUS_LABELS,
} from './onlineOrders';

export type PrintPaperFormat = '80mm' | '58mm' | 'a4';
export type PrintCopyMode = 'complete' | 'kitchen';
export type PrintableDocumentKind = 'online_order' | 'quick_sale';

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
  documentKind?: PrintableDocumentKind;
  orderNumber: number;
  status: OnlineOrderStatus;
  fulfillmentType: OnlineOrderFulfillment;
  paymentMethod: OnlineOrderPaymentMethod | string;
  changeFor: number | null;
  subtotalAmount: number;
  deliveryFee: number;
  discountAmount?: number;
  totalAmount: number;
  customerNote: string;
  saleDate?: string;
  createdAtMs: number;
  items: PrintableOrderItem[];
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryReference?: string;
  customerAddress?: string;
  customerNumber?: string;
  customerNeighborhood?: string;
  customerComplement?: string;
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
  documentKind: PrintableDocumentKind;
  orderNumberFormatted: string;
  hasOrderNumber: boolean;
  statusLabel: string;
  saleDateFormatted: string;
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
  customerAddress: string;
  customerNumber: string;
  customerNeighborhood: string;
  customerComplement: string;
  customerAddressLine: string;
  paymentMethod: string;
  changeForFormatted: string | null;
  changeReturnFormatted: string | null;
  subtotalFormatted: string;
  discountFormatted: string | null;
  deliveryFeeFormatted: string;
  hasDeliveryFee: boolean;
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

export function fromSaleRecord(
  sale: SaleRecord,
  storeMeta: { storeName: string; storePhone?: string; storeAddress?: string },
): PrintableOrderSource {
  const deliveryFee = roundCurrency(Math.max(0, Number(sale.deliveryFee || 0)));
  const items: PrintableOrderItem[] =
    sale.items && sale.items.length > 0
      ? sale.items.map((item, idx) => ({
          id: `${item.refId || 'item'}-${idx}`,
          itemName: item.name,
          quantity: Math.max(1, Math.trunc(item.quantity || 1)),
          unitPrice: roundCurrency(item.unitPrice),
          lineTotal: roundCurrency(item.lineTotal),
          itemNote: '',
        }))
      : [
          {
            id: `legacy-${sale.id}`,
            itemName: formatSaleItemsSummary(sale),
            quantity: Math.max(1, Math.trunc(sale.quantity || 1)),
            unitPrice: roundCurrency(
              sale.unitPrice > 0
                ? sale.unitPrice
                : sale.totalAmount / Math.max(1, Math.trunc(sale.quantity || 1)),
            ),
            lineTotal: roundCurrency(Math.max(0, sale.totalAmount - deliveryFee)),
            itemNote: '',
          },
        ];

  const itemsSubtotal = roundCurrency(
    items.reduce((acc, item) => acc + item.lineTotal, 0),
  );

  return {
    id: sale.id,
    documentKind: 'quick_sale',
    orderNumber: sale.onlineOrderNumber ?? 0,
    status: 'completed',
    fulfillmentType: 'pickup',
    paymentMethod: normalizePaymentMethod(sale.paymentMethod),
    changeFor: null,
    subtotalAmount: itemsSubtotal > 0 ? itemsSubtotal : roundCurrency(sale.totalAmount),
    deliveryFee,
    totalAmount: roundCurrency(sale.totalAmount),
    customerNote: sale.note || '',
    saleDate: sale.date,
    createdAtMs: sale.createdAtMs,
    items,
    customerName: sale.customerName || '',
    customerAddress: sale.customerAddress || '',
    customerNumber: sale.customerNumber || '',
    customerNeighborhood: sale.customerNeighborhood || '',
    customerComplement: sale.customerComplement || '',
    storeName: storeMeta.storeName || 'MGW GESTÃO',
    storePhone: storeMeta.storePhone,
    storeAddress: storeMeta.storeAddress,
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
  const documentKind: PrintableDocumentKind = source.documentKind ?? 'online_order';
  const isQuickSale = documentKind === 'quick_sale';
  const showPrices = isQuickSale ? true : mode === 'complete';
  const isDelivery = !isQuickSale && source.fulfillmentType === 'delivery';

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

  const customerAddress = (source.customerAddress || '').trim();
  const customerNumber = (source.customerNumber || '').trim();
  const customerNeighborhood = (source.customerNeighborhood || '').trim();
  const customerComplement = (source.customerComplement || '').trim();
  const customerAddressLine = formatSaleCustomerAddressLine({
    customerAddress,
    customerNumber,
    customerNeighborhood,
    customerComplement,
  });

  const hasOrderNumber = Number(source.orderNumber) > 0;
  const saleDateFormatted = source.saleDate ? formatDateBR(source.saleDate) : '';
  const createdAtFormatted = formatDateTimeBR(source.createdAtMs);
  const deliveryFee = roundCurrency(Math.max(0, Number(source.deliveryFee || 0)));

  return {
    documentKind,
    orderNumberFormatted: hasOrderNumber ? formatOrderNumber(source.orderNumber) : '',
    hasOrderNumber,
    statusLabel: isQuickSale ? '' : (ORDER_STATUS_LABELS[source.status] ?? source.status),
    saleDateFormatted,
    createdAtFormatted,
    storeName: source.storeName.trim() || 'MGW GESTÃO',
    storePhone: (source.storePhone || '').trim(),
    storeAddress: (source.storeAddress || '').trim(),
    mode,
    modeLabel: isQuickSale
      ? 'COMPROVANTE DE VENDA'
      : mode === 'kitchen'
        ? 'VIA COZINHA'
        : 'COMANDA DO PEDIDO',
    showPrices,
    fulfillmentLabel: isQuickSale
      ? 'VENDA RÁPIDA'
      : isDelivery
        ? 'ENTREGA'
        : 'RETIRADA NO BALCÃO',
    isDelivery,
    customerName: (source.customerName || '').trim(),
    customerPhone: (source.customerPhone || '').trim(),
    deliveryAddress: isDelivery ? (source.deliveryAddress || '').trim() : '',
    deliveryReference: isDelivery ? (source.deliveryReference || '').trim() : '',
    customerAddress,
    customerNumber,
    customerNeighborhood,
    customerComplement,
    customerAddressLine,
    paymentMethod: source.paymentMethod,
    changeForFormatted:
      changeForNumber !== null ? formatCurrencyBRL(changeForNumber) : null,
    changeReturnFormatted:
      changeReturnNumber !== null ? formatCurrencyBRL(changeReturnNumber) : null,
    subtotalFormatted: formatCurrencyBRL(source.subtotalAmount),
    discountFormatted:
      discountNumber !== null ? formatCurrencyBRL(discountNumber) : null,
    deliveryFeeFormatted:
      deliveryFee <= 0 ? 'Grátis' : formatCurrencyBRL(deliveryFee),
    hasDeliveryFee: deliveryFee > 0,
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
