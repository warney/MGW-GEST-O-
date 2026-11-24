import { useEffect, useState } from 'react';
import { Check, Globe, Layers, Loader2, LogOut, Save, Store } from 'lucide-react';
import type {
  ComboInput,
  ComboRecord,
  DigitalMenuSettings,
  DigitalMenuSettingsInput,
  ProductInput,
  ProductRecord,
  ShopSettings,
} from '../types/finance';
import { DigitalMenuSettingsPanel } from './DigitalMenuSettingsPanel';
import { ProductsCombosManager } from './ProductsCombosManager';

interface SettingsViewProps {
  workspaceId: string;
  settings: ShopSettings;
  products: ProductRecord[];
  combos: ComboRecord[];
  digitalMenuSettings: DigitalMenuSettings;
  onSaveSettings: (next: Omit<ShopSettings, 'ownerId'>) => Promise<void>;
  onSaveDigitalMenuSettings: (next: DigitalMenuSettingsInput) => Promise<void>;
  onCreateProduct: (input: ProductInput) => Promise<string>;
  onUpdateProduct: (productId: string, input: ProductInput) => Promise<void>;
  onCreateCombo: (input: ComboInput) => Promise<string>;
  onUpdateCombo: (comboId: string, input: ComboInput) => Promise<void>;
  onSeedCatalog: () => Promise<void>;
  onPreviewPublicMenu?: (slug: string) => void;
  initialTab?: 'shop' | 'catalog' | 'digital_menu';
  hideNavigationTabs?: boolean;
  onTabChange?: (tab: 'shop' | 'catalog' | 'digital_menu') => void;
  accountEmail: string;
  onLogout: () => Promise<void>;
  canManageShopSettings?: boolean;
  canManageDigitalMenu?: boolean;
}

const BRAZIL_TIMEZONES = [
  { value: 'America/Manaus', label: 'Amazonas / Roraima / Rondônia (America/Manaus)' },
  { value: 'America/Sao_Paulo', label: 'Brasília / Sudeste / Sul / Nordeste (America/Sao_Paulo)' },
  { value: 'America/Cuiaba', label: 'Mato Grosso / Mato Grosso do Sul (America/Cuiaba)' },
  { value: 'America/Belem', label: 'Pará / Amapá (America/Belem)' },
  { value: 'America/Fortaleza', label: 'Ceará / Maranhão / Piauí / RN / PB (America/Fortaleza)' },
  { value: 'America/Rio_Branco', label: 'Acre (America/Rio_Branco)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (America/Noronha)' },
] as const;

export function SettingsView({
  workspaceId,
  settings,
  products,
  combos,
  digitalMenuSettings,
  onSaveSettings,
  onSaveDigitalMenuSettings,
  onCreateProduct,
  onUpdateProduct,
  onCreateCombo,
  onUpdateCombo,
  onSeedCatalog,
  onPreviewPublicMenu,
  initialTab = 'shop',
  hideNavigationTabs = false,
  onTabChange,
  accountEmail,
  onLogout,
  canManageShopSettings = true,
  canManageDigitalMenu = true,
}: SettingsViewProps) {
  const defaultTab = canManageShopSettings
    ? initialTab
    : 'catalog';
  const [activeTab, setActiveTab] = useState<'shop' | 'catalog' | 'digital_menu'>(
    defaultTab,
  );

  useEffect(() => {
    if (initialTab === 'shop' && !canManageShopSettings) {
      setActiveTab('catalog');
      return;
    }
    if (initialTab === 'digital_menu' && !canManageDigitalMenu) {
      setActiveTab('catalog');
      return;
    }
    setActiveTab(initialTab);
  }, [initialTab, canManageShopSettings, canManageDigitalMenu]);

  function handleSelectTab(nextTab: 'shop' | 'catalog' | 'digital_menu') {
    setActiveTab(nextTab);
    onTabChange?.(nextTab);
  }

  const [establishmentName, setEstablishmentName] = useState(
    settings.establishmentName,
  );
  const [xSaladaPrice, setXSaladaPrice] = useState(
    String(settings.xSaladaPrice),
  );
  const [dailyGoal, setDailyGoal] = useState(String(settings.dailyGoal));
  const [monthlyGoal, setMonthlyGoal] = useState(String(settings.monthlyGoal));
  const [startDate, setStartDate] = useState(settings.startDate);
  const [timezone, setTimezone] = useState(
    settings.timezone || 'America/Manaus',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    setEstablishmentName(settings.establishmentName);
    setXSaladaPrice(String(settings.xSaladaPrice));
    setDailyGoal(String(settings.dailyGoal));
    setMonthlyGoal(String(settings.monthlyGoal));
    setStartDate(settings.startDate);
    setTimezone(settings.timezone || 'America/Manaus');
  }, [settings]);

  async function handleLogoutClick() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await onLogout();
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    setError(null);
    setIsSaving(true);
    try {
      const cleanName = establishmentName.trim();
      const parsedPrice = Number(String(xSaladaPrice).replace(',', '.'));
      const parsedDaily = Number(String(dailyGoal).replace(',', '.'));
      const parsedMonthly = Number(String(monthlyGoal).replace(',', '.'));

      if (!cleanName) {
        throw new Error('Informe o nome do estabelecimento.');
      }
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        throw new Error('O preço do X-Salada deve ser maior que zero.');
      }
      if (!Number.isFinite(parsedDaily) || parsedDaily < 0) {
        throw new Error('Informe uma meta diária válida.');
      }
      if (!Number.isFinite(parsedMonthly) || parsedMonthly < 0) {
        throw new Error('Informe uma meta mensal válida.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw new Error('Informe uma data de início válida.');
      }

      await onSaveSettings({
        establishmentName: cleanName,
        xSaladaPrice: parsedPrice,
        dailyGoal: parsedDaily,
        monthlyGoal: parsedMonthly,
        startDate,
        timezone: timezone || 'America/Manaus',
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3500);
    } catch (err) {
      console.error('Erro ao validar ou salvar Configurações da Lanchonete:', err);
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar configurações.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={activeTab === 'catalog' ? 'space-y-5' : 'max-w-4xl space-y-5'}>
      {!hideNavigationTabs && (
      <>
      {/* Settings Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Opções de configuração"
        className="flex flex-wrap p-1 bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl gap-1"
      >
        {canManageShopSettings && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'shop'}
            onClick={() => handleSelectTab('shop')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'shop'
                ? 'bg-[#EAB308] text-[#F9FAFB]'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <Store className="w-4 h-4" />
            Dados da Lanchonete
          </button>
        )}

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'catalog'}
          onClick={() => handleSelectTab('catalog')}
          className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer ${
            activeTab === 'catalog'
              ? 'bg-[#EAB308] text-[#F9FAFB]'
              : 'text-[#6B7280] hover:text-[#111827]'
          }`}
        >
          <Layers className="w-4 h-4" />
          Produtos e Combos
        </button>

        {canManageDigitalMenu && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'digital_menu'}
            onClick={() => handleSelectTab('digital_menu')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'digital_menu'
                ? 'bg-[#EAB308] text-[#F9FAFB]'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <Globe className="w-4 h-4" />
            Cardápio Digital
          </button>
        )}
      </div>
      </>
      )}

      {activeTab === 'digital_menu' && canManageDigitalMenu ? (
        <DigitalMenuSettingsPanel
          workspaceId={workspaceId}
          settings={digitalMenuSettings}
          activeProductsCount={products.filter((p) => p.active).length}
          activeCombosCount={combos.filter((c) => c.active).length}
          onSave={onSaveDigitalMenuSettings}
          onPreviewPublicMenu={onPreviewPublicMenu}
        />
      ) : activeTab === 'shop' && canManageShopSettings ? (
        <div className="max-w-2xl space-y-4">
        <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
              <span className="w-8 h-8 rounded-lg bg-[#EAB308]/10 text-[#EAB308] flex items-center justify-center">
                <LogOut className="w-4 h-4" />
              </span>
              Conta e acesso
            </div>
            <p className="text-xs text-[#6B7280] mt-2 break-all">{accountEmail}</p>
            <p className="text-[11px] text-[#6B7280] mt-1">Encerre sua sessão neste dispositivo com segurança.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogoutClick()}
            disabled={isSigningOut}
            className="min-h-[42px] px-4 rounded-xl border border-[#EF4444]/35 text-[#FCA5A5] hover:bg-[#EF4444]/10 disabled:opacity-60 text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0"
          >
            <LogOut className="w-4 h-4" />
            {isSigningOut ? 'Saindo...' : 'Sair da conta'}
          </button>
        </section>
        <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="border-b border-[#E5E7EB] pb-4">
            <h2 className="text-lg font-bold text-[#111827]">
              Configurações da Lanchonete
            </h2>
            <p className="text-xs text-[#6B7280] mt-1">
              Todas as alterações são salvas permanentemente na nuvem.
            </p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            <div className="flex items-start gap-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3.5">
              <span className="w-9 h-9 rounded-lg bg-[#EAB308]/10 text-[#EAB308] flex items-center justify-center shrink-0">
                <Store className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[#111827]">Identificação do estabelecimento</h3>
                <p className="text-xs text-[#6B7280] mt-1">Defina o nome interno usado nos relatórios e a data de início das operações.</p>
              </div>
            </div>
            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5] break-words"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cfg-name"
                  className="block text-xs font-medium text-[#4B5563] mb-1.5"
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
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
                />
              </div>

              <div>
                <label
                  htmlFor="cfg-timezone"
                  className="block text-xs font-medium text-[#4B5563] mb-1.5"
                >
                  Fuso horário do estabelecimento
                </label>
                <select
                  id="cfg-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
                >
                  {BRAZIL_TIMEZONES.map((tzOption) => (
                    <option key={tzOption.value} value={tzOption.value}>
                      {tzOption.label}
                    </option>
                  ))}
                  {!BRAZIL_TIMEZONES.some((t) => t.value === timezone) && (
                    <option value={timezone}>{timezone}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E5E7EB]">
              <h3 className="text-sm font-semibold text-[#111827]">Parâmetros operacionais</h3>
              <p className="text-xs text-[#6B7280] mt-1">Valores padrão usados nos próximos lançamentos. Alterar aqui não modifica o histórico.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cfg-price"
                  className="block text-xs font-medium text-[#4B5563] mb-1.5"
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
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono tabular-nums"
                />
                <p className="text-[11px] text-[#6B7280] mt-1">
                  Usado como padrão nas próximas vendas sem alterar o histórico antigo.
                </p>
              </div>

              <div>
                <label
                  htmlFor="cfg-start-date"
                  className="block text-xs font-medium text-[#4B5563] mb-1.5"
                >
                  Data de início das operações
                </label>
                <input
                  id="cfg-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-[#E5E7EB]">
              <h3 className="text-sm font-semibold text-[#111827]">Metas financeiras</h3>
              <p className="text-xs text-[#6B7280] mt-1">Acompanhe o desempenho diário e mensal no painel inicial e nos relatórios.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cfg-daily-goal"
                  className="block text-xs font-medium text-[#4B5563] mb-1.5"
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
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="cfg-monthly-goal"
                  className="block text-xs font-medium text-[#4B5563] mb-1.5"
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
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSaving}
                aria-busy={isSaving}
                className="w-full sm:w-auto min-h-[46px] px-6 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Configurações
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
        </div>
      ) : (
        <ProductsCombosManager
          workspaceId={workspaceId}
          products={products}
          combos={combos}
          defaultXSaladaPrice={settings.xSaladaPrice}
          onCreateProduct={onCreateProduct}
          onUpdateProduct={onUpdateProduct}
          onCreateCombo={onCreateCombo}
          onUpdateCombo={onUpdateCombo}
          onSeedCatalog={onSeedCatalog}
        />
      )}
    </div>
  );
}
