import { useEffect, useMemo, useState } from 'react';
import { Layers, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import {
  type ComboRecord,
  normalizePaymentMethod,
  PAYMENT_METHODS,
  type PaymentMethod,
  type ProductRecord,
  type SaleInput,
  type SaleOrderDraftItem,
  type SaleRecord,
} from '../types/finance';
import {
  buildSaleInputFromOrder,
  calculateSaleTotal,
  formatCurrencyBRL,
  getLocalTodayDate,
  roundCurrency,
} from '../utils/finance';

interface SaleModalProps {
  isOpen: boolean;
  editingSale: SaleRecord | null;
  defaultUnitPrice: number;
  establishmentName?: string;
  products: ProductRecord[];
  combos: ComboRecord[];
  onClose: () => void;
  onSubmit: (input: SaleInput, editingId?: string) => Promise<void>;
}

function buildDraftFromSale(sale: SaleRecord): SaleOrderDraftItem[] {
  if (sale.items && sale.items.length > 0) {
    return sale.items.map((item) => ({
      kind: item.kind,
      refId: item.refId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      estimatedUnitCost: item.estimatedUnitCost,
      components: item.components.map((c) => ({
        productId: c.productId,
        productName: c.productName,
        quantityPerUnit: c.quantityPerUnit,
        countsAsXSalada: c.countsAsXSalada,
      })),
    }));
  }

  return [
    {
      kind: 'product',
      refId: 'legacy-xsalada',
      name: 'X-Salada',
      quantity: Math.max(1, sale.quantity),
      unitPrice: sale.unitPrice,
      estimatedUnitCost: 0,
      components: [
        {
          productId: 'legacy-xsalada',
          productName: 'X-Salada',
          quantityPerUnit: 1,
          countsAsXSalada: true,
        },
      ],
    },
  ];
}

export function SaleModal({
  isOpen,
  editingSale,
  defaultUnitPrice,
  establishmentName = 'MGW Lanches',
  products,
  combos,
  onClose,
  onSubmit,
}: SaleModalProps) {
  const activeCombos = useMemo(() => combos.filter((c) => c.active), [combos]);
  const activeProducts = useMemo(() => {
    const active = products.filter((p) => p.active);
    const hasXSalada = active.some((p) => p.countsAsXSalada);
    if (hasXSalada) return active;

    const fallbackXSalada: ProductRecord = {
      id: 'default-xsalada',
      ownerId: '',
      name: 'X-Salada',
      category: 'Lanche',
      unitPrice: defaultUnitPrice,
      countsAsXSalada: true,
      active: true,
      createdAtMs: 0,
      updatedAtMs: 0,
    };
    return [fallbackXSalada, ...active];
  }, [products, defaultUnitPrice]);

  const [mode, setMode] = useState<'combo' | 'individual'>('combo');
  const [draftItems, setDraftItems] = useState<SaleOrderDraftItem[]>([]);
  const [date, setDate] = useState(getLocalTodayDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pix');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingSale) {
      setDate(editingSale.date);
      setPaymentMethod(normalizePaymentMethod(editingSale.paymentMethod));
      setNote(editingSale.note);
      setDraftItems(buildDraftFromSale(editingSale));
      if (editingSale.saleMode === 'individual') {
        setMode('individual');
      } else if (editingSale.saleMode === 'combo') {
        setMode('combo');
      } else {
        setMode(activeCombos.length > 0 ? 'combo' : 'individual');
      }
    } else {
      setDate(getLocalTodayDate());
      setPaymentMethod('Pix');
      setNote('');
      setDraftItems([]);
      setMode(activeCombos.length > 0 ? 'combo' : 'individual');
    }
    setError(null);
    setIsSaving(false);
    // Only reset modal state when opened or switching which sale is edited
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingSale]);

  if (!isOpen) return null;

  function addComboToCart(combo: ComboRecord) {
    setError(null);
    setDraftItems((prev) => {
      const idx = prev.findIndex((i) => i.kind === 'combo' && i.refId === combo.id);
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          kind: 'combo',
          refId: combo.id,
          name: combo.name,
          quantity: 1,
          unitPrice: combo.salePrice,
          estimatedUnitCost: combo.estimatedCost,
          components: combo.items.map((c) => ({
            productId: c.productId,
            productName: c.productName,
            quantityPerUnit: c.quantity,
            countsAsXSalada: c.countsAsXSalada,
          })),
        },
      ];
    });
  }

  function addProductToCart(product: ProductRecord) {
    setError(null);
    const effectivePrice =
      product.unitPrice > 0 ? product.unitPrice : defaultUnitPrice;
    setDraftItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.kind === 'product' && i.refId === product.id,
      );
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          kind: 'product',
          refId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: effectivePrice,
          estimatedUnitCost: 0,
          components: [
            {
              productId: product.id,
              productName: product.name,
              quantityPerUnit: 1,
              countsAsXSalada: product.countsAsXSalada,
            },
          ],
        },
      ];
    });
  }

  function updateItemQuantity(kind: 'combo' | 'product', refId: string, nextQty: number) {
    setError(null);
    setDraftItems((prev) => {
      if (nextQty <= 0) {
        return prev.filter((i) => !(i.kind === kind && i.refId === refId));
      }
      return prev.map((item) =>
        item.kind === kind && item.refId === refId
          ? { ...item, quantity: Math.trunc(nextQty) }
          : item,
      );
    });
  }

  function updateItemUnitPrice(kind: 'combo' | 'product', refId: string, rawVal: string) {
    const parsed = Number(rawVal.replace(',', '.'));
    setDraftItems((prev) =>
      prev.map((item) =>
        item.kind === kind && item.refId === refId
          ? {
              ...item,
              unitPrice: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
            }
          : item,
      ),
    );
  }

  const orderTotals = draftItems.reduce(
    (acc, item) => {
      const lineTotal = calculateSaleTotal(item.quantity, item.unitPrice);
      const xPerUnit = item.components.reduce(
        (sum, c) => (c.countsAsXSalada ? sum + c.quantityPerUnit : sum),
        0,
      );
      acc.totalAmount = roundCurrency(acc.totalAmount + lineTotal);
      acc.xSaladaCount += xPerUnit * item.quantity;
      if (item.kind === 'combo') acc.combosCount += item.quantity;
      return acc;
    },
    { totalAmount: 0, xSaladaCount: 0, combosCount: 0 },
  );

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Selecione uma data válida.');
      return;
    }
    if (draftItems.length === 0) {
      setError('Selecione pelo menos um combo ou produto para registrar a venda.');
      return;
    }
    if (draftItems.some((item) => item.unitPrice <= 0 || item.quantity < 1)) {
      setError('Todos os itens devem ter quantidade e valor unitário maiores que zero.');
      return;
    }

    let payload: SaleInput;
    try {
      payload = buildSaleInputFromOrder(
        draftItems,
        date,
        paymentMethod,
        note.trim(),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dados inválidos na venda.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSubmit(payload, editingSale?.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar a venda.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-modal-title"
    >
      <div className="w-full sm:max-w-2xl bg-[#12151C] border border-[#232834] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 max-h-[94vh] overflow-y-auto">
        <div className="w-10 h-1 bg-[#333A4A] rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 id="sale-modal-title" className="text-lg font-bold text-[#F3F4F6]">
              {editingSale ? 'Editar Venda' : 'Nova Venda Rápida'}
            </h2>
            <p className="text-xs text-[#9CA3AF]">
              Combine combos e produtos individuais no mesmo pedido · {establishmentName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de venda"
            className="min-w-[44px] min-h-[44px] rounded-xl border border-[#232834] hover:border-[#374151] flex items-center justify-center text-[#9CA3AF] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleFormSubmit(e)} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5]"
            >
              {error}
            </div>
          )}

          {/* Mode Tabs */}
          <div
            role="tablist"
            aria-label="Tipo de seleção de venda"
            className="grid grid-cols-2 p-1 bg-[#0B0D11] border border-[#232834] rounded-xl"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'combo'}
              onClick={() => setMode('combo')}
              className={`min-h-[42px] px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mode === 'combo'
                  ? 'bg-[#F5B731] text-[#0B0D11]'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              Venda por Combo
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'individual'}
              onClick={() => setMode('individual')}
              className={`min-h-[42px] px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mode === 'individual'
                  ? 'bg-[#F5B731] text-[#0B0D11]'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              Venda Individual
            </button>
          </div>

          {/* Combo Cards Picker */}
          {mode === 'combo' && (
            <div className="space-y-2.5">
              {activeCombos.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#0B0D11] border border-[#232834] text-center space-y-2">
                  <p className="text-xs text-[#D1D5DB]">
                    Nenhum combo ativo cadastrado ainda.
                  </p>
                  <p className="text-[11px] text-[#9CA3AF]">
                    Cadastre seus combos em <strong>Ajustes → Produtos e Combos</strong> ou use a aba{' '}
                    <button
                      type="button"
                      onClick={() => setMode('individual')}
                      className="text-[#F5B731] underline font-semibold cursor-pointer"
                    >
                      Venda Individual
                    </button>
                    .
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeCombos.map((combo) => {
                    const inCart = draftItems.find(
                      (i) => i.kind === 'combo' && i.refId === combo.id,
                    );
                    const comboDesc =
                      combo.description ||
                      combo.items
                        .map((i) => `${i.quantity} ${i.productName}`)
                        .join(' + ');
                    return (
                      <div
                        key={combo.id}
                        data-testid={`combo-card-${combo.id}`}
                        className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition-colors ${
                          inCart
                            ? 'bg-[#F5B731]/10 border-[#F5B731]/60'
                            : 'bg-[#0B0D11] border-[#232834]'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-bold text-[#F3F4F6]">
                              {combo.name}
                            </span>
                            <span className="text-sm font-bold text-[#F5B731] font-mono tabular-nums shrink-0">
                              {formatCurrencyBRL(combo.salePrice)}
                            </span>
                          </div>
                          <p className="text-xs text-[#9CA3AF] leading-snug">
                            {comboDesc}
                          </p>
                        </div>

                        {inCart ? (
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="text-xs font-semibold text-[#F5B731] font-mono tabular-nums">
                              Subtotal {formatCurrencyBRL(calculateSaleTotal(inCart.quantity, inCart.unitPrice))}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updateItemQuantity('combo', combo.id, inCart.quantity - 1)
                                }
                                aria-label={`Diminuir quantidade de ${combo.name}`}
                                className="w-9 h-9 rounded-lg border border-[#232834] bg-[#12151C] flex items-center justify-center text-[#F3F4F6] hover:border-[#F5B731] cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-7 text-center text-sm font-bold font-mono tabular-nums text-[#F3F4F6]">
                                {inCart.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateItemQuantity('combo', combo.id, inCart.quantity + 1)
                                }
                                aria-label={`Aumentar quantidade de ${combo.name}`}
                                className="w-9 h-9 rounded-lg bg-[#F5B731] text-[#0B0D11] flex items-center justify-center font-bold hover:bg-[#FCD34D] cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addComboToCart(combo)}
                            className="w-full min-h-[40px] px-3 rounded-lg bg-[#181C24] hover:bg-[#F5B731] text-[#F3F4F6] hover:text-[#0B0D11] border border-[#232834] hover:border-[#F5B731] text-xs font-bold transition-colors cursor-pointer"
                          >
                            Selecionar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Individual Products Picker */}
          {mode === 'individual' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {activeProducts.map((prod) => {
                const effectivePrice =
                  prod.unitPrice > 0 ? prod.unitPrice : defaultUnitPrice;
                const inCart = draftItems.find(
                  (i) => i.kind === 'product' && i.refId === prod.id,
                );
                return (
                  <div
                    key={prod.id}
                    data-testid={`product-card-${prod.id}`}
                    className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition-colors ${
                      inCart
                        ? 'bg-[#F5B731]/10 border-[#F5B731]/60'
                        : 'bg-[#0B0D11] border-[#232834]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#F3F4F6] truncate">
                          {prod.name}
                        </p>
                        <p className="text-[11px] text-[#9CA3AF]">
                          {prod.category}
                          {prod.countsAsXSalada ? ' · Conta como X-Salada' : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-[#F5B731] font-mono tabular-nums shrink-0">
                        {formatCurrencyBRL(effectivePrice)}
                      </span>
                    </div>

                    {inCart ? (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-xs font-semibold text-[#F5B731] font-mono tabular-nums">
                          {formatCurrencyBRL(calculateSaleTotal(inCart.quantity, inCart.unitPrice))}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateItemQuantity('product', prod.id, inCart.quantity - 1)
                            }
                            aria-label={`Diminuir quantidade de ${prod.name}`}
                            className="w-9 h-9 rounded-lg border border-[#232834] bg-[#12151C] flex items-center justify-center text-[#F3F4F6] hover:border-[#F5B731] cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold font-mono tabular-nums text-[#F3F4F6]">
                            {inCart.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateItemQuantity('product', prod.id, inCart.quantity + 1)
                            }
                            aria-label={`Aumentar quantidade de ${prod.name}`}
                            className="w-9 h-9 rounded-lg bg-[#F5B731] text-[#0B0D11] flex items-center justify-center font-bold hover:bg-[#FCD34D] cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addProductToCart(prod)}
                        className="w-full min-h-[40px] px-3 rounded-lg bg-[#181C24] hover:bg-[#F5B731] text-[#F3F4F6] hover:text-[#0B0D11] border border-[#232834] hover:border-[#F5B731] text-xs font-bold transition-colors cursor-pointer"
                      >
                        Selecionar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected Order Items & Live Totals */}
          <div className="rounded-xl bg-[#0B0D11] border border-[#232834] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#D1D5DB]">
                Itens do Pedido ({draftItems.length})
              </span>
              <span className="text-xs text-[#9CA3AF] font-mono tabular-nums">
                {orderTotals.xSaladaCount} X-Salada{orderTotals.xSaladaCount === 1 ? '' : 's'}
                {orderTotals.combosCount > 0
                  ? ` · ${orderTotals.combosCount} combo${orderTotals.combosCount === 1 ? '' : 's'}`
                  : ''}
              </span>
            </div>

            {draftItems.length === 0 ? (
              <p className="text-xs text-[#9CA3AF] py-1">
                Toque em <strong>Selecionar</strong> acima para adicionar combos ou itens individuais nesta venda.
              </p>
            ) : (
              <div className="divide-y divide-[#232834]">
                {draftItems.map((item) => (
                  <div
                    key={`${item.kind}:${item.refId}`}
                    className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-[#F3F4F6] truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-[#9CA3AF] font-mono tabular-nums">
                        {item.kind === 'combo' ? 'Combo' : 'Individual'} · Unit.{' '}
                        {formatCurrencyBRL(item.unitPrice)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2">
                      <div className="flex items-center gap-1.5">
                        <label
                          htmlFor={`qty-${item.kind}-${item.refId}`}
                          className="sr-only"
                        >
                          Quantidade de {item.name}
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            updateItemQuantity(item.kind, item.refId, item.quantity - 1)
                          }
                          aria-label={`Remover 1 ${item.name}`}
                          className="w-8 h-8 rounded-lg border border-[#232834] flex items-center justify-center text-[#D1D5DB] hover:border-[#F5B731] cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          id={`qty-${item.kind}-${item.refId}`}
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = Math.trunc(Number(e.target.value));
                            if (Number.isFinite(val) && val >= 1) {
                              updateItemQuantity(item.kind, item.refId, val);
                            }
                          }}
                          className="w-12 h-8 text-center rounded-lg bg-[#12151C] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-xs font-bold text-[#F3F4F6] font-mono tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateItemQuantity(item.kind, item.refId, item.quantity + 1)
                          }
                          aria-label={`Adicionar 1 ${item.name}`}
                          className="w-8 h-8 rounded-lg border border-[#232834] flex items-center justify-center text-[#D1D5DB] hover:border-[#F5B731] cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        aria-label={`Preço unitário de ${item.name}`}
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateItemUnitPrice(item.kind, item.refId, e.target.value)
                        }
                        className="w-20 h-8 px-2 rounded-lg bg-[#12151C] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-xs text-right text-[#F3F4F6] font-mono tabular-nums"
                      />

                      <span className="w-20 text-right text-xs font-bold text-[#F5B731] font-mono tabular-nums">
                        {formatCurrencyBRL(calculateSaleTotal(item.quantity, item.unitPrice))}
                      </span>

                      <button
                        type="button"
                        onClick={() => updateItemQuantity(item.kind, item.refId, 0)}
                        aria-label={`Excluir ${item.name} do pedido`}
                        className="w-8 h-8 rounded-lg border border-[#232834] flex items-center justify-center text-[#9CA3AF] hover:text-[#EF4444] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2.5 border-t border-[#232834] flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-[#D1D5DB]">
                Valor total da venda
              </span>
              <span
                data-testid="sale-computed-total"
                className="text-lg font-bold text-[#F5B731] font-mono tabular-nums"
              >
                {formatCurrencyBRL(orderTotals.totalAmount)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="sale-date"
                className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
              >
                Data da venda
              </label>
              <input
                id="sale-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="sale-payment"
                className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
              >
                Forma de pagamento
              </label>
              <select
                id="sale-payment"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="sale-note"
              className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
            >
              Observação (opcional)
            </label>
            <input
              id="sale-note"
              type="text"
              maxLength={240}
              placeholder="Ex.: Pedido balcão, entrega centro..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] placeholder:text-[#6B7280]"
            />
          </div>

          <div className="sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 py-3 bg-[#12151C]/95 backdrop-blur-xs border-t border-[#232834] flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[46px] px-4 rounded-xl border border-[#232834] hover:border-[#374151] text-sm font-medium text-[#D1D5DB] cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || draftItems.length === 0}
              className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold cursor-pointer transition-colors disabled:opacity-60"
            >
              {isSaving
                ? 'Salvando...'
                : editingSale
                  ? 'Salvar Alterações'
                  : 'Registrar Venda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
