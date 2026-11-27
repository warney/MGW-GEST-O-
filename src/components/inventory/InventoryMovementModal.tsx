import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import type {
  InventoryBalanceRecord,
  InventoryMovementType,
  InventoryPackagingConversionRecord,
  ProductRecord,
  RecordInventoryMovementInput,
  SupplierRecord,
} from '../../types/finance';
import { formatCurrencyBRL } from '../../utils/finance';
import {
  buildProductConversionOptions,
  computeWeightedAverageCost,
  convertPackagingQuantity,
  createInventoryIdempotencyKey,
  formatStockQty,
  getMovementDirection,
  MOVEMENT_TYPE_LABELS,
  validateMovementQuantityAndStockGuard,
} from '../../utils/inventory';

interface InventoryMovementModalProps {
  isOpen: boolean;
  mode: 'in' | 'out';
  initialProductId?: string;
  products: ProductRecord[];
  balances: InventoryBalanceRecord[];
  conversions: InventoryPackagingConversionRecord[];
  suppliers: SupplierRecord[];
  onClose: () => void;
  onSubmit: (input: RecordInventoryMovementInput) => Promise<void>;
}

const INBOUND_TYPES: Array<{ value: Exclude<InventoryMovementType, 'purchase_receipt' | 'inventory_adjustment'>; label: string }> = [
  { value: 'manual_entry', label: 'Entrada manual' },
  { value: 'return_in', label: 'Devolução / Retorno ao estoque' },
  { value: 'adjustment_in', label: 'Ajuste positivo manual' },
];

const OUTBOUND_TYPES: Array<{ value: Exclude<InventoryMovementType, 'purchase_receipt' | 'inventory_adjustment'>; label: string }> = [
  { value: 'manual_exit', label: 'Saída manual' },
  { value: 'loss', label: 'Perda operacional' },
  { value: 'damage', label: 'Quebra / Avaria' },
  { value: 'expiry', label: 'Vencimento / Descarte' },
  { value: 'internal_consumption', label: 'Consumo interno' },
  { value: 'adjustment_out', label: 'Ajuste negativo manual' },
];

export function InventoryMovementModal({
  isOpen,
  mode,
  initialProductId,
  products,
  balances,
  conversions,
  suppliers,
  onClose,
  onSubmit,
}: InventoryMovementModalProps) {
  const [productId, setProductId] = useState('');
  const [movementType, setMovementType] = useState<
    Exclude<InventoryMovementType, 'purchase_receipt' | 'inventory_adjustment'>
  >(mode === 'in' ? 'manual_entry' : 'manual_exit');
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [totalCostInput, setTotalCostInput] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [allowNegativeOverride, setAllowNegativeOverride] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProducts = useMemo(
    () =>
      [...products].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name, 'pt-BR');
      }),
    [products],
  );

  useEffect(() => {
    if (!isOpen) return;
    const defaultProdId =
      initialProductId ||
      activeProducts[0]?.id ||
      '';
    setProductId(defaultProdId);
    setMovementType(mode === 'in' ? 'manual_entry' : 'manual_exit');
    setQuantity('1');
    setTotalCostInput('');
    setSupplierId('');
    setReason('');
    setNotes('');
    setAllowNegativeOverride(false);
    setIdempotencyKey(createInventoryIdempotencyKey('mov'));
    setError(null);
  }, [isOpen, mode, initialProductId, activeProducts]);

  const selectedProduct = useMemo(
    () => activeProducts.find((p) => p.id === productId) ?? null,
    [activeProducts, productId],
  );

  const selectedBalance = useMemo(
    () => balances.find((b) => b.productId === productId) ?? null,
    [balances, productId],
  );

  const conversionOptions = useMemo(() => {
    if (!selectedProduct) return [];
    return buildProductConversionOptions(selectedProduct, conversions);
  }, [selectedProduct, conversions]);

  useEffect(() => {
    if (!conversionOptions.length) {
      setSelectedOptionId('');
      return;
    }
    const stillValid = conversionOptions.some((o) => o.id === selectedOptionId);
    if (!stillValid) {
      setSelectedOptionId(conversionOptions[0].id);
    }
  }, [conversionOptions, selectedOptionId]);

  const activeOption = useMemo(
    () =>
      conversionOptions.find((o) => o.id === selectedOptionId) ??
      conversionOptions[0] ??
      null,
    [conversionOptions, selectedOptionId],
  );

  if (!isOpen) return null;

  const parsedQty = Number(quantity.replace(',', '.'));
  const parsedCost =
    totalCostInput.trim() !== ''
      ? Number(totalCostInput.replace(',', '.'))
      : null;

  const factor = activeOption?.factorToBase ?? 1;
  const availableQty = selectedBalance?.availableQty ?? 0;
  const currentAvgCost =
    selectedBalance?.averageUnitCost ?? selectedProduct?.costPrice ?? 0;
  const allowNegConfig = selectedBalance?.allowNegativeStock ?? false;

  let previewBaseQty = 0;
  let previewUnitCost = 0;
  let previewNewAvgCost = currentAvgCost;
  let stockGuardResult: { allowed: boolean; nextBalance: number; message?: string } = {
    allowed: true,
    nextBalance: availableQty,
  };

  if (selectedProduct && Number.isFinite(parsedQty) && parsedQty > 0) {
    try {
      const conv = convertPackagingQuantity({
        inputQuantity: parsedQty,
        conversionFactor: factor,
        inputUnitTotalCost: parsedCost,
      });
      previewBaseQty = conv.baseQuantity;
      previewUnitCost = conv.baseUnitCost;
      const dir = getMovementDirection(movementType);
      stockGuardResult = validateMovementQuantityAndStockGuard({
        direction: dir,
        currentAvailableQty: availableQty,
        baseQuantity: previewBaseQty,
        allowNegativeStock: allowNegConfig,
        allowNegativeOverride,
        productName: selectedProduct.name,
      });
      if (dir === 'in' && parsedCost !== null && Number.isFinite(parsedCost) && parsedCost >= 0) {
        previewNewAvgCost = computeWeightedAverageCost({
          currentQty: availableQty,
          currentAvgCost,
          entryBaseQty: previewBaseQty,
          entryTotalCost: conv.totalCost,
        }).newAverageUnitCost;
      }
    } catch {
      previewBaseQty = 0;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedProduct) {
      setError('Selecione um produto.');
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setError('Informe uma quantidade válida maior que zero.');
      return;
    }
    if (
      parsedCost !== null &&
      (!Number.isFinite(parsedCost) || parsedCost < 0)
    ) {
      setError('Informe um custo total válido maior ou igual a zero.');
      return;
    }
    if (!stockGuardResult.allowed) {
      setError(stockGuardResult.message || 'Movimentação bloqueada por saldo insuficiente.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        productId: selectedProduct.id,
        movementType,
        inputQuantity: parsedQty,
        inputUnit: activeOption?.unitLabel || selectedProduct.saleUnit || 'unidade',
        conversionFactor: factor,
        packagingConversionId: activeOption?.packagingConversionId ?? null,
        totalCost:
          mode === 'in' && parsedCost !== null && Number.isFinite(parsedCost)
            ? parsedCost
            : null,
        supplierId: mode === 'in' && supplierId ? supplierId : null,
        reason: reason.trim() || MOVEMENT_TYPE_LABELS[movementType],
        notes: notes.trim(),
        idempotencyKey,
        allowNegativeOverride: mode === 'out' ? allowNegativeOverride : false,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a movimentação.');
    } finally {
      setSubmitting(false);
    }
  }

  const typeOptions = mode === 'in' ? INBOUND_TYPES : OUTBOUND_TYPES;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inv-mov-modal-title"
    >
      <div className="bg-white border border-[#E8EAF0] rounded-2xl w-full max-w-xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                mode === 'in'
                  ? 'bg-[#ECFDF5] text-[#16A36A]'
                  : 'bg-[#FEF2F2] text-[#E35D62]'
              }`}
            >
              {mode === 'in' ? (
                <ArrowUpCircle className="w-5 h-5" />
              ) : (
                <ArrowDownCircle className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="inv-mov-modal-title"
                className="text-base font-bold text-[#172033] truncate"
              >
                {mode === 'in' ? 'Registrar Entrada de Estoque' : 'Registrar Saída / Perda / Ajuste'}
              </h2>
              <p className="text-xs text-[#778094] truncate">
                Operação atômica com gravação imutável no histórico
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Produto
              </label>
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setAllowNegativeOverride(false);
                }}
                className="mgw-input"
                required
              >
                {activeProducts.length === 0 && (
                  <option value="">Nenhum produto cadastrado</option>
                )}
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.internalCode ? `(${p.internalCode})` : ''} {!p.active ? '· Inativo' : ''}
                  </option>
                ))}
              </select>
              {selectedProduct && (
                <p className="mt-1 text-[11px] text-[#778094] tabular-nums">
                  Saldo atual:{' '}
                  <strong className="text-[#172033]">
                    {formatStockQty(availableQty, selectedProduct.saleUnit || 'un')}
                  </strong>{' '}
                  · Custo médio atual:{' '}
                  <strong className="text-[#172033]">
                    {formatCurrencyBRL(currentAvgCost)}
                  </strong>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Tipo de movimentação
              </label>
              <select
                value={movementType}
                onChange={(e) =>
                  setMovementType(
                    e.target.value as Exclude<
                      InventoryMovementType,
                      'purchase_receipt' | 'inventory_adjustment'
                    >,
                  )
                }
                className="mgw-input"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Unidade / Embalagem
              </label>
              <select
                value={selectedOptionId}
                onChange={(e) => setSelectedOptionId(e.target.value)}
                className="mgw-input"
              >
                {conversionOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Quantidade ({activeOption?.unitLabel || 'unidade'})
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mgw-input tabular-nums"
                required
              />
            </div>

            {mode === 'in' && (
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                  Custo total da entrada (R$) — opcional
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ex.: 120.00"
                  value={totalCostInput}
                  onChange={(e) => setTotalCostInput(e.target.value)}
                  className="mgw-input tabular-nums"
                />
              </div>
            )}

            {mode === 'in' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                  Fornecedor (opcional)
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="mgw-input"
                >
                  <option value="">Sem fornecedor vinculado</option>
                  {suppliers
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Motivo / Referência
              </label>
              <input
                type="text"
                maxLength={240}
                placeholder={
                  mode === 'in'
                    ? 'Ex.: Reposição direta no balcão, nota avulsa...'
                    : 'Ex.: Garrafa quebrada na reposição, consumo equipe...'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mgw-input"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Observações internas (opcional)
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mgw-input resize-none"
              />
            </div>
          </div>

          {selectedProduct && previewBaseQty > 0 && (
            <div className="rounded-xl bg-[#F5F6FA] border border-[#E8EAF0] p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#778094]">Conversão para unidade base</span>
                <span className="font-semibold text-[#172033] tabular-nums">
                  {parsedQty} × {factor} ={' '}
                  {formatStockQty(previewBaseQty, selectedProduct.saleUnit || 'un')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#778094]">Saldo projetado após operação</span>
                <span
                  className={`font-bold tabular-nums ${
                    stockGuardResult.nextBalance < 0
                      ? 'text-[#E35D62]'
                      : 'text-[#172033]'
                  }`}
                >
                  {formatStockQty(
                    stockGuardResult.nextBalance,
                    selectedProduct.saleUnit || 'un',
                  )}
                </span>
              </div>
              {mode === 'in' && parsedCost !== null && parsedCost >= 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#778094]">
                    Custo unitário base / Novo custo médio
                  </span>
                  <span className="font-semibold text-[#172033] tabular-nums">
                    {formatCurrencyBRL(previewUnitCost)} →{' '}
                    {formatCurrencyBRL(previewNewAvgCost)}
                  </span>
                </div>
              )}
            </div>
          )}

          {mode === 'out' &&
            previewBaseQty > 0 &&
            availableQty - previewBaseQty < 0 && (
              <div className="rounded-xl border border-[#FCD34D] bg-[#FFFBEB] p-3 text-xs text-[#92400E] space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
                  <div>
                    <p className="font-semibold">
                      Esta saída deixará o estoque negativo (
                      {formatStockQty(availableQty - previewBaseQty)}).
                    </p>
                    {!allowNegConfig ? (
                      <p className="mt-0.5 text-[11px]">
                        Este produto está bloqueado para saldo negativo. Ajuste o saldo antes ou habilite exceção nas configurações do produto.
                      </p>
                    ) : (
                      <label className="mt-2 flex items-center gap-2 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowNegativeOverride}
                          onChange={(e) => setAllowNegativeOverride(e.target.checked)}
                          className="rounded border-[#D97706]"
                        />
                        Confirmar exceção de saldo negativo permitida neste item
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}

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
              disabled={submitting || !selectedProduct || !stockGuardResult.allowed}
              className="mgw-btn-primary min-h-[42px] px-5 cursor-pointer disabled:opacity-50"
            >
              {submitting
                ? 'Registrando...'
                : mode === 'in'
                  ? 'Confirmar Entrada'
                  : 'Confirmar Saída'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
