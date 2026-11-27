import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardCheck, Plus, Save, XCircle } from 'lucide-react';
import type {
  InventoryCountItemRecord,
  InventoryCountRecord,
  ProductRecord,
} from '../../types/finance';
import { formatCurrencyBRL } from '../../utils/finance';
import {
  formatStockQty,
  roundQty,
  summarizeInventoryCountItems,
} from '../../utils/inventory';

interface InventoryCountsTabProps {
  counts: InventoryCountRecord[];
  countItems: InventoryCountItemRecord[];
  products: ProductRecord[];
  canWrite: boolean;
  onStartCount: (
    title: string,
    productIds: string[] | null,
    notes: string,
  ) => Promise<string>;
  onSaveCountItems: (
    countId: string,
    items: Array<{ countItemId: string; countedQty: number | null; notes?: string }>,
  ) => Promise<void>;
  onFinalizeCount: (countId: string) => Promise<void>;
  onCancelCount: (countId: string) => Promise<void>;
}

const COUNT_STATUS_LABEL: Record<InventoryCountRecord['status'], string> = {
  open: 'Em contagem',
  finalized: 'Finalizado',
  cancelled: 'Cancelado',
};

export function InventoryCountsTab({
  counts,
  countItems,
  products,
  canWrite,
  onStartCount,
  onSaveCountItems,
  onFinalizeCount,
  onCancelCount,
}: InventoryCountsTabProps) {
  const [selectedCountId, setSelectedCountId] = useState<string | null>(
    counts[0]?.id ?? null,
  );
  const [startOpen, setStartOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [scopeMode, setScopeMode] = useState<'all' | 'selected'>('all');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});
  const [savingDraft, setSavingDraft] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const activeProducts = useMemo(
    () => products.filter((p) => p.active),
    [products],
  );

  const activeCount = useMemo(
    () => counts.find((c) => c.id === selectedCountId) ?? counts[0] ?? null,
    [counts, selectedCountId],
  );

  const activeItems = useMemo(() => {
    if (!activeCount) return [];
    return countItems
      .filter((i) => i.countId === activeCount.id)
      .sort((a, b) => {
        const na = productMap.get(a.productId)?.name || '';
        const nb = productMap.get(b.productId)?.name || '';
        return na.localeCompare(nb, 'pt-BR');
      });
  }, [activeCount, countItems, productMap]);

  useEffect(() => {
    if (!activeCount) return;
    const init: Record<string, string> = {};
    for (const item of activeItems) {
      init[item.id] =
        item.countedQty !== null && item.countedQty !== undefined
          ? String(item.countedQty)
          : '';
    }
    setDraftCounts(init);
    setError(null);
  }, [activeCount?.id, activeItems.length]);

  async function handleCreateCount(e: FormEvent) {
    e.preventDefault();
    if (newTitle.trim().length < 2) {
      setError('Informe um título para a contagem.');
      return;
    }
    if (scopeMode === 'selected' && selectedProductIds.length === 0) {
      setError('Selecione ao menos um produto para o inventário parcial.');
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const id = await onStartCount(
        newTitle.trim(),
        scopeMode === 'all' ? null : selectedProductIds,
        newNotes.trim(),
      );
      setSelectedCountId(id);
      setStartOpen(false);
      setNewTitle('');
      setNewNotes('');
      setSelectedProductIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar inventário.');
    } finally {
      setStarting(false);
    }
  }

  function buildUpdatesPayload() {
    return activeItems.map((item) => {
      const raw = (draftCounts[item.id] ?? '').trim();
      if (!raw) {
        return { countItemId: item.id, countedQty: null };
      }
      const parsed = Number(raw.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Quantidade contada inválida em um dos itens.');
      }
      return { countItemId: item.id, countedQty: roundQty(parsed) };
    });
  }

  async function handleSaveProgress() {
    if (!activeCount) return;
    setSavingDraft(true);
    setError(null);
    try {
      const updates = buildUpdatesPayload();
      await onSaveCountItems(activeCount.id, updates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar contagens.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleFinalize() {
    if (!activeCount) return;
    setFinalizing(true);
    setError(null);
    try {
      const updates = buildUpdatesPayload();
      const hasAnyCounted = updates.some((u) => u.countedQty !== null);
      if (!hasAnyCounted) {
        throw new Error('Preencha ao menos uma quantidade contada antes de finalizar.');
      }
      await onSaveCountItems(activeCount.id, updates);
      await onFinalizeCount(activeCount.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar inventário.');
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#172033]">
            Inventários Físicos e Contagens Cíclicas
          </h3>
          <p className="text-xs text-[#778094]">
            Compare o saldo do sistema com a prateleira e gere ajustes automáticos auditados ao finalizar.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStartOpen((v) => !v);
            }}
            className="mgw-btn-primary min-h-[42px] px-4 flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Iniciar Novo Inventário
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#E35D62] font-medium"
        >
          {error}
        </div>
      )}

      {startOpen && canWrite && (
        <form
          onSubmit={handleCreateCount}
          className="mgw-card p-5 space-y-4 border-[#F5B900]/50"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Título do inventário *
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex.: Conferência Geral Geladeiras"
                className="mgw-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                Escopo de produtos
              </label>
              <select
                value={scopeMode}
                onChange={(e) =>
                  setScopeMode(e.target.value as 'all' | 'selected')
                }
                className="mgw-input"
              >
                <option value="all">
                  Todos os produtos ativos ({activeProducts.length})
                </option>
                <option value="selected">Selecionar produtos específicos</option>
              </select>
            </div>
          </div>

          {scopeMode === 'selected' && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-[#E8EAF0] bg-[#F5F6FA] p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeProducts.map((p) => {
                const checked = selectedProductIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 text-xs text-[#172033] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setSelectedProductIds((prev) =>
                          e.target.checked
                            ? [...prev, p.id]
                            : prev.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#172033] mb-1.5">
              Observações (opcional)
            </label>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Ex.: Contagem antes do fim de semana"
              className="mgw-input"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStartOpen(false)}
              className="mgw-btn-secondary min-h-[38px] px-4 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={starting}
              className="mgw-btn-primary min-h-[38px] px-4 cursor-pointer disabled:opacity-50"
            >
              {starting ? 'Gerando lista...' : 'Abrir Contagem'}
            </button>
          </div>
        </form>
      )}

      {counts.length === 0 ? (
        <div className="mgw-card p-8 text-center space-y-2.5">
          <div className="w-11 h-11 rounded-2xl bg-[#F5F6FA] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mx-auto">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-[#172033]">
            Nenhum inventário realizado ainda
          </h4>
          <p className="text-xs text-[#778094] max-w-md mx-auto">
            Abra uma contagem física sempre que precisar conferir garrafas, latas e packs na loja para reconciliar divergências de estoque.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 mgw-card divide-y divide-[#E8EAF0] overflow-hidden">
            {counts.map((cnt) => {
              const summary = summarizeInventoryCountItems(cnt, countItems);
              const isSelected = activeCount?.id === cnt.id;
              return (
                <button
                  key={cnt.id}
                  type="button"
                  onClick={() => setSelectedCountId(cnt.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#FFFBEB]' : 'bg-white hover:bg-[#F5F6FA]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-[#172033] truncate">
                      #{cnt.countNumber} · {cnt.title}
                    </p>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        cnt.status === 'finalized'
                          ? 'text-[#16A36A]'
                          : cnt.status === 'cancelled'
                            ? 'text-[#E35D62]'
                            : 'text-[#B38300]'
                      }`}
                    >
                      {COUNT_STATUS_LABEL[cnt.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#778094] mt-1 tabular-nums">
                    {summary.countedItems}/{summary.totalItems} contados ·{' '}
                    {summary.divergentItems} divergência
                    {summary.divergentItems === 1 ? '' : 's'}
                  </p>
                  <p className="text-[11px] text-[#778094] mt-0.5">
                    {new Date(cnt.createdAtMs).toLocaleDateString('pt-BR')}
                  </p>
                </button>
              );
            })}
          </div>

          {activeCount && (
            <div className="lg:col-span-8 mgw-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8EAF0] pb-3.5">
                <div>
                  <h4 className="text-base font-bold text-[#172033]">
                    Inventário #{activeCount.countNumber} — {activeCount.title}
                  </h4>
                  <p className="text-xs text-[#778094] mt-0.5">
                    Status: <strong>{COUNT_STATUS_LABEL[activeCount.status]}</strong> ·
                    Iniciado por {activeCount.startedByEmail || 'sistema'} em{' '}
                    {new Date(activeCount.createdAtMs).toLocaleString('pt-BR')}
                  </p>
                </div>

                {activeCount.status === 'open' && canWrite && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onCancelCount(activeCount.id)}
                      className="mgw-btn-secondary min-h-[38px] px-3 text-xs text-[#E35D62] flex items-center gap-1.5 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={savingDraft}
                      onClick={() => void handleSaveProgress()}
                      className="mgw-btn-secondary min-h-[38px] px-3 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingDraft ? 'Salvando...' : 'Salvar Rascunho'}
                    </button>
                    <button
                      type="button"
                      disabled={finalizing}
                      onClick={() => void handleFinalize()}
                      className="mgw-btn-primary min-h-[38px] px-4 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {finalizing ? 'Finalizando...' : 'Finalizar e Ajustar Estoque'}
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E8EAF0] text-[#778094] font-semibold">
                      <th className="py-2 pr-3">Produto</th>
                      <th className="py-2 px-3 text-right">Saldo esperado</th>
                      <th className="py-2 px-3 text-right">Qtd contada</th>
                      <th className="py-2 px-3 text-right">Diferença</th>
                      <th className="py-2 pl-3 text-right">Impacto est.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EAF0]">
                    {activeItems.map((item) => {
                      const prod = productMap.get(item.productId);
                      const baseUnit = prod?.saleUnit || 'un';
                      const rawDraft = draftCounts[item.id] ?? '';
                      const liveCounted =
                        activeCount.status === 'open'
                          ? rawDraft.trim() !== ''
                            ? Number(rawDraft.replace(',', '.'))
                            : null
                          : item.countedQty;
                      const diff =
                        liveCounted !== null && Number.isFinite(liveCounted)
                          ? roundQty(liveCounted - item.expectedQty)
                          : null;
                      const diffValue =
                        diff !== null ? diff * item.unitCostSnapshot : 0;

                      return (
                        <tr key={item.id} className="hover:bg-[#F5F6FA]/60">
                          <td className="py-2.5 pr-3">
                            <p className="font-semibold text-[#172033]">
                              {prod?.name || 'Produto'}
                            </p>
                            <p className="text-[11px] text-[#778094]">
                              {prod?.category || '—'} · Custo méd.:{' '}
                              {formatCurrencyBRL(item.unitCostSnapshot)}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#172033]">
                            {formatStockQty(item.expectedQty, baseUnit)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {activeCount.status === 'open' && canWrite ? (
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                placeholder="—"
                                value={rawDraft}
                                onChange={(e) =>
                                  setDraftCounts((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                className="w-24 px-2.5 py-1.5 rounded-lg border border-[#E8EAF0] bg-white text-right font-mono tabular-nums text-xs"
                              />
                            ) : (
                              <span className="font-mono tabular-nums text-[#172033]">
                                {item.countedQty !== null
                                  ? formatStockQty(item.countedQty, baseUnit)
                                  : 'Não contado'}
                              </span>
                            )}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold ${
                              diff === null || diff === 0
                                ? 'text-[#778094]'
                                : diff > 0
                                  ? 'text-[#16A36A]'
                                  : 'text-[#E35D62]'
                            }`}
                          >
                            {diff === null
                              ? '—'
                              : `${diff > 0 ? '+' : ''}${formatStockQty(diff, baseUnit)}`}
                          </td>
                          <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-[#172033]">
                            {diff === null ? '—' : formatCurrencyBRL(diffValue)}
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
    </div>
  );
}
