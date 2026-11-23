import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  type ExpenseRecord,
} from '../types/finance';
import {
  computeExpenseByCategory,
  formatCurrencyBRL,
  formatDateBR,
  getLocalTodayDate,
  getMonthBounds,
} from '../utils/finance';

interface ExpensesViewProps {
  expenses: ExpenseRecord[];
  canCreateExpenses?: boolean;
  canEditExpenses?: boolean;
  canDeleteExpenses?: boolean;
  onOpenNewExpense: () => void;
  onEditExpense: (expense: ExpenseRecord) => void;
  onDeleteExpense: (expenseId: string) => Promise<void>;
}

export function ExpensesView({
  expenses,
  canCreateExpenses = true,
  canEditExpenses = true,
  canDeleteExpenses = true,
  onOpenNewExpense,
  onEditExpense,
  onDeleteExpense,
}: ExpensesViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const today = getLocalTodayDate();
  const monthBounds = useMemo(() => getMonthBounds(today), [today]);

  const totals = useMemo(() => {
    let todayTotal = 0;
    let monthTotal = 0;
    for (const e of expenses) {
      if (e.date === today) todayTotal += e.amount;
      if (e.date >= monthBounds.start && e.date <= monthBounds.end) {
        monthTotal += e.amount;
      }
    }
    return { todayTotal, monthTotal };
  }, [expenses, today, monthBounds]);

  const monthCategoryBreakdown = useMemo(() => {
    const monthExpenses = expenses.filter(
      (e) => e.date >= monthBounds.start && e.date <= monthBounds.end,
    );
    return computeExpenseByCategory(monthExpenses);
  }, [expenses, monthBounds]);

  const filteredExpenses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return expenses.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (q) {
        const hay = `${e.description} ${e.category} ${e.paymentMethod} ${e.note} ${formatDateBR(e.date)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, categoryFilter, searchTerm]);

  async function handleConfirmDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await onDeleteExpense(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5">
          <p className="text-xs text-[#6B7280]">Total de despesas de hoje</p>
          <p className="text-2xl font-bold text-[#F87171] font-mono tabular-nums mt-1">
            {formatCurrencyBRL(totals.todayTotal)}
          </p>
          <p className="text-xs text-[#6B7280] mt-1">
            Lançamentos realizados em {formatDateBR(today)}
          </p>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5">
          <p className="text-xs text-[#6B7280]">Total de despesas do mês</p>
          <p className="text-2xl font-bold text-[#111827] font-mono tabular-nums mt-1">
            {formatCurrencyBRL(totals.monthTotal)}
          </p>
          <p className="text-xs text-[#6B7280] mt-1">
            Insumos e custos operacionais do mês
          </p>
        </div>

        {canCreateExpenses && (
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 flex items-center justify-between gap-4 sm:col-span-2 lg:col-span-1">
            <div>
              <p className="text-xs text-[#6B7280]">Novo gasto ou compra</p>
              <p className="text-sm font-semibold text-[#111827] mt-1">
                Mantenha o lucro real atualizado
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenNewExpense}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nova Despesa
            </button>
          </div>
        )}
      </div>

      {/* Expenses by Category (Month) */}
      <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#111827]">
              Despesas por categoria (mês atual)
            </h3>
            <p className="text-xs text-[#6B7280]">
              Distribuição dos custos por tipo de insumo
            </p>
          </div>
        </div>

        {monthCategoryBreakdown.length === 0 ? (
          <p className="text-xs text-[#6B7280]">
            Nenhuma despesa registrada neste mês ainda.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            {monthCategoryBreakdown.map((item) => (
              <div key={item.category} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#4B5563] font-medium">
                    {item.category} · {item.count}x
                  </span>
                  <span className="text-[#111827] font-mono tabular-nums font-semibold">
                    {formatCurrencyBRL(item.amount)} ({item.sharePercent.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-[#F1F3F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#EF4444]/85 rounded-full"
                    style={{ width: `${Math.min(100, item.sharePercent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Buscar despesas"
            placeholder="Buscar por descrição, categoria ou observação..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] placeholder:text-[#6B7280]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filtrar por categoria de despesa"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
          >
            <option value="all">Todas as categorias</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {(categoryFilter !== 'all' || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('all');
                setSearchTerm('');
              }}
              className="min-h-[44px] px-3.5 rounded-xl border border-[#E5E7EB] hover:border-[#374151] text-xs font-medium text-[#4B5563] cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Expense History */}
      <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#111827]">
            Histórico de Despesas
          </h3>
          <span className="text-xs text-[#6B7280] font-mono tabular-nums">
            {filteredExpenses.length} registro{filteredExpenses.length === 1 ? '' : 's'}
          </span>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-[#4B5563]">
              {expenses.length === 0
                ? 'Nenhuma despesa registrada ainda.'
                : 'Nenhuma despesa encontrada para os filtros atuais.'}
            </p>
            <p className="text-xs text-[#6B7280]">
              {expenses.length === 0
                ? 'Registre compras de carne, pães, queijos, bebidas, gás e outras despesas.'
                : 'Limpe os filtros para visualizar todas as despesas.'}
            </p>
            {expenses.length === 0 && canCreateExpenses && (
              <button
                type="button"
                onClick={onOpenNewExpense}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Registrar primeira despesa
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {filteredExpenses.map((expense) => (
              <div
                key={expense.id}
                className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F1F3F5]/50 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-semibold text-[#111827] truncate">
                    {expense.description}
                  </p>
                  <p className="text-xs text-[#6B7280] truncate">
                    <span>{expense.category}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{expense.paymentMethod}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono tabular-nums">
                      {formatDateBR(expense.date)}
                    </span>
                    {expense.note ? ` · ${expense.note}` : ''}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="text-base font-bold text-[#F87171] font-mono tabular-nums">
                    − {formatCurrencyBRL(expense.amount)}
                  </span>

                  {canDeleteExpenses && confirmDeleteId === expense.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={deletingId === expense.id}
                        onClick={() => void handleConfirmDelete(expense.id)}
                        className="min-h-[40px] px-3 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-semibold cursor-pointer"
                      >
                        {deletingId === expense.id ? 'Excluindo...' : 'Confirmar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[40px] px-3 rounded-lg border border-[#E5E7EB] text-xs text-[#4B5563] cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    (canEditExpenses || canDeleteExpenses) && (
                      <div className="flex items-center gap-1.5">
                        {canEditExpenses && (
                          <button
                            type="button"
                            onClick={() => onEditExpense(expense)}
                            aria-label={`Editar despesa ${expense.description}`}
                            className="min-w-[44px] min-h-[44px] rounded-xl border border-[#E5E7EB] hover:border-[#EAB308]/50 flex items-center justify-center text-[#6B7280] hover:text-[#EAB308] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteExpenses && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(expense.id)}
                            aria-label={`Excluir despesa ${expense.description}`}
                            className="min-w-[44px] min-h-[44px] rounded-xl border border-[#E5E7EB] hover:border-[#EF4444]/50 flex items-center justify-center text-[#6B7280] hover:text-[#F87171] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
