import { useEffect, useState, type FormEvent } from 'react';
import { PackagePlus, Settings2, Trash2, X } from 'lucide-react';
import type {
  InventoryBalanceRecord,
  InventoryPackagingConversionInput,
  InventoryPackagingConversionRecord,
  ProductRecord,
  ProductSaleUnit,
} from '../../types/finance';
import { formatStockQty } from '../../utils/inventory';

interface InventoryProductConfigModalProps {
  isOpen: boolean;
  product: ProductRecord | null;
  balance: InventoryBalanceRecord | null;
  conversions: InventoryPackagingConversionRecord[];
  onClose: () => void;
  onSaveConfig: (
    productId: string,
    minStockQty: number,
    allowNegativeStock: boolean,
  ) => Promise<void>;
  onSaveConversion: (
    input: InventoryPackagingConversionInput,
    conversionId?: string,
  ) => Promise<string>;
  onDeleteConversion: (conversionId: string) => Promise<void>;
}

const PACKAGING_TYPES: Array<{ value: ProductSaleUnit; label: string }> = [
  { value: 'caixa', label: 'Caixa' },
  { value: 'fardo', label: 'Fardo' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'garrafa', label: 'Garrafa' },
  { value: 'lata', label: 'Lata' },
  { value: 'unidade', label: 'Unidade' },
];

export function InventoryProductConfigModal({
  isOpen,
  product,
  balance,
  conversions,
  onClose,
  onSaveConfig,
  onSaveConversion,
  onDeleteConversion,
}: InventoryProductConfigModalProps) {
  const [minStockQty, setMinStockQty] = useState('0');
  const [allowNegative, setAllowNegative] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<ProductSaleUnit>('caixa');
  const [newFactor, setNewFactor] = useState('12');
  const [newDefaultPurchase, setNewDefaultPurchase] = useState(true);
  const [savingConv, setSavingConv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !product) return;
    setMinStockQty(String(balance?.minStockQty ?? 0));
    setAllowNegative(Boolean(balance?.allowNegativeStock));
    setNewLabel('');
    setNewType('caixa');
    setNewFactor('12');
    setNewDefaultPurchase(true);
    setError(null);
  }, [isOpen, product, balance]);

  if (!isOpen || !product) return null;

  const productConversions = conversions.filter((c) => c.productId === product.id);
  const baseUnit = product.saleUnit || 'unidade';

  async function handleSaveProductSettings(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    const parsedMin = Number(minStockQty.replace(',', '.'));
    if (!Number.isFinite(parsedMin) || parsedMin < 0) {
      setError('Informe um estoque mínimo válido (maior ou igual a zero).');
      return;
    }
    setSavingConfig(true);
    setError(null);
    try {
      await onSaveConfig(product.id, parsedMin, allowNegative);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configuração.');
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleAddConversion(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    const factor = Number(newFactor.replace(',', '.'));
    if (!newLabel.trim()) {
      setError('Informe o rótulo da embalagem (ex.: Caixa c/ 12).');
      return;
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      setError('Fator de conversão deve ser maior que zero.');
      return;
    }
    setSavingConv(true);
    setError(null);
    try {
      await onSaveConversion({
        productId: product.id,
        packageLabel: newLabel.trim(),
        packageType: newType,
        factorToBase: factor,
        isDefaultPurchase: newDefaultPurchase,
        active: true,
      });
      setNewLabel('');
      setNewFactor('12');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar embalagem.');
    } finally {
      setSavingConv(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inv-cfg-modal-title"
    >
      <div className="bg-white border border-[#E8EAF0] rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#F5F6FA] border border-[#E8EAF0] text-[#172033] flex items-center justify-center shrink-0">
              <Settings2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="inv-cfg-modal-title"
                className="text-base font-bold text-[#172033] truncate"
              >
                Configurar Estoque · {product.name}
              </h2>
              <p className="text-xs text-[#778094] truncate">
                Unidade base: {baseUnit} · Saldo atual:{' '}
                {formatStockQty(balance?.availableQty ?? 0, baseUnit)}
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

        <div className="p-5 space-y-6 overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs text-[#E35D62] font-medium"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSaveProductSettings} className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
              Parâmetros de Saldo e Alerta
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                  Estoque mínimo ({baseUnit})
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={minStockQty}
                  onChange={(e) => setMinStockQty(e.target.value)}
                  className="mgw-input tabular-nums"
                />
              </div>

              <label className="flex items-center gap-2.5 min-h-[42px] px-3.5 rounded-xl border border-[#E8EAF0] bg-[#F5F6FA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowNegative}
                  onChange={(e) => setAllowNegative(e.target.checked)}
                />
                <span className="text-xs font-medium text-[#172033]">
                  Permitir exceção de saldo negativo (com confirmação)
                </span>
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingConfig}
                className="mgw-btn-primary min-h-[40px] px-4 cursor-pointer disabled:opacity-50"
              >
                {savingConfig ? 'Salvando...' : 'Salvar Parâmetros'}
              </button>
            </div>
          </form>

          <div className="border-t border-[#E8EAF0] pt-5 space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
                Conversões de Embalagens (Compra / Entrada / Ajuste)
              </h3>
              <p className="text-xs text-[#778094] mt-0.5">
                Configure embalagens como Caixa c/ 12, Fardo c/ 6 ou Pacote. Alterar fatores aqui nunca altera movimentações históricas já gravadas.
              </p>
            </div>

            {productConversions.length > 0 && (
              <div className="divide-y divide-[#E8EAF0] border border-[#E8EAF0] rounded-xl overflow-hidden">
                {productConversions.map((conv) => (
                  <div
                    key={conv.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#172033] truncate">
                        {conv.packageLabel}
                        {conv.isDefaultPurchase ? ' · Padrão p/ compra' : ''}
                      </p>
                      <p className="text-[#778094] tabular-nums">
                        1 {conv.packageType} = {conv.factorToBase} {baseUnit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onDeleteConversion(conv.id)}
                      className="w-8 h-8 rounded-lg border border-[#E8EAF0] text-[#778094] hover:text-[#E35D62] hover:border-[#FECACA] flex items-center justify-center cursor-pointer shrink-0"
                      aria-label={`Remover ${conv.packageLabel}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={handleAddConversion}
              className="rounded-xl bg-[#F5F6FA] border border-[#E8EAF0] p-3.5 space-y-3"
            >
              <p className="text-xs font-semibold text-[#172033] flex items-center gap-1.5">
                <PackagePlus className="w-3.5 h-3.5 text-[#B38300]" />
                Adicionar nova conversão de embalagem
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  maxLength={60}
                  placeholder="Rótulo (ex.: Caixa c/ 12)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="mgw-input"
                />
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ProductSaleUnit)}
                  className="mgw-input"
                >
                  {PACKAGING_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  placeholder={`Qtd em ${baseUnit}`}
                  value={newFactor}
                  onChange={(e) => setNewFactor(e.target.value)}
                  className="mgw-input tabular-nums"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-[#172033] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newDefaultPurchase}
                    onChange={(e) => setNewDefaultPurchase(e.target.checked)}
                  />
                  Sugerir como embalagem padrão em compras
                </label>
                <button
                  type="submit"
                  disabled={savingConv}
                  className="mgw-btn-secondary min-h-[38px] px-3.5 text-xs cursor-pointer disabled:opacity-50"
                >
                  {savingConv ? 'Adicionando...' : 'Adicionar Conversão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
