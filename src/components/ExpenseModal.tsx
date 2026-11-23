import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseRecord,
  normalizePaymentMethod,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../types/finance';
import { getLocalTodayDate } from '../utils/finance';

interface ExpenseModalProps {
  isOpen: boolean;
  editingExpense: ExpenseRecord | null;
  establishmentName?: string;
  onClose: () => void;
  onSubmit: (input: ExpenseInput, editingId?: string) => Promise<void>;
}

export function ExpenseModal({
  isOpen,
  editingExpense,
  establishmentName = 'MGW Lanches',
  onClose,
  onSubmit,
}: ExpenseModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Ingredientes');
  const [date, setDate] = useState(getLocalTodayDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pix');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingExpense) {
      setDescription(editingExpense.description);
      setAmount(String(editingExpense.amount));
      setCategory(editingExpense.category);
      setDate(editingExpense.date);
      setPaymentMethod(normalizePaymentMethod(editingExpense.paymentMethod));
      setNote(editingExpense.note);
    } else {
      setDescription('');
      setAmount('');
      setCategory('Ingredientes');
      setDate(getLocalTodayDate());
      setPaymentMethod('Pix');
      setNote('');
    }
    setError(null);
    setIsSaving(false);
  }, [isOpen, editingExpense]);

  if (!isOpen) return null;

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    const cleanDesc = description.trim();
    const parsedAmount = Number(String(amount).replace(',', '.'));

    if (!cleanDesc) {
      setError('Informe a descrição da despesa.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Informe um valor em reais maior que zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Selecione uma data válida.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSubmit(
        {
          description: cleanDesc,
          amount: parsedAmount,
          category,
          date,
          paymentMethod,
          note: note.trim(),
        },
        editingExpense?.id,
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar a despesa.',
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
      aria-labelledby="expense-modal-title"
    >
      <div className="w-full sm:max-w-lg bg-[#FFFFFF] border border-[#E5E7EB] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1 bg-[#333A4A] rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2
              id="expense-modal-title"
              className="text-lg font-bold text-[#111827]"
            >
              {editingExpense ? 'Editar Despesa' : 'Nova Despesa'}
            </h2>
            <p className="text-xs text-[#6B7280]">
              Lançamento de insumos e custos · {establishmentName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de despesa"
            className="min-w-[44px] min-h-[44px] rounded-xl border border-[#E5E7EB] hover:border-[#374151] flex items-center justify-center text-[#6B7280] hover:text-white transition-colors cursor-pointer"
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

          <div>
            <label
              htmlFor="expense-desc"
              className="block text-xs font-medium text-[#4B5563] mb-1.5"
            >
              Descrição da despesa
            </label>
            <input
              id="expense-desc"
              type="text"
              maxLength={160}
              placeholder="Ex.: Compra de carne, pão brioche, gás..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] placeholder:text-[#6B7280]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="expense-amount"
                className="block text-xs font-medium text-[#4B5563] mb-1.5"
              >
                Valor (R$)
              </label>
              <input
                id="expense-amount"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="expense-date"
                className="block text-xs font-medium text-[#4B5563] mb-1.5"
              >
                Data da despesa
              </label>
              <input
                id="expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="expense-category"
                className="block text-xs font-medium text-[#4B5563] mb-1.5"
              >
                Categoria
              </label>
              <select
                id="expense-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="expense-payment"
                className="block text-xs font-medium text-[#4B5563] mb-1.5"
              >
                Forma de pagamento
              </label>
              <select
                id="expense-payment"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
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
              htmlFor="expense-note"
              className="block text-xs font-medium text-[#4B5563] mb-1.5"
            >
              Observação (opcional)
            </label>
            <input
              id="expense-note"
              type="text"
              maxLength={240}
              placeholder="Ex.: Fornecedor, nota fiscal..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] placeholder:text-[#6B7280]"
            />
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[46px] px-4 rounded-xl border border-[#E5E7EB] hover:border-[#374151] text-sm font-medium text-[#4B5563] cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-sm font-bold cursor-pointer transition-colors disabled:opacity-60"
            >
              {isSaving
                ? 'Salvando...'
                : editingExpense
                  ? 'Salvar Alterações'
                  : 'Registrar Despesa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
