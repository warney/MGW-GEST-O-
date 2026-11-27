import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  Building2,
  ClipboardCheck,
  History,
  PackageCheck,
  Plus,
  Search,
  Settings2,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import type {
  CreatePurchaseOrderInput,
  InventoryDataBundle,
  InventoryMovementType,
  InventoryPackagingConversionInput,
  InventoryStockStatus,
  ProductRecord,
  ProductSupplierLinkInput,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
  ReceivePurchaseItemInput,
  RecordInventoryMovementInput,
  SupplierInput,
} from '../types/finance';
import { formatCurrencyBRL } from '../utils/finance';
import {
  buildInventoryOverviewSummary,
  buildProductInventoryRows,
  canCancelPurchaseOrderStatus,
  computeRemainingPurchaseItemQuantities,
  filterInventoryMovements,
  formatStockQty,
  MOVEMENT_TYPE_LABELS,
  PURCHASE_STATUS_LABELS,
  STOCK_STATUS_LABELS,
} from '../utils/inventory';
import { InventoryCountsTab } from './inventory/InventoryCountsTab';
import { InventoryMovementModal } from './inventory/InventoryMovementModal';
import { InventoryProductConfigModal } from './inventory/InventoryProductConfigModal';
import {
  InventoryPurchaseCreateModal,
  InventoryReceiveModal,
} from './inventory/InventoryPurchaseModal';
import { InventorySuppliersTab } from './inventory/InventorySuppliersTab';

type InventoryTabId =
  | 'overview'
  | 'balances'
  | 'purchases'
  | 'suppliers'
  | 'counts'
  | 'history';

interface InventoryViewProps {
  establishmentName: string;
  products: ProductRecord[];
  inventory: InventoryDataBundle;
  canWrite: boolean;
  isLoading: boolean;
  onRecordMovement: (
    input: RecordInventoryMovementInput,
  ) => Promise<{ movementId: string; newBalance: number }>;
  onSaveProductConfig: (
    productId: string,
    minStockQty: number,
    allowNegativeStock: boolean,
  ) => Promise<void>;
  onSavePackagingConversion: (
    input: InventoryPackagingConversionInput,
    conversionId?: string,
  ) => Promise<string>;
  onDeletePackagingConversion: (conversionId: string) => Promise<void>;
  onSaveSupplier: (input: SupplierInput, supplierId?: string) => Promise<string>;
  onUpsertProductSupplierLink: (
    input: ProductSupplierLinkInput,
  ) => Promise<string>;
  onDeleteProductSupplierLink: (linkId: string) => Promise<void>;
  onCreatePurchaseOrder: (input: CreatePurchaseOrderInput) => Promise<string>;
  onUpdatePurchaseOrderStatus: (
    purchaseOrderId: string,
    nextStatus: 'pending' | 'cancelled',
    reason?: string,
  ) => Promise<void>;
  onReceivePurchaseItems: (
    purchaseOrderId: string,
    items: ReceivePurchaseItemInput[],
    notes: string,
    idempotencyKey: string,
  ) => Promise<string>;
  onStartInventoryCount: (
    title: string,
    productIds: string[] | null,
    notes: string,
  ) => Promise<string>;
  onSaveInventoryCountItems: (
    countId: string,
    items: Array<{ countItemId: string; countedQty: number | null; notes?: string }>,
  ) => Promise<void>;
  onFinalizeInventoryCount: (countId: string) => Promise<void>;
  onCancelInventoryCount: (countId: string) => Promise<void>;
}

function getStockStatusTextClass(status: InventoryStockStatus): string {
  switch (status) {
    case 'out_of_stock':
      return 'text-[#E35D62]';
    case 'low':
      return 'text-[#D97706]';
    case 'near_minimum':
      return 'text-[#B38300]';
    default:
      return 'text-[#16A36A]';
  }
}

function getPurchaseStatusTextClass(status: PurchaseOrderStatus): string {
  switch (status) {
    case 'received':
      return 'text-[#16A36A]';
    case 'partially_received':
      return 'text-[#2563EB]';
    case 'cancelled':
      return 'text-[#E35D62]';
    case 'pending':
      return 'text-[#B38300]';
    default:
      return 'text-[#778094]';
  }
}

export function InventoryView({
  establishmentName,
  products,
  inventory,
  canWrite,
  isLoading,
  onRecordMovement,
  onSaveProductConfig,
  onSavePackagingConversion,
  onDeletePackagingConversion,
  onSaveSupplier,
  onUpsertProductSupplierLink,
  onDeleteProductSupplierLink,
  onCreatePurchaseOrder,
  onUpdatePurchaseOrderStatus,
  onReceivePurchaseItems,
  onStartInventoryCount,
  onSaveInventoryCountItems,
  onFinalizeInventoryCount,
  onCancelInventoryCount,
}: InventoryViewProps) {
  const [activeTab, setActiveTab] = useState<InventoryTabId>('overview');

  // Filtros de Produtos & Saldos
  const [balanceSearch, setBalanceSearch] = useState('');
  const [balanceCategory, setBalanceCategory] = useState('');
  const [balanceStatus, setBalanceStatus] = useState<InventoryStockStatus | ''>('');

  // Filtros de Compras
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<PurchaseOrderStatus | ''>('');
  const [purchaseSupplierFilter, setPurchaseSupplierFilter] = useState('');

  // Filtros do Histórico
  const [historySearch, setHistorySearch] = useState('');
  const [historyProductId, setHistoryProductId] = useState('');
  const [historyCategory, setHistoryCategory] = useState('');
  const [historySupplierId, setHistorySupplierId] = useState('');
  const [historyType, setHistoryType] = useState<InventoryMovementType | ''>('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');

  // Modais
  const [movementModal, setMovementModal] = useState<{
    open: boolean;
    mode: 'in' | 'out';
    productId?: string;
  }>({ open: false, mode: 'in' });
  const [configProduct, setConfigProduct] = useState<ProductRecord | null>(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrderRecord | null>(null);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const supplierMap = useMemo(
    () => new Map(inventory.suppliers.map((s) => [s.id, s])),
    [inventory.suppliers],
  );
  const categories = useMemo(
    () =>
      Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, 'pt-BR'),
      ),
    [products],
  );

  const inventoryRows = useMemo(
    () => buildProductInventoryRows(products, inventory.balances),
    [products, inventory.balances],
  );

  const overview = useMemo(
    () => buildInventoryOverviewSummary(inventoryRows, inventory),
    [inventoryRows, inventory],
  );

  const alertRows = useMemo(
    () =>
      inventoryRows
        .filter(
          (r) =>
            r.product.active &&
            (r.status === 'out_of_stock' ||
              r.status === 'low' ||
              r.status === 'near_minimum'),
        )
        .sort((a, b) => a.availableQty - b.availableQty),
    [inventoryRows],
  );

  const filteredBalanceRows = useMemo(() => {
    const q = balanceSearch.trim().toLowerCase();
    return inventoryRows
      .filter((row) => {
        if (balanceCategory && row.product.category !== balanceCategory) return false;
        if (balanceStatus && row.status !== balanceStatus) return false;
        if (q) {
          const hay = [
            row.product.name,
            row.product.brand || '',
            row.product.internalCode || '',
            row.product.barcode || '',
            row.product.category,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.product.active !== b.product.active) return a.product.active ? -1 : 1;
        return a.product.name.localeCompare(b.product.name, 'pt-BR');
      });
  }, [inventoryRows, balanceCategory, balanceStatus, balanceSearch]);

  const filteredPurchases = useMemo(
    () =>
      inventory.purchaseOrders
        .filter((po) => {
          if (purchaseStatusFilter && po.status !== purchaseStatusFilter) return false;
          if (purchaseSupplierFilter && po.supplierId !== purchaseSupplierFilter) return false;
          return true;
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs),
    [inventory.purchaseOrders, purchaseStatusFilter, purchaseSupplierFilter],
  );

  const filteredHistory = useMemo(
    () =>
      filterInventoryMovements(
        inventory.movements,
        products,
        inventory.suppliers,
        {
          productId: historyProductId,
          category: historyCategory,
          supplierId: historySupplierId,
          movementType: historyType,
          dateFrom: historyDateFrom,
          dateTo: historyDateTo,
          search: historySearch,
        },
      ),
    [
      inventory.movements,
      products,
      inventory.suppliers,
      historyProductId,
      historyCategory,
      historySupplierId,
      historyType,
      historyDateFrom,
      historyDateTo,
      historySearch,
    ],
  );

  const tabs: Array<{ id: InventoryTabId; label: string; icon: typeof Boxes }> = [
    { id: 'overview', label: 'Visão Geral', icon: TrendingUp },
    { id: 'balances', label: 'Produtos & Saldos', icon: Boxes },
    { id: 'purchases', label: 'Compras', icon: ShoppingCart },
    { id: 'suppliers', label: 'Fornecedores', icon: Building2 },
    { id: 'counts', label: 'Inventários', icon: ClipboardCheck },
    { id: 'history', label: 'Histórico', icon: History },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="mgw-skeleton h-28" />
          ))}
        </div>
        <div className="mgw-skeleton h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">
            Estoque Profissional · {establishmentName}
          </h1>
          <p className="text-xs text-[#778094] mt-0.5">
            Controle de saldos, conversões de embalagem, compras, fornecedores, inventários e histórico auditável para adegas.
          </p>
        </div>

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMovementModal({ open: true, mode: 'in' })}
              className="mgw-btn-primary min-h-[42px] px-4 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowUpCircle className="w-4 h-4" />
              Nova Entrada
            </button>
            <button
              type="button"
              onClick={() => setMovementModal({ open: true, mode: 'out' })}
              className="mgw-btn-secondary min-h-[42px] px-4 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowDownCircle className="w-4 h-4 text-[#E35D62]" />
              Registrar Saída
            </button>
            <button
              type="button"
              onClick={() => setPurchaseModalOpen(true)}
              className="mgw-btn-secondary min-h-[42px] px-4 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nova Compra
            </button>
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[#E8EAF0]"
        role="tablist"
        aria-label="Seções do módulo de estoque"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-3.5 rounded-t-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                active
                  ? 'border-[#F5B900] text-[#172033] bg-white'
                  : 'border-transparent text-[#778094] hover:text-[#172033]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ==================== 1. VISÃO GERAL ==================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="mgw-card p-5">
              <p className="text-xs font-semibold text-[#778094]">
                Produtos monitorados
              </p>
              <p className="text-2xl font-extrabold text-[#172033] mt-1 tabular-nums">
                {overview.totalTrackedProducts}
              </p>
              <p className="text-[11px] text-[#778094] mt-1 tabular-nums">
                {formatStockQty(overview.totalUnitsAvailable)} unidades em estoque
              </p>
            </div>

            <div className="mgw-card p-5">
              <p className="text-xs font-semibold text-[#778094]">
                Valor estimado em estoque
              </p>
              <p className="text-2xl font-extrabold text-[#172033] mt-1 tabular-nums">
                {formatCurrencyBRL(overview.totalEstimatedValue)}
              </p>
              <p className="text-[11px] text-[#778094] mt-1">
                Calculado pelo custo médio ponderado
              </p>
            </div>

            <div className="mgw-card p-5">
              <p className="text-xs font-semibold text-[#778094]">
                Alertas de reposição
              </p>
              <p className="text-2xl font-extrabold text-[#172033] mt-1 tabular-nums">
                {overview.outOfStockCount + overview.lowStockCount}
              </p>
              <p className="text-[11px] text-[#778094] mt-1 tabular-nums">
                {overview.outOfStockCount} sem estoque · {overview.lowStockCount} baixo ·{' '}
                {overview.nearMinimumCount} próximo
              </p>
            </div>

            <div className="mgw-card p-5">
              <p className="text-xs font-semibold text-[#778094]">
                Compras &amp; Inventários em aberto
              </p>
              <p className="text-2xl font-extrabold text-[#172033] mt-1 tabular-nums">
                {overview.pendingPurchasesCount + overview.openCountsCount}
              </p>
              <p className="text-[11px] text-[#778094] mt-1 tabular-nums">
                {overview.pendingPurchasesCount} pedido(s) aguardando entrega ·{' '}
                {overview.openCountsCount} contagem aberta
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 mgw-card p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[#172033] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#D97706]" />
                  Alertas de Estoque
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('balances')}
                  className="text-xs font-semibold text-[#B38300] hover:underline cursor-pointer"
                >
                  Ver todos os saldos
                </button>
              </div>

              {alertRows.length === 0 ? (
                <p className="text-xs text-[#778094] py-4">
                  Nenhum produto ativo está sem estoque ou abaixo do mínimo configurado.
                </p>
              ) : (
                <div className="divide-y divide-[#E8EAF0]">
                  {alertRows.slice(0, 8).map((row) => (
                    <div
                      key={row.product.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#172033] truncate">
                          {row.product.name}
                        </p>
                        <p className="text-[11px] text-[#778094] tabular-nums">
                          Saldo: {formatStockQty(row.availableQty, row.product.saleUnit || 'un')} · Mínimo:{' '}
                          {formatStockQty(row.minStockQty, row.product.saleUnit || 'un')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`font-semibold ${getStockStatusTextClass(row.status)}`}
                        >
                          {STOCK_STATUS_LABELS[row.status]}
                        </span>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() =>
                              setMovementModal({
                                open: true,
                                mode: 'in',
                                productId: row.product.id,
                              })
                            }
                            className="mgw-btn-secondary min-h-[32px] px-2.5 text-[11px] cursor-pointer"
                          >
                            Repor
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 mgw-card p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[#172033] flex items-center gap-2">
                  <History className="w-4 h-4 text-[#778094]" />
                  Últimas Movimentações
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="text-xs font-semibold text-[#B38300] hover:underline cursor-pointer"
                >
                  Histórico completo
                </button>
              </div>

              {overview.recentMovements.length === 0 ? (
                <p className="text-xs text-[#778094] py-4">
                  Nenhuma movimentação registrada ainda. Lance uma entrada manual ou confirme o recebimento de uma compra.
                </p>
              ) : (
                <div className="divide-y divide-[#E8EAF0]">
                  {overview.recentMovements.map((mov) => {
                    const prod = productMap.get(mov.productId);
                    return (
                      <div
                        key={mov.id}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-[#172033] truncate">
                            {prod?.name || 'Produto'} · {MOVEMENT_TYPE_LABELS[mov.movementType]}
                          </p>
                          <p className="text-[11px] text-[#778094] truncate">
                            {new Date(mov.createdAtMs).toLocaleString('pt-BR')} ·{' '}
                            {mov.reason || mov.inputUnit}
                          </p>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <p
                            className={`font-bold ${
                              mov.direction === 'in'
                                ? 'text-[#16A36A]'
                                : 'text-[#E35D62]'
                            }`}
                          >
                            {mov.direction === 'in' ? '+' : '-'}
                            {formatStockQty(mov.baseQuantity, prod?.saleUnit || 'un')}
                          </p>
                          <p className="text-[11px] text-[#778094]">
                            Saldo: {formatStockQty(mov.newBalance)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. PRODUTOS & SALDOS ==================== */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          <div className="mgw-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={balanceSearch}
                onChange={(e) => setBalanceSearch(e.target.value)}
                placeholder="Buscar produto, código ou barras..."
                className="mgw-input pl-10"
              />
            </div>
            <select
              value={balanceCategory}
              onChange={(e) => setBalanceCategory(e.target.value)}
              className="mgw-input"
            >
              <option value="">Todas as categorias</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              value={balanceStatus}
              onChange={(e) =>
                setBalanceStatus(e.target.value as InventoryStockStatus | '')
              }
              className="mgw-input"
            >
              <option value="">Todos os status de estoque</option>
              <option value="out_of_stock">Sem estoque</option>
              <option value="low">Estoque baixo</option>
              <option value="near_minimum">Próximo do mínimo</option>
              <option value="normal">Normal</option>
            </select>
          </div>

          {filteredBalanceRows.length === 0 ? (
            <div className="mgw-card p-8 text-center text-xs text-[#778094]">
              Nenhum produto encontrado com os filtros aplicados.
            </div>
          ) : (
            <div className="mgw-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E8EAF0] bg-[#F5F6FA] text-[#778094] font-semibold">
                      <th className="py-3 px-4">Produto</th>
                      <th className="py-3 px-3 text-right">Disponível</th>
                      <th className="py-3 px-3 text-right">Reservado</th>
                      <th className="py-3 px-3 text-right">Mínimo</th>
                      <th className="py-3 px-3 text-right">Custo médio</th>
                      <th className="py-3 px-3 text-right">Valor em estoque</th>
                      <th className="py-3 px-3">Situação</th>
                      {canWrite && <th className="py-3 px-4 text-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EAF0]">
                    {filteredBalanceRows.map((row) => {
                      const baseUnit = row.product.saleUnit || 'un';
                      return (
                        <tr key={row.product.id} className="hover:bg-[#F5F6FA]/50">
                          <td className="py-3 px-4">
                            <p className="font-bold text-[#172033]">
                              {row.product.name}
                            </p>
                            <p className="text-[11px] text-[#778094]">
                              {[
                                row.product.category,
                                row.product.volumeValue && row.product.volumeUnit
                                  ? `${row.product.volumeValue} ${row.product.volumeUnit}`
                                  : null,
                                row.product.internalCode
                                  ? `Cód. ${row.product.internalCode}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-[#172033] tabular-nums">
                            {formatStockQty(row.availableQty, baseUnit)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[#778094] tabular-nums">
                            {formatStockQty(row.reservedQty, baseUnit)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[#778094] tabular-nums">
                            {formatStockQty(row.minStockQty, baseUnit)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[#172033] tabular-nums">
                            {formatCurrencyBRL(row.averageUnitCost)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold text-[#172033] tabular-nums">
                            {formatCurrencyBRL(row.estimatedTotalValue)}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`font-semibold ${getStockStatusTextClass(row.status)}`}
                            >
                              {STOCK_STATUS_LABELS[row.status]}
                            </span>
                          </td>
                          {canWrite && (
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMovementModal({
                                      open: true,
                                      mode: 'in',
                                      productId: row.product.id,
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg border border-[#E8EAF0] bg-white hover:bg-[#ECFDF5] text-[#16A36A] font-semibold cursor-pointer"
                                >
                                  +Entrada
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMovementModal({
                                      open: true,
                                      mode: 'out',
                                      productId: row.product.id,
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg border border-[#E8EAF0] bg-white hover:bg-[#FEF2F2] text-[#E35D62] font-semibold cursor-pointer"
                                >
                                  -Saída
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfigProduct(row.product)}
                                  className="p-1.5 rounded-lg border border-[#E8EAF0] bg-white text-[#778094] hover:text-[#172033] cursor-pointer"
                                  aria-label={`Configurar ${row.product.name}`}
                                >
                                  <Settings2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== 3. COMPRAS & RECEBIMENTOS ==================== */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 max-w-xl">
              <select
                value={purchaseStatusFilter}
                onChange={(e) =>
                  setPurchaseStatusFilter(e.target.value as PurchaseOrderStatus | '')
                }
                className="mgw-input"
              >
                <option value="">Todos os status de compra</option>
                <option value="draft">Rascunho</option>
                <option value="pending">Pendente</option>
                <option value="partially_received">Recebido parcialmente</option>
                <option value="received">Recebido integralmente</option>
                <option value="cancelled">Cancelado</option>
              </select>
              <select
                value={purchaseSupplierFilter}
                onChange={(e) => setPurchaseSupplierFilter(e.target.value)}
                className="mgw-input"
              >
                <option value="">Todos os fornecedores</option>
                {inventory.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => setPurchaseModalOpen(true)}
                className="mgw-btn-primary min-h-[42px] px-4 flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nova Compra
              </button>
            )}
          </div>

          {filteredPurchases.length === 0 ? (
            <div className="mgw-card p-8 text-center space-y-2.5">
              <div className="w-11 h-11 rounded-2xl bg-[#F5F6FA] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mx-auto">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#172033]">
                Nenhum pedido de compra encontrado
              </h3>
              <p className="text-xs text-[#778094] max-w-md mx-auto">
                Crie pedidos de compra por fornecedor e registre recebimentos parciais ou integrais conforme as entregas chegam na loja.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPurchases.map((po) => {
                const supplierName =
                  supplierMap.get(po.supplierId)?.name || 'Fornecedor';
                const poItems = inventory.purchaseOrderItems.filter(
                  (i) => i.purchaseOrderId === po.id,
                );
                const poReceipts = inventory.purchaseReceipts.filter(
                  (r) => r.purchaseOrderId === po.id,
                );
                return (
                  <div key={po.id} className="mgw-card p-5 space-y-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-[#172033] tabular-nums">
                            Compra #{po.orderNumber} · {supplierName}
                          </h3>
                          <span
                            className={`text-xs font-bold ${getPurchaseStatusTextClass(po.status)}`}
                          >
                            {PURCHASE_STATUS_LABELS[po.status]}
                          </span>
                        </div>
                        <p className="text-xs text-[#778094] mt-0.5">
                          Criado em {new Date(po.createdAtMs).toLocaleDateString('pt-BR')}
                          {po.paymentTerms ? ` · ${po.paymentTerms}` : ''}
                          {po.expectedDeliveryDate
                            ? ` · Previsão: ${po.expectedDeliveryDate}`
                            : ''}
                          {' · '}
                          Total:{' '}
                          <strong className="text-[#172033] tabular-nums">
                            {formatCurrencyBRL(po.totalAmount)}
                          </strong>
                        </p>
                      </div>

                      {canWrite && (
                        <div className="flex flex-wrap items-center gap-2">
                          {po.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() =>
                                void onUpdatePurchaseOrderStatus(po.id, 'pending')
                              }
                              className="mgw-btn-secondary min-h-[36px] px-3 text-xs cursor-pointer"
                            >
                              Confirmar Pedido
                            </button>
                          )}
                          {(po.status === 'pending' ||
                            po.status === 'partially_received') && (
                            <button
                              type="button"
                              onClick={() => setReceiveOrder(po)}
                              className="mgw-btn-primary min-h-[36px] px-3.5 text-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              Receber Mercadorias
                            </button>
                          )}
                          {canCancelPurchaseOrderStatus(po.status) && (
                            <button
                              type="button"
                              onClick={() =>
                                void onUpdatePurchaseOrderStatus(
                                  po.id,
                                  'cancelled',
                                  'Cancelado pelo gestor',
                                )
                              }
                              className="mgw-btn-secondary min-h-[36px] px-3 text-xs text-[#E35D62] cursor-pointer"
                            >
                              Cancelar Pedido
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {poItems.map((item) => {
                        const prod = productMap.get(item.productId);
                        const rem = computeRemainingPurchaseItemQuantities(item);
                        const baseUnit = prod?.saleUnit || 'un';
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl bg-[#F5F6FA] border border-[#E8EAF0] p-3 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[#172033] truncate">
                                {prod?.name || 'Produto'}
                              </span>
                              <span className="text-[11px] font-mono text-[#778094] tabular-nums shrink-0">
                                {rem.progressPercent}%
                              </span>
                            </div>
                            <p className="text-[11px] text-[#778094] tabular-nums">
                              Pedido: {item.orderedQty} {item.unitLabel} (
                              {formatStockQty(item.orderedBaseQty, baseUnit)})
                            </p>
                            <p className="text-[11px] text-[#778094] tabular-nums">
                              Recebido: {formatStockQty(item.receivedBaseQty, baseUnit)} · Restante:{' '}
                              {formatStockQty(rem.remainingBaseQty, baseUnit)}
                            </p>
                            <div className="h-1.5 rounded-full bg-[#E8EAF0] overflow-hidden">
                              <div
                                className="h-full bg-[#16A36A] transition-all"
                                style={{ width: `${rem.progressPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {poReceipts.length > 0 && (
                      <div className="pt-2 border-t border-[#E8EAF0] text-[11px] text-[#778094] space-y-1">
                        <p className="font-semibold text-[#172033]">
                          Recebimentos registrados ({poReceipts.length}):
                        </p>
                        {poReceipts.map((rec) => (
                          <p key={rec.id}>
                            Rec. #{rec.receiptNumber} em{' '}
                            {new Date(rec.receivedAtMs).toLocaleString('pt-BR')} ·{' '}
                            {rec.receivedByEmail || 'sistema'}
                            {rec.notes ? ` · "${rec.notes}"` : ''}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== 4. FORNECEDORES ==================== */}
      {activeTab === 'suppliers' && (
        <InventorySuppliersTab
          suppliers={inventory.suppliers}
          productSuppliers={inventory.productSuppliers}
          products={products}
          purchaseOrders={inventory.purchaseOrders}
          canWrite={canWrite}
          onSaveSupplier={onSaveSupplier}
          onUpsertProductLink={onUpsertProductSupplierLink}
          onDeleteProductLink={onDeleteProductSupplierLink}
        />
      )}

      {/* ==================== 5. INVENTÁRIOS ==================== */}
      {activeTab === 'counts' && (
        <InventoryCountsTab
          counts={inventory.inventoryCounts}
          countItems={inventory.inventoryCountItems}
          products={products}
          canWrite={canWrite}
          onStartCount={onStartInventoryCount}
          onSaveCountItems={onSaveInventoryCountItems}
          onFinalizeCount={onFinalizeInventoryCount}
          onCancelCount={onCancelInventoryCount}
        />
      )}

      {/* ==================== 6. HISTÓRICO AUDITÁVEL ==================== */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="mgw-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Buscar produto, motivo, operador..."
                className="mgw-input pl-10"
              />
            </div>

            <select
              value={historyProductId}
              onChange={(e) => setHistoryProductId(e.target.value)}
              className="mgw-input"
            >
              <option value="">Todos os produtos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={historyCategory}
              onChange={(e) => setHistoryCategory(e.target.value)}
              className="mgw-input"
            >
              <option value="">Todas as categorias</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={historySupplierId}
              onChange={(e) => setHistorySupplierId(e.target.value)}
              className="mgw-input"
            >
              <option value="">Todos os fornecedores</option>
              {inventory.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={historyType}
              onChange={(e) =>
                setHistoryType(e.target.value as InventoryMovementType | '')
              }
              className="mgw-input"
            >
              <option value="">Todos os tipos</option>
              {(
                Object.keys(MOVEMENT_TYPE_LABELS) as InventoryMovementType[]
              ).map((k) => (
                <option key={k} value={k}>
                  {MOVEMENT_TYPE_LABELS[k]}
                </option>
              ))}
            </select>

            <div className="lg:col-span-3 grid grid-cols-2 gap-3">
              <input
                type="date"
                value={historyDateFrom}
                onChange={(e) => setHistoryDateFrom(e.target.value)}
                aria-label="Data inicial"
                className="mgw-input"
              />
              <input
                type="date"
                value={historyDateTo}
                onChange={(e) => setHistoryDateTo(e.target.value)}
                aria-label="Data final"
                className="mgw-input"
              />
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="mgw-card p-8 text-center text-xs text-[#778094]">
              Nenhuma movimentação encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="mgw-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E8EAF0] bg-[#F5F6FA] text-[#778094] font-semibold">
                      <th className="py-3 px-4">Data / Hora</th>
                      <th className="py-3 px-3">Produto</th>
                      <th className="py-3 px-3">Tipo</th>
                      <th className="py-3 px-3 text-right">Informado</th>
                      <th className="py-3 px-3 text-right">Base</th>
                      <th className="py-3 px-3 text-right">Saldo (Ant. → Novo)</th>
                      <th className="py-3 px-3 text-right">Custo Total</th>
                      <th className="py-3 px-4">Origem / Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EAF0]">
                    {filteredHistory.map((mov) => {
                      const prod = productMap.get(mov.productId);
                      const sup = mov.supplierId
                        ? supplierMap.get(mov.supplierId)
                        : null;
                      const baseUnit = prod?.saleUnit || 'un';
                      return (
                        <tr key={mov.id} className="hover:bg-[#F5F6FA]/50">
                          <td className="py-3 px-4 whitespace-nowrap text-[#778094] tabular-nums">
                            {new Date(mov.createdAtMs).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-[#172033]">
                              {prod?.name || 'Produto'}
                            </p>
                            {sup && (
                              <p className="text-[11px] text-[#778094]">
                                Forn.: {sup.name}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 font-medium text-[#172033]">
                            {MOVEMENT_TYPE_LABELS[mov.movementType]}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-[#778094]">
                            {mov.inputQuantity} {mov.inputUnit} (×{mov.conversionFactorUsed})
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono font-bold tabular-nums ${
                              mov.direction === 'in'
                                ? 'text-[#16A36A]'
                                : 'text-[#E35D62]'
                            }`}
                          >
                            {mov.direction === 'in' ? '+' : '-'}
                            {formatStockQty(mov.baseQuantity, baseUnit)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-[#172033]">
                            {formatStockQty(mov.previousBalance)} →{' '}
                            <strong>{formatStockQty(mov.newBalance)}</strong>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-[#172033]">
                            {formatCurrencyBRL(mov.totalCost)}
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-[#172033]">{mov.reason || '—'}</p>
                            <p className="text-[11px] text-[#778094]">
                              {mov.actorEmail || 'sistema'}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modais operacionais */}
      <InventoryMovementModal
        isOpen={movementModal.open}
        mode={movementModal.mode}
        initialProductId={movementModal.productId}
        products={products}
        balances={inventory.balances}
        conversions={inventory.packagingConversions}
        suppliers={inventory.suppliers}
        onClose={() => setMovementModal((prev) => ({ ...prev, open: false }))}
        onSubmit={async (input) => {
          await onRecordMovement(input);
        }}
      />

      <InventoryProductConfigModal
        isOpen={configProduct !== null}
        product={configProduct}
        balance={
          configProduct
            ? inventory.balances.find((b) => b.productId === configProduct.id) ??
              null
            : null
        }
        conversions={inventory.packagingConversions}
        onClose={() => setConfigProduct(null)}
        onSaveConfig={onSaveProductConfig}
        onSaveConversion={onSavePackagingConversion}
        onDeleteConversion={onDeletePackagingConversion}
      />

      <InventoryPurchaseCreateModal
        isOpen={purchaseModalOpen}
        products={products}
        conversions={inventory.packagingConversions}
        suppliers={inventory.suppliers}
        onClose={() => setPurchaseModalOpen(false)}
        onCreate={async (input) => {
          await onCreatePurchaseOrder(input);
        }}
      />

      <InventoryReceiveModal
        isOpen={receiveOrder !== null}
        order={receiveOrder}
        orderItems={
          receiveOrder
            ? inventory.purchaseOrderItems.filter(
                (i) => i.purchaseOrderId === receiveOrder.id,
              )
            : []
        }
        products={products}
        supplierName={
          receiveOrder
            ? supplierMap.get(receiveOrder.supplierId)?.name || 'Fornecedor'
            : ''
        }
        onClose={() => setReceiveOrder(null)}
        onReceive={async (poId, items, notes, idempotencyKey) => {
          await onReceivePurchaseItems(poId, items, notes, idempotencyKey);
        }}
      />
    </div>
  );
}
