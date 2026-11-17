import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  normalizePaymentMethod,
  PAYMENT_METHODS,
  type SaleRecord,
} from '../types/finance';
import {
  formatCurrencyBRL,
  formatDateBR,
  formatSaleItemsSummary,
  getLocalTodayDate,
  getMonthBounds,
  getSaleCombosCount,
  getSaleOrigin,
  getSaleXSaladaCount,
} from '../utils/finance';

interface SalesViewProps {
  sales: SaleRecord[];
  onOpenNewSale: () => void;
  onEditSale: (sale: SaleRecord) => void;
  onDeleteSale: (saleId: string) => Promise<void>;
}

export function SalesView({
  sales,
  onOpenNewSale,
  onEditSale,
  onDeleteSale,
}: SalesViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'manual' | 'online'>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const today = getLocalTodayDate();
  const monthBounds = useMemo(() => getMonthBounds(today), [today]);

  const totals = useMemo(() => {
    let todayTotal = 0;
    let todayQty = 0;
    let todayCombos = 0;
    let monthTotal = 0;
    let monthQty = 0;
    let monthCombos = 0;

    for (const s of sales) {
      const xCount = getSaleXSaladaCount(s);
      const cCount = getSaleCombosCount(s);
      if (s.date === today) {
        todayTotal += s.totalAmount;
        todayQty += xCount;
        todayCombos += cCount;
      }
      if (s.date >= monthBounds.start && s.date <= monthBounds.end) {
        monthTotal += s.totalAmount;
        monthQty += xCount;
        monthCombos += cCount;
      }
    }
    return {
      todayTotal,
      todayQty,
      todayCombos,
      monthTotal,
      monthQty,
      monthCombos,
    };
  }, [sales, today, monthBounds]);

  const filteredSales = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return sales.filter((s) => {
      const pm = normalizePaymentMethod(s.paymentMethod);
      const origin = getSaleOrigin(s);
      if (paymentFilter !== 'all' && pm !== paymentFilter) return false;
      if (originFilter !== 'all' && origin !== originFilter) return false;
      if (dateFilter && s.date !== dateFilter) return false;
      if (q) {
        const originLabel = origin === 'online' ? 'cardápio online' : 'manual';
        const hay = `${formatSaleItemsSummary(s)} ${s.note} ${pm} ${originLabel} ${formatDateBR(s.date)} ${getSaleXSaladaCount(s)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sales, paymentFilter, originFilter, dateFilter, searchTerm]);

  async function handleConfirmDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await onDeleteSale(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[#12151C] border border-[#232834] rounded-2xl p-5">
          <p className="text-xs text-[#9CA3AF]">Vendas de hoje</p>
          <p className="text-2xl font-bold text-[#F5B731] font-mono tabular-nums mt-1">
            {formatCurrencyBRL(totals.todayTotal)}
          </p>
          <p className="text-xs text-[#9CA3AF] mt-1 font-mono tabular-nums">
            {totals.todayQty} X-Salada{totals.todayQty === 1 ? '' : 's'}
            {totals.todayCombos > 0
              ? ` · ${totals.todayCombos} combo${totals.todayCombos === 1 ? '' : 's'}`
              : ' hoje'}
          </p>
        </div>

        <div className="bg-[#12151C] border border-[#232834] rounded-2xl p-5">
          <p className="text-xs text-[#9CA3AF]">Acumulado do mês</p>
          <p className="text-2xl font-bold text-[#F3F4F6] font-mono tabular-nums mt-1">
            {formatCurrencyBRL(totals.monthTotal)}
          </p>
          <p className="text-xs text-[#9CA3AF] mt-1 font-mono tabular-nums">
            {totals.monthQty} X-Salada{totals.monthQty === 1 ? '' : 's'}
            {totals.monthCombos > 0
              ? ` · ${totals.monthCombos} combo${totals.monthCombos === 1 ? '' : 's'}`
              : ' no mês'}
          </p>
        </div>

        <div className="bg-[#12151C] border border-[#232834] rounded-2xl p-5 flex items-center justify-between gap-4 sm:col-span-2 lg:col-span-1">
          <div>
            <p className="text-xs text-[#9CA3AF]">Lançamento rápido</p>
            <p className="text-sm font-semibold text-[#F3F4F6] mt-1">
              Registre combos ou vendas individuais
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenNewSale}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nova Venda
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#12151C] border border-[#232834] rounded-2xl p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Buscar vendas por combo, item, observação ou data"
            placeholder="Buscar por combo, item, observação, pagamento ou data..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] placeholder:text-[#6B7280]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filtrar por forma de pagamento"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
          >
            <option value="all">Todas as formas</option>
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm} value={pm}>
                {pm}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por origem da venda"
            value={originFilter}
            onChange={(e) =>
              setOriginFilter(e.target.value as 'all' | 'manual' | 'online')
            }
            className="min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
          >
            <option value="all">Todas as origens</option>
            <option value="manual">Vendas Manuais</option>
            <option value="online">Cardápio Online</option>
          </select>

          <input
            type="date"
            aria-label="Filtrar por data"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono"
          />

          {(dateFilter ||
            paymentFilter !== 'all' ||
            originFilter !== 'all' ||
            searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setPaymentFilter('all');
                setOriginFilter('all');
                setDateFilter('');
              }}
              className="min-h-[44px] px-3.5 rounded-xl border border-[#232834] hover:border-[#374151] text-xs font-medium text-[#D1D5DB] cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Sales List */}
      <section className="bg-[#12151C] border border-[#232834] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#232834] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#F3F4F6]">
            Histórico de Vendas
          </h3>
          <span className="text-xs text-[#9CA3AF] font-mono tabular-nums">
            {filteredSales.length} pedido{filteredSales.length === 1 ? '' : 's'}
          </span>
        </div>

        {filteredSales.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-[#D1D5DB]">
              {sales.length === 0
                ? 'Nenhuma venda registrada ainda.'
                : 'Nenhuma venda encontrada com os filtros selecionados.'}
            </p>
            <p className="text-xs text-[#9CA3AF]">
              {sales.length === 0
                ? 'Clique em + Nova Venda para lançar sua primeira venda.'
                : 'Altere os filtros acima para visualizar todo o histórico.'}
            </p>
            {sales.length === 0 && (
              <button
                type="button"
                onClick={onOpenNewSale}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Registrar primeira venda
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#232834]">
            {filteredSales.map((sale) => {
              const xCount = getSaleXSaladaCount(sale);
              const combosCount = getSaleCombosCount(sale);
              const pm = normalizePaymentMethod(sale.paymentMethod);
              const origin = getSaleOrigin(sale);
              const summaryText = formatSaleItemsSummary(sale);

              return (
                <div
                  key={sale.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#181C24]/50 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#F3F4F6] truncate max-w-full">
                        {summaryText}
                      </span>
                      <span className="text-xs text-[#9CA3AF]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-xs text-[#D1D5DB]">{pm}</span>
                      <span className="text-xs text-[#9CA3AF]" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          origin === 'online' ? 'text-[#F5B731]' : 'text-[#9CA3AF]'
                        }`}
                      >
                        {origin === 'online' ? 'Cardápio Online' : 'Manual'}
                      </span>
                      <span className="text-xs text-[#9CA3AF]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-xs text-[#9CA3AF] font-mono tabular-nums">
                        {formatDateBR(sale.date)}
                      </span>
                    </div>
                    <p className="text-xs text-[#9CA3AF] font-mono tabular-nums truncate">
                      {xCount} X-Salada{xCount === 1 ? '' : 's'}
                      {combosCount > 0
                        ? ` · ${combosCount} combo${combosCount === 1 ? '' : 's'}`
                        : ''}
                      {sale.note ? ` · ${sale.note}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span className="text-base font-bold text-[#F5B731] font-mono tabular-nums">
                      {formatCurrencyBRL(sale.totalAmount)}
                    </span>

                    {confirmDeleteId === sale.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={deletingId === sale.id}
                          onClick={() => void handleConfirmDelete(sale.id)}
                          className="min-h-[40px] px-3 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-semibold cursor-pointer"
                        >
                          {deletingId === sale.id ? 'Excluindo...' : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[40px] px-3 rounded-lg border border-[#232834] text-xs text-[#D1D5DB] cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEditSale(sale)}
                          aria-label={`Editar venda ${summaryText} em ${formatDateBR(sale.date)}`}
                          className="min-w-[44px] min-h-[44px] rounded-xl border border-[#232834] hover:border-[#F5B731]/50 flex items-center justify-center text-[#9CA3AF] hover:text-[#F5B731] transition-colors cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(sale.id)}
                          aria-label={`Excluir venda ${summaryText} em ${formatDateBR(sale.date)}`}
                          className="min-w-[44px] min-h-[44px] rounded-xl border border-[#232834] hover:border-[#EF4444]/50 flex items-center justify-center text-[#9CA3AF] hover:text-[#F87171] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
