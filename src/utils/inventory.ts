import type {
  InventoryBalanceRecord,
  InventoryCountItemRecord,
  InventoryCountRecord,
  InventoryDataBundle,
  InventoryMovementDirection,
  InventoryMovementRecord,
  InventoryMovementType,
  InventoryPackagingConversionRecord,
  InventoryStockStatus,
  ProductRecord,
  PurchaseOrderItemRecord,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
  SupplierRecord,
} from '../types/finance';
import { roundCurrency } from './finance';

export const EMPTY_INVENTORY_BUNDLE: InventoryDataBundle = {
  balances: [],
  packagingConversions: [],
  movements: [],
  suppliers: [],
  productSuppliers: [],
  purchaseOrders: [],
  purchaseOrderItems: [],
  purchaseReceipts: [],
  purchaseReceiptItems: [],
  inventoryCounts: [],
  inventoryCountItems: [],
  comboConsumptions: [],
};

export const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  manual_entry: 'Entrada manual',
  purchase_receipt: 'Recebimento de compra',
  manual_exit: 'Saída manual',
  loss: 'Perda',
  damage: 'Quebra / Avaria',
  expiry: 'Vencimento',
  internal_consumption: 'Consumo interno',
  adjustment_in: 'Ajuste positivo',
  adjustment_out: 'Ajuste negativo',
  inventory_adjustment: 'Ajuste de inventário',
  return_in: 'Devolução / Retorno',
  combo_consumption: 'Consumo de combo',
};

export const PURCHASE_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Rascunho',
  pending: 'Pendente de recebimento',
  partially_received: 'Recebido parcialmente',
  received: 'Recebido integralmente',
  cancelled: 'Cancelado',
};

export const STOCK_STATUS_LABELS: Record<InventoryStockStatus, string> = {
  normal: 'Normal',
  near_minimum: 'Próximo do mínimo',
  low: 'Estoque baixo',
  out_of_stock: 'Sem estoque',
};

export function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function roundUnitCost(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function formatStockQty(qty: number, unit?: string | null): string {
  const rounded = roundQty(qty);
  const formatted = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      });
  return unit ? `${formatted} ${unit}` : formatted;
}

export function createInventoryIdempotencyKey(prefix = 'inv'): string {
  const cleanPrefix = prefix.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) || 'inv';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${cleanPrefix}_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `${cleanPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getMovementDirection(
  movementType: InventoryMovementType,
  explicitDelta = 0,
): InventoryMovementDirection {
  if (movementType === 'inventory_adjustment') {
    return explicitDelta >= 0 ? 'in' : 'out';
  }
  if (
    movementType === 'manual_entry' ||
    movementType === 'purchase_receipt' ||
    movementType === 'adjustment_in' ||
    movementType === 'return_in'
  ) {
    return 'in';
  }
  return 'out';
}

export function convertPackagingQuantity(params: {
  inputQuantity: number;
  conversionFactor: number;
  inputUnitTotalCost?: number | null;
}): {
  baseQuantity: number;
  totalCost: number;
  baseUnitCost: number;
} {
  const inputQty = roundQty(params.inputQuantity);
  const factor = roundQty(params.conversionFactor);
  if (inputQty <= 0) {
    throw new Error('Quantidade informada deve ser maior que zero.');
  }
  if (factor <= 0) {
    throw new Error('Fator de conversão da embalagem deve ser maior que zero.');
  }
  const baseQuantity = roundQty(inputQty * factor);
  if (baseQuantity <= 0) {
    throw new Error('Quantidade convertida para unidade base inválida.');
  }

  const rawTotalCost = params.inputUnitTotalCost;
  const totalCost =
    rawTotalCost !== null && rawTotalCost !== undefined
      ? roundCurrency(Math.max(0, rawTotalCost))
      : 0;
  const baseUnitCost = roundUnitCost(totalCost / baseQuantity);
  return { baseQuantity, totalCost, baseUnitCost };
}

/**
 * Calcula novo custo medio ponderado em entradas de estoque.
 * Quando o saldo anterior e <= 0, adota diretamente o custo unitario da nova entrada.
 */
export function computeWeightedAverageCost(params: {
  currentQty: number;
  currentAvgCost: number;
  entryBaseQty: number;
  entryTotalCost: number;
}): {
  newAverageUnitCost: number;
  entryUnitCost: number;
} {
  const currentQty = roundQty(params.currentQty);
  const currentAvg = roundUnitCost(Math.max(0, params.currentAvgCost));
  const entryQty = roundQty(params.entryBaseQty);
  const entryTotalCost = roundCurrency(Math.max(0, params.entryTotalCost));

  if (entryQty <= 0) {
    return { newAverageUnitCost: currentAvg, entryUnitCost: 0 };
  }

  const entryUnitCost = roundUnitCost(entryTotalCost / entryQty);
  if (currentQty <= 0) {
    return {
      newAverageUnitCost: entryUnitCost,
      entryUnitCost,
    };
  }

  const newAverageUnitCost = roundUnitCost(
    (currentQty * currentAvg + entryTotalCost) / (currentQty + entryQty),
  );
  return { newAverageUnitCost, entryUnitCost };
}

export function classifyStockStatus(
  availableQty: number,
  minStockQty: number,
): InventoryStockStatus {
  const qty = roundQty(availableQty);
  const minQty = roundQty(Math.max(0, minStockQty));

  if (qty <= 0) {
    return 'out_of_stock';
  }
  if (minQty > 0 && qty <= minQty) {
    return 'low';
  }
  if (minQty > 0 && qty <= roundQty(minQty * 1.25)) {
    return 'near_minimum';
  }
  return 'normal';
}

export function computeEstimatedInventoryValue(
  availableQty: number,
  averageUnitCost: number,
): number {
  if (availableQty <= 0 || averageUnitCost <= 0) return 0;
  return roundCurrency(availableQty * averageUnitCost);
}

export interface ProductConversionOption {
  id: string;
  packagingConversionId: string | null;
  label: string;
  unitLabel: string;
  factorToBase: number;
  source: 'base' | 'product_package' | 'custom';
  isDefaultPurchase: boolean;
}

export function buildProductConversionOptions(
  product: ProductRecord,
  customConversions: InventoryPackagingConversionRecord[],
): ProductConversionOption[] {
  const baseUnitLabel = product.saleUnit || 'unidade';
  const options: ProductConversionOption[] = [
    {
      id: `base_${product.id}`,
      packagingConversionId: null,
      label: `Unidade base (${baseUnitLabel} · 1x)`,
      unitLabel: baseUnitLabel,
      factorToBase: 1,
      source: 'base',
      isDefaultPurchase: false,
    },
  ];

  if (
    product.packageType &&
    product.packageType !== 'individual' &&
    typeof product.unitsPerPackage === 'number' &&
    product.unitsPerPackage > 1
  ) {
    const labelMap: Record<string, string> = {
      pacote: 'Pacote',
      caixa: 'Caixa',
      fardo: 'Fardo',
    };
    const pkgTitle = labelMap[product.packageType] || product.packageType;
    options.push({
      id: `prod_pkg_${product.id}`,
      packagingConversionId: null,
      label: `${pkgTitle} padrão (${product.unitsPerPackage}x ${baseUnitLabel})`,
      unitLabel: `${pkgTitle} c/ ${product.unitsPerPackage}`,
      factorToBase: product.unitsPerPackage,
      source: 'product_package',
      isDefaultPurchase: false,
    });
  }

  for (const conv of customConversions) {
    if (conv.productId !== product.id || !conv.active) continue;
    options.push({
      id: conv.id,
      packagingConversionId: conv.id,
      label: `${conv.packageLabel} (${conv.factorToBase}x ${baseUnitLabel})`,
      unitLabel: conv.packageLabel,
      factorToBase: conv.factorToBase,
      source: 'custom',
      isDefaultPurchase: conv.isDefaultPurchase,
    });
  }

  return options;
}

export function validateMovementQuantityAndStockGuard(params: {
  direction: InventoryMovementDirection;
  currentAvailableQty: number;
  baseQuantity: number;
  allowNegativeStock: boolean;
  allowNegativeOverride?: boolean;
  productName: string;
}): { allowed: boolean; nextBalance: number; message?: string } {
  const current = roundQty(params.currentAvailableQty);
  const delta = roundQty(params.baseQuantity);
  if (delta <= 0) {
    return {
      allowed: false,
      nextBalance: current,
      message: 'A quantidade movimentada precisa ser maior que zero.',
    };
  }

  if (params.direction === 'in') {
    return {
      allowed: true,
      nextBalance: roundQty(current + delta),
    };
  }

  const next = roundQty(current - delta);
  if (next < 0 && !(params.allowNegativeStock && params.allowNegativeOverride)) {
    return {
      allowed: false,
      nextBalance: next,
      message: `Estoque insuficiente para "${params.productName}" (disponível: ${formatStockQty(current)}, solicitado: ${formatStockQty(delta)}).`,
    };
  }

  return {
    allowed: true,
    nextBalance: next,
  };
}

export function calculatePurchaseOrderTotals(params: {
  items: Array<{ orderedQty: number; unitCost: number }>;
  discountAmount?: number;
  additionalExpenses?: number;
}): {
  itemsSubtotal: number;
  discountAmount: number;
  additionalExpenses: number;
  totalAmount: number;
} {
  const itemsSubtotal = roundCurrency(
    params.items.reduce((sum, item) => {
      const qty = Math.max(0, Number(item.orderedQty) || 0);
      const cost = Math.max(0, Number(item.unitCost) || 0);
      return sum + roundCurrency(qty * cost);
    }, 0),
  );
  const discountAmount = roundCurrency(Math.max(0, Number(params.discountAmount) || 0));
  const additionalExpenses = roundCurrency(
    Math.max(0, Number(params.additionalExpenses) || 0),
  );
  const totalAmount = roundCurrency(
    Math.max(0, itemsSubtotal - discountAmount + additionalExpenses),
  );
  return {
    itemsSubtotal,
    discountAmount,
    additionalExpenses,
    totalAmount,
  };
}

export function computeRemainingPurchaseItemQuantities(item: PurchaseOrderItemRecord): {
  remainingBaseQty: number;
  remainingInputQty: number;
  progressPercent: number;
  isFullyReceived: boolean;
} {
  const remainingBaseQty = roundQty(
    Math.max(0, item.orderedBaseQty - item.receivedBaseQty),
  );
  const factor = Math.max(0.001, item.conversionFactor || 1);
  const remainingInputQty = roundQty(remainingBaseQty / factor);
  const progressPercent =
    item.orderedBaseQty > 0
      ? Math.min(100, Math.round((item.receivedBaseQty / item.orderedBaseQty) * 100))
      : 0;
  return {
    remainingBaseQty,
    remainingInputQty,
    progressPercent,
    isFullyReceived: remainingBaseQty <= 0.001,
  };
}

export function canCancelPurchaseOrderStatus(status: PurchaseOrderStatus): boolean {
  return status === 'draft' || status === 'pending' || status === 'partially_received';
}

export interface ProductInventorySummaryRow {
  product: ProductRecord;
  balance: InventoryBalanceRecord | null;
  availableQty: number;
  reservedQty: number;
  minStockQty: number;
  averageUnitCost: number;
  lastCostPrice: number;
  allowNegativeStock: boolean;
  estimatedTotalValue: number;
  status: InventoryStockStatus;
}

export function buildProductInventoryRows(
  products: ProductRecord[],
  balances: InventoryBalanceRecord[],
): ProductInventorySummaryRow[] {
  const balanceByProduct = new Map<string, InventoryBalanceRecord>();
  for (const b of balances) {
    balanceByProduct.set(b.productId, b);
  }

  return products.map((product) => {
    const balance = balanceByProduct.get(product.id) ?? null;
    const availableQty = roundQty(balance?.availableQty ?? 0);
    const reservedQty = roundQty(balance?.reservedQty ?? 0);
    const minStockQty = roundQty(balance?.minStockQty ?? 0);
    const averageUnitCost = roundUnitCost(
      balance?.averageUnitCost ?? product.costPrice ?? 0,
    );
    const lastCostPrice = roundUnitCost(
      balance?.lastCostPrice ?? product.costPrice ?? 0,
    );
    const allowNegativeStock = balance?.allowNegativeStock ?? false;
    const estimatedTotalValue = computeEstimatedInventoryValue(
      availableQty,
      averageUnitCost,
    );
    const status = classifyStockStatus(availableQty, minStockQty);

    return {
      product,
      balance,
      availableQty,
      reservedQty,
      minStockQty,
      averageUnitCost,
      lastCostPrice,
      allowNegativeStock,
      estimatedTotalValue,
      status,
    };
  });
}

export interface InventoryOverviewSummary {
  totalTrackedProducts: number;
  totalUnitsAvailable: number;
  totalEstimatedValue: number;
  outOfStockCount: number;
  lowStockCount: number;
  nearMinimumCount: number;
  pendingPurchasesCount: number;
  openCountsCount: number;
  recentMovements: InventoryMovementRecord[];
}

export function buildInventoryOverviewSummary(
  rows: ProductInventorySummaryRow[],
  bundle: InventoryDataBundle,
): InventoryOverviewSummary {
  let totalUnitsAvailable = 0;
  let totalEstimatedValue = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;
  let nearMinimumCount = 0;

  for (const row of rows) {
    if (!row.product.active && row.availableQty === 0) continue;
    if (row.availableQty > 0) {
      totalUnitsAvailable = roundQty(totalUnitsAvailable + row.availableQty);
    }
    totalEstimatedValue = roundCurrency(
      totalEstimatedValue + row.estimatedTotalValue,
    );
    if (row.status === 'out_of_stock') outOfStockCount += 1;
    else if (row.status === 'low') lowStockCount += 1;
    else if (row.status === 'near_minimum') nearMinimumCount += 1;
  }

  const pendingPurchasesCount = bundle.purchaseOrders.filter(
    (po) => po.status === 'pending' || po.status === 'partially_received',
  ).length;
  const openCountsCount = bundle.inventoryCounts.filter(
    (cnt) => cnt.status === 'open',
  ).length;

  return {
    totalTrackedProducts: rows.filter((r) => r.product.active || r.availableQty !== 0).length,
    totalUnitsAvailable,
    totalEstimatedValue,
    outOfStockCount,
    lowStockCount,
    nearMinimumCount,
    pendingPurchasesCount,
    openCountsCount,
    recentMovements: [...bundle.movements]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 8),
  };
}

export interface InventoryMovementFilterParams {
  productId?: string;
  category?: string;
  supplierId?: string;
  movementType?: InventoryMovementType | '';
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  search?: string;
}

export function filterInventoryMovements(
  movements: InventoryMovementRecord[],
  products: ProductRecord[],
  suppliers: SupplierRecord[],
  filters: InventoryMovementFilterParams,
): InventoryMovementRecord[] {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const searchNorm = (filters.search || '').trim().toLowerCase();

  return movements
    .filter((mov) => {
      if (filters.productId && mov.productId !== filters.productId) return false;
      if (filters.supplierId && mov.supplierId !== filters.supplierId) return false;
      if (filters.movementType && mov.movementType !== filters.movementType) return false;

      const product = productMap.get(mov.productId);
      if (filters.category && product?.category !== filters.category) return false;

      if (filters.dateFrom) {
        const fromMs = Date.parse(`${filters.dateFrom}T00:00:00`);
        if (Number.isFinite(fromMs) && mov.createdAtMs < fromMs) return false;
      }
      if (filters.dateTo) {
        const toMs = Date.parse(`${filters.dateTo}T23:59:59.999`);
        if (Number.isFinite(toMs) && mov.createdAtMs > toMs) return false;
      }

      if (searchNorm) {
        const supplierName = mov.supplierId
          ? supplierMap.get(mov.supplierId)?.name || ''
          : '';
        const haystack = [
          product?.name || '',
          product?.internalCode || '',
          product?.barcode || '',
          supplierName,
          mov.reason,
          mov.notes,
          mov.inputUnit,
          mov.actorEmail,
          MOVEMENT_TYPE_LABELS[mov.movementType],
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchNorm)) return false;
      }

      return true;
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function summarizeInventoryCountItems(
  count: InventoryCountRecord,
  items: InventoryCountItemRecord[],
): {
  totalItems: number;
  countedItems: number;
  divergentItems: number;
  netDifferenceQty: number;
  netEstimatedDifferenceValue: number;
  isReadyToFinalize: boolean;
} {
  const scoped = items.filter((item) => item.countId === count.id);
  let countedItems = 0;
  let divergentItems = 0;
  let netDifferenceQty = 0;
  let netEstimatedDifferenceValue = 0;

  for (const item of scoped) {
    if (item.countedQty !== null) {
      countedItems += 1;
      const diff = roundQty(item.countedQty - item.expectedQty);
      if (diff !== 0) divergentItems += 1;
      netDifferenceQty = roundQty(netDifferenceQty + diff);
      netEstimatedDifferenceValue = roundCurrency(
        netEstimatedDifferenceValue + diff * item.unitCostSnapshot,
      );
    }
  }

  return {
    totalItems: scoped.length,
    countedItems,
    divergentItems,
    netDifferenceQty,
    netEstimatedDifferenceValue,
    isReadyToFinalize: count.status === 'open' && countedItems > 0,
  };
}
