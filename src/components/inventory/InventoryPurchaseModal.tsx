import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PackageCheck, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import type {
  CreatePurchaseOrderInput,
  InventoryPackagingConversionRecord,
  ProductRecord,
  PurchaseOrderItemInput,
  PurchaseOrderItemRecord,
  PurchaseOrderRecord,
  ReceivePurchaseItemInput,
  SupplierRecord,
} from '../../types/finance';
import { formatCurrencyBRL } from '../../utils/finance';
import {
  buildProductConversionOptions,
  calculatePurchaseOrderTotals,
  computeRemainingPurchaseItemQuantities,
  createInventoryIdempotencyKey,
  formatStockQty,
} from '../../utils/inventory';

interface DraftPoLine {
  key: string;
  productId: string;
  optionId: string;
  orderedQty: string;
  unitCost: string;
}

interface InventoryPurchaseCreateModalProps {
  isOpen: boolean;
  products: ProductRecord[];
  conversions: InventoryPackagingConversionRecord[];
  suppliers: SupplierRecord[];
  onClose: () => void;
  onCreate: (input: CreatePurchaseOrderInput) => Promise<void>;
}

export function InventoryPurchaseCreateModal({
  isOpen,
  products,
  conversions,
  suppliers,
  onClose,
  onCreate,
}: InventoryPurchaseCreateModalProps) {
  const [supplierId, setSupplierId] = useState('');
  const [initialStatus, setInitialStatus] = useState<'pending' | 'draft'>('pending');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [additionalExpenses, setAdditionalExpenses] = useState('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftPoLine[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.active),
    [suppliers],
  );
  const activeProducts = useMemo(
    () =>
      [...products]
        .filter((p) => p.active)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [products],
  );

  useEffect(() => {
    if (!isOpen) return;
    setSupplierId(activeSuppliers[0]?.id || '');
    setInitialStatus('pending');
    setPaymentTerms('');
    setExpectedDate('');
    setDiscountAmount('0');
    setAdditionalExpenses('0');
    setNotes('');
    setIdempotencyKey(createInventoryIdempotencyKey('po'));
    setError(null);
    if (activeProducts[0]) {
      const opts = buildProductConversionOptions(activeProducts[0], conversions);
      const preferred = opts.find((o) => o.isDefaultPurchase) || opts[0];
      setLines([
        {
          key: `line_${Date.now()}`,
          productId: activeProducts[0].id,
          optionId: preferred?.id || '',
          orderedQty: '1',
          unitCost: String(
            ((activeProducts[0].costPrice || 0) * (preferred?.factorToBase || 1)).toFixed(2),
          ),
        },
      ]);
    } else {
      setLines([]);
    }
  }, [isOpen, activeSuppliers, activeProducts, conversions]);

  if (!isOpen) return null;

  function addLine() {
    const prod = activeProducts[0];
    if (!prod) return;
    const opts = buildProductConversionOptions(prod, conversions);
    const preferred = opts.find((o) => o.isDefaultPurchase) || opts[0];
    setLines((prev) => [
      ...prev,
      {
        key: `line_${Date.now()}_${prev.length}`,
        productId: prod.id,
        optionId: preferred?.id || '',
        orderedQty: '1',
        unitCost: String(((prod.costPrice || 0) * (preferred?.factorToBase || 1)).toFixed(2)),
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<DraftPoLine>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.productId && patch.productId !== line.productId) {
          const prod = activeProducts.find((p) => p.id === patch.productId);
          if (prod) {
            const opts = buildProductConversionOptions(prod, conversions);
            const preferred = opts.find((o) => o.isDefaultPurchase) || opts[0];
            next.optionId = preferred?.id || '';
            next.unitCost = String(
              ((prod.costPrice || 0) * (preferred?.factorToBase || 1)).toFixed(2),
            );
          }
        }
        return next;
      }),
    );
  }

  const parsedItems = lines.map((line) => {
    const prod = activeProducts.find((p) => p.id === line.productId);
    const opts = prod ? buildProductConversionOptions(prod, conversions) : [];
    const opt = opts.find((o) => o.id === line.optionId) || opts[0];
    const qty = Math.max(0, Number(line.orderedQty.replace(',', '.')) || 0);
    const cost = Math.max(0, Number(line.unitCost.replace(',', '.')) || 0);
    return { line, prod, opt, qty, cost };
  });

  const totals = calculatePurchaseOrderTotals({
    items: parsedItems.map((p) => ({ orderedQty: p.qty, unitCost: p.cost })),
    discountAmount: Number(discountAmount.replace(',', '.')) || 0,
    additionalExpenses: Number(additionalExpenses.replace(',', '.')) || 0,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      setError('Cadastre e selecione um fornecedor antes de lançar a compra.');
      return;
    }
    const items: PurchaseOrderItemInput[] = [];
    for (const row of parsedItems) {
      if (!row.prod || row.qty <= 0) continue;
      items.push({
        productId: row.prod.id,
        packagingConversionId: row.opt?.packagingConversionId ?? null,
        unitLabel: row.opt?.unitLabel || row.prod.saleUnit || 'unidade',
        conversionFactor: row.opt?.factorToBase || 1,
        orderedQty: row.qty,
        unitCost: row.cost,
      });
    }
    if (items.length === 0) {
      setError('Inclua ao menos um item com quantidade maior que zero.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        supplierId,
        status: initialStatus,
        paymentTerms: paymentTerms.trim(),
        expectedDeliveryDate: expectedDate || null,
        discountAmount: totals.discountAmount,
        additionalExpenses: totals.additionalExpenses,
        notes: notes.trim(),
        items,
        idempotencyKey,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar pedido de compra.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="po-create-modal-title"
    >
      <div className="bg-white border border-[#E8EAF0] rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FFFBEB] border border-[#F5B900]/40 text-[#B38300] flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="po-create-modal-title"
                className="text-base font-bold text-[#172033]"
              >
                Novo Pedido de Compra
              </h2>
              <p className="text-xs text-[#778094]">
                O saldo do estoque só é alterado quando o recebimento for confirmado
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] text-[#778094] hover:text-[#172033] flex items-center justify-center cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs text-[#E35D62] font-medium"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Fornecedor
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="mgw-input"
                required
              >
                {activeSuppliers.length === 0 && (
                  <option value="">Nenhum fornecedor ativo cadastrado</option>
                )}
                {activeSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Status inicial
              </label>
              <select
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as 'pending' | 'draft')}
                className="mgw-input"
              >
                <option value="pending">Pendente (aguardando entrega)</option>
                <option value="draft">Rascunho</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Previsão de entrega
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="mgw-input"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
                Itens da Compra
              </h3>
              <button
                type="button"
                onClick={addLine}
                className="mgw-btn-secondary min-h-[34px] px-3 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar item
              </button>
            </div>

            <div className="space-y-2.5">
              {parsedItems.map(({ line, prod, opt, qty, cost }) => {
                const opts = prod
                  ? buildProductConversionOptions(prod, conversions)
                  : [];
                const baseTotal = qty * (opt?.factorToBase || 1);
                return (
                  <div
                    key={line.key}
                    className="rounded-xl border border-[#E8EAF0] bg-[#F5F6FA] p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                  >
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Produto
                      </label>
                      <select
                        value={line.productId}
                        onChange={(e) =>
                          updateLine(line.key, { productId: e.target.value })
                        }
                        className="mgw-input bg-white"
                      >
                        {activeProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Embalagem
                      </label>
                      <select
                        value={line.optionId}
                        onChange={(e) =>
                          updateLine(line.key, { optionId: e.target.value })
                        }
                        className="mgw-input bg-white"
                      >
                        {opts.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Qtd ({opt?.unitLabel || 'un'})
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={line.orderedQty}
                        onChange={(e) =>
                          updateLine(line.key, { orderedQty: e.target.value })
                        }
                        className="mgw-input bg-white tabular-nums"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Custo / {opt?.unitLabel || 'un'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.unitCost}
                        onChange={(e) =>
                          updateLine(line.key, { unitCost: e.target.value })
                        }
                        className="mgw-input bg-white tabular-nums"
                      />
                    </div>

                    <div className="sm:col-span-1 flex items-center justify-end">
                      <button
                        type="button"
                        disabled={lines.length <= 1}
                        onClick={() =>
                          setLines((prev) => prev.filter((l) => l.key !== line.key))
                        }
                        className="w-9 h-9 rounded-lg border border-[#E8EAF0] bg-white text-[#778094] hover:text-[#E35D62] disabled:opacity-40 flex items-center justify-center cursor-pointer"
                        aria-label="Remover item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {prod && (
                      <div className="sm:col-span-12 flex items-center justify-between text-[11px] text-[#778094] pt-1 border-t border-[#E8EAF0]/70 tabular-nums">
                        <span>
                          Equivalente:{' '}
                          <strong className="text-[#172033]">
                            {formatStockQty(baseTotal, prod.saleUnit || 'un')}
                          </strong>
                        </span>
                        <span>
                          Subtotal linha:{' '}
                          <strong className="text-[#172033]">
                            {formatCurrencyBRL(qty * cost)}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Condição de pagamento
              </label>
              <input
                type="text"
                maxLength={120}
                placeholder="Ex.: Pix na entrega, 14 dias..."
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="mgw-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Desconto (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="mgw-input tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Frete / despesas adicionais (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={additionalExpenses}
                onChange={(e) => setAdditionalExpenses(e.target.value)}
                className="mgw-input tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#172033] mb-1.5">
              Observações do pedido (opcional)
            </label>
            <textarea
              rows={2}
              maxLength={600}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mgw-input resize-none"
            />
          </div>

          <div className="rounded-xl bg-[#F5F6FA] border border-[#E8EAF0] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-x-4 text-[#778094] tabular-nums">
              <span>Itens: {formatCurrencyBRL(totals.itemsSubtotal)}</span>
              {totals.discountAmount > 0 && (
                <span>Desconto: -{formatCurrencyBRL(totals.discountAmount)}</span>
              )}
              {totals.additionalExpenses > 0 && (
                <span>Despesas: +{formatCurrencyBRL(totals.additionalExpenses)}</span>
              )}
            </div>
            <div className="text-sm font-bold text-[#172033] tabular-nums">
              Total do Pedido: {formatCurrencyBRL(totals.totalAmount)}
            </div>
          </div>

          <div className="pt-2 border-t border-[#E8EAF0] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="mgw-btn-secondary min-h-[42px] px-4 cursor-pointer"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !supplierId}
              className="mgw-btn-primary min-h-[42px] px-5 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Criar Pedido de Compra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface InventoryReceiveModalProps {
  isOpen: boolean;
  order: PurchaseOrderRecord | null;
  orderItems: PurchaseOrderItemRecord[];
  products: ProductRecord[];
  supplierName: string;
  onClose: () => void;
  onReceive: (
    purchaseOrderId: string,
    items: ReceivePurchaseItemInput[],
    notes: string,
    idempotencyKey: string,
  ) => Promise<void>;
}

export function InventoryReceiveModal({
  isOpen,
  order,
  orderItems,
  products,
  supplierName,
  onClose,
  onReceive,
}: InventoryReceiveModalProps) {
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  useEffect(() => {
    if (!isOpen || !order) return;
    const initQty: Record<string, string> = {};
    const initCost: Record<string, string> = {};
    for (const item of orderItems) {
      const rem = computeRemainingPurchaseItemQuantities(item);
      initQty[item.id] = rem.isFullyReceived ? '0' : String(rem.remainingInputQty);
      initCost[item.id] = String(item.unitCost.toFixed(2));
    }
    setQtyInputs(initQty);
    setCostInputs(initCost);
    setNotes('');
    setIdempotencyKey(createInventoryIdempotencyKey('rec'));
    setError(null);
  }, [isOpen, order, orderItems]);

  if (!isOpen || !order) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!order) return;
    const payload: ReceivePurchaseItemInput[] = [];
    for (const item of orderItems) {
      const rem = computeRemainingPurchaseItemQuantities(item);
      if (rem.isFullyReceived) continue;
      const qty = Number((qtyInputs[item.id] || '0').replace(',', '.'));
      if (!Number.isFinite(qty) || qty < 0) {
        setError('Informe quantidades válidas maiores ou iguais a zero.');
        return;
      }
      if (qty > rem.remainingInputQty + 0.001) {
        setError('Quantidade recebida não pode exceder o saldo restante do pedido.');
        return;
      }
      if (qty > 0) {
        const unitCost = Number((costInputs[item.id] || '0').replace(',', '.'));
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          setError('Informe um custo unitário válido.');
          return;
        }
        payload.push({
          purchaseOrderItemId: item.id,
          receivedQty: qty,
          unitCost,
        });
      }
    }

    if (payload.length === 0) {
      setError('Informe ao menos um item com quantidade maior que zero para receber.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onReceive(order.id, payload, notes.trim(), idempotencyKey);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar recebimento.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="po-receive-modal-title"
    >
      <div className="bg-white border border-[#E8EAF0] rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#ECFDF5] text-[#16A36A] flex items-center justify-center shrink-0">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="po-receive-modal-title"
                className="text-base font-bold text-[#172033] truncate"
              >
                Receber Mercadorias · Compra #{order.orderNumber}
              </h2>
              <p className="text-xs text-[#778094] truncate">
                {supplierName} · Permite recebimento parcial ou integral
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] text-[#778094] hover:text-[#172033] flex items-center justify-center cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs text-[#E35D62] font-medium"
            >
              {error}
            </div>
          )}

          <div className="space-y-3">
            {orderItems.map((item) => {
              const prod = productMap.get(item.productId);
              const rem = computeRemainingPurchaseItemQuantities(item);
              const baseUnit = prod?.saleUnit || 'un';
              const nowQty = Number((qtyInputs[item.id] || '0').replace(',', '.')) || 0;
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#E8EAF0] bg-[#F5F6FA] p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-[#172033]">
                        {prod?.name || 'Produto'}
                      </p>
                      <p className="text-[11px] text-[#778094] tabular-nums">
                        Pedido: {item.orderedQty} {item.unitLabel} (
                        {formatStockQty(item.orderedBaseQty, baseUnit)}) · Já recebido:{' '}
                        {formatStockQty(item.receivedBaseQty, baseUnit)}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-[#172033] tabular-nums">
                      Restante: {rem.remainingInputQty} {item.unitLabel}
                    </span>
                  </div>

                  {!rem.isFullyReceived ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                          Qtd recebida agora ({item.unitLabel})
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          max={rem.remainingInputQty}
                          value={qtyInputs[item.id] ?? '0'}
                          onChange={(e) =>
                            setQtyInputs((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="mgw-input bg-white tabular-nums"
                        />
                        <p className="mt-1 text-[11px] text-[#778094] tabular-nums">
                          Entrará no estoque:{' '}
                          <strong className="text-[#16A36A]">
                            +{formatStockQty(nowQty * item.conversionFactor, baseUnit)}
                          </strong>
                        </p>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                          Custo unitário / {item.unitLabel} (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={costInputs[item.id] ?? '0'}
                          onChange={(e) =>
                            setCostInputs((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="mgw-input bg-white tabular-nums"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] font-semibold text-[#16A36A]">
                      Item já recebido integralmente.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#172033] mb-1.5">
              Observações do recebimento / conferência (opcional)
            </label>
            <textarea
              rows={2}
              maxLength={500}
              placeholder="Ex.: Recebido 6 caixas; restante previsto para sexta-feira..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mgw-input resize-none"
            />
          </div>

          <div className="pt-2 border-t border-[#E8EAF0] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="mgw-btn-secondary min-h-[42px] px-4 cursor-pointer"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="mgw-btn-primary min-h-[42px] px-5 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Processando entrada...' : 'Confirmar Recebimento no Estoque'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
