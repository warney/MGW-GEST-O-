import { useEffect, useState } from 'react';
import { Check, Layers, Save, Store } from 'lucide-react';
import type {
  ComboInput,
  ComboRecord,
  ProductInput,
  ProductRecord,
  ShopSettings,
} from '../types/finance';
import { ProductsCombosManager } from './ProductsCombosManager';

interface SettingsViewProps {
  settings: ShopSettings;
  products: ProductRecord[];
  combos: ComboRecord[];
  onSaveSettings: (next: Omit<ShopSettings, 'ownerId'>) => Promise<void>;
  onCreateProduct: (input: ProductInput) => Promise<string>;
  onUpdateProduct: (productId: string, input: ProductInput) => Promise<void>;
  onCreateCombo: (input: ComboInput) => Promise<string>;
  onUpdateCombo: (comboId: string, input: ComboInput) => Promise<void>;
  onSeedCatalog: () => Promise<void>;
}

export function SettingsView({
  settings,
  products,
  combos,
  onSaveSettings,
  onCreateProduct,
  onUpdateProduct,
  onCreateCombo,
  onUpdateCombo,
  onSeedCatalog,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'shop' | 'catalog'>('shop');

  const [establishmentName, setEstablishmentName] = useState(
    settings.establishmentName,
  );
  const [xSaladaPrice, setXSaladaPrice] = useState(
    String(settings.xSaladaPrice),
  );
  const [dailyGoal, setDailyGoal] = useState(String(settings.dailyGoal));
  const [monthlyGoal, setMonthlyGoal] = useState(String(settings.monthlyGoal));
  const [startDate, setStartDate] = useState(settings.startDate);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEstablishmentName(settings.establishmentName);
    setXSaladaPrice(String(settings.xSaladaPrice));
    setDailyGoal(String(settings.dailyGoal));
    setMonthlyGoal(String(settings.monthlyGoal));
    setStartDate(settings.startDate);
  }, [settings]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    const cleanName = establishmentName.trim();
    const parsedPrice = Number(String(xSaladaPrice).replace(',', '.'));
    const parsedDaily = Number(String(dailyGoal).replace(',', '.'));
    const parsedMonthly = Number(String(monthlyGoal).replace(',', '.'));

    if (!cleanName) {
      setError('Informe o nome do estabelecimento.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError('O preço do X-Salada deve ser maior que zero.');
      return;
    }
    if (!Number.isFinite(parsedDaily) || parsedDaily < 0) {
      setError('Informe uma meta diária válida.');
      return;
    }
    if (!Number.isFinite(parsedMonthly) || parsedMonthly < 0) {
      setError('Informe uma meta mensal válida.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setError('Informe uma data de início válida.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSaveSettings({
        establishmentName: cleanName,
        xSaladaPrice: parsedPrice,
        dailyGoal: parsedDaily,
        monthlyGoal: parsedMonthly,
        startDate,
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar configurações.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-5">
      {/* Settings Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Opções de configuração"
        className="inline-flex p-1 bg-[#12151C] border border-[#232834] rounded-xl"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'shop'}
          onClick={() => setActiveTab('shop')}
          className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'shop'
              ? 'bg-[#F5B731] text-[#0B0D11]'
              : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
          }`}
        >
          <Store className="w-4 h-4" />
          Dados da Lanchonete
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'catalog'}
          onClick={() => setActiveTab('catalog')}
          className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'catalog'
              ? 'bg-[#F5B731] text-[#0B0D11]'
              : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
          }`}
        >
          <Layers className="w-4 h-4" />
          Produtos e Combos
        </button>
      </div>

      {activeTab === 'catalog' ? (
        <ProductsCombosManager
          products={products}
          combos={combos}
          defaultXSaladaPrice={settings.xSaladaPrice}
          onCreateProduct={onCreateProduct}
          onUpdateProduct={onUpdateProduct}
          onCreateCombo={onCreateCombo}
          onUpdateCombo={onUpdateCombo}
          onSeedCatalog={onSeedCatalog}
        />
      ) : (
        <section className="max-w-2xl bg-[#12151C] border border-[#232834] rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="border-b border-[#232834] pb-4">
            <h2 className="text-lg font-bold text-[#F3F4F6]">
              Configurações da Lanchonete
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-1">
              Todas as alterações são salvas permanentemente na nuvem.
            </p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5]"
              >
                {error}
              </div>
            )}

            {savedToast && (
              <div
                role="status"
                className="p-3 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/30 text-xs text-[#86EFAC] flex items-center gap-2"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Configurações salvas com sucesso.</span>
              </div>
            )}

            <div>
              <label
                htmlFor="cfg-name"
                className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
              >
                Nome do estabelecimento
              </label>
              <input
                id="cfg-name"
                type="text"
                maxLength={80}
                value={establishmentName}
                onChange={(e) => setEstablishmentName(e.target.value)}
                required
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cfg-price"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                >
                  Preço atual do X-Salada (R$)
                </label>
                <input
                  id="cfg-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={xSaladaPrice}
                  onChange={(e) => setXSaladaPrice(e.target.value)}
                  required
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono tabular-nums"
                />
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  Usado como padrão nas próximas vendas sem alterar o histórico antigo.
                </p>
              </div>

              <div>
                <label
                  htmlFor="cfg-start-date"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                >
                  Data de início das operações
                </label>
                <input
                  id="cfg-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cfg-daily-goal"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                >
                  Meta diária de faturamento (R$)
                </label>
                <input
                  id="cfg-daily-goal"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(e.target.value)}
                  required
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="cfg-monthly-goal"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                >
                  Meta mensal de faturamento (R$)
                </label>
                <input
                  id="cfg-monthly-goal"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={monthlyGoal}
                  onChange={(e) => setMonthlyGoal(e.target.value)}
                  required
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto min-h-[46px] px-6 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
