import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  Loader2,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ComboProductItem,
  ComboRecord,
  ProductCategory,
  ProductPackageType,
  ProductRecord,
  ProductSaleUnit,
} from '../types/finance';
import type { BusinessSegment } from '../types/segments';
import type {
  AddonGroupRuleInput,
  CatalogAddonGroup,
  CatalogAddonOption,
  CatalogCategoryRecord,
} from '../utils/catalogSummary';
import { formatCurrencyBRL } from '../utils/finance';
import {
  calculateProductFinancials,
  isValidBarcodeFormat,
  normalizeBarcodeInput,
  parseLocaleDecimalInput,
  PRODUCT_PACKAGE_TYPES,
  PRODUCT_PACKAGE_TYPE_LABELS,
  PRODUCT_SALE_UNITS,
  PRODUCT_SALE_UNIT_LABELS,
  PRODUCT_VOLUME_UNITS,
  PRODUCT_VOLUME_UNIT_LABELS,
} from '../utils/universalProducts';
import { ImageUploadField } from './ImageUploadField';

function useEscapeClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);
}

interface ProductFormModalProps {
  open: boolean;
  businessSegment?: BusinessSegment;
  editingProduct: ProductRecord | null;
  draftProductId: string;
  workspaceId: string;
  prodName: string;
  onProdNameChange: (val: string) => void;
  prodCategory: ProductCategory;
  onProdCategoryChange: (val: ProductCategory) => void;
  selectableCategories: string[];
  prodPrice: string;
  onProdPriceChange: (val: string) => void;
  prodCountsXSalada: boolean;
  onProdCountsXSaladaChange: (val: boolean) => void;
  prodActive: boolean;
  onProdActiveChange: (val: boolean) => void;
  prodImageUrl: string;
  prodImagePath: string;
  onProdImageChange: (next: { url: string; path: string }) => void;
  uploadingImage: boolean;
  onUploadingImageChange: (uploading: boolean) => void;
  addonGroups: CatalogAddonGroup[];
  selectedAddonGroupIds: string[];
  onToggleAddonGroupId: (groupId: string, checked: boolean) => void;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  // Campos universais (renderizados no segmento Adega sem afetar Lanchonete)
  prodDescription?: string;
  onProdDescriptionChange?: (val: string) => void;
  prodInternalCode?: string;
  onProdInternalCodeChange?: (val: string) => void;
  prodCostPrice?: string;
  onProdCostPriceChange?: (val: string) => void;
  prodBrand?: string;
  onProdBrandChange?: (val: string) => void;
  availableBrands?: string[];
  prodNotes?: string;
  onProdNotesChange?: (val: string) => void;
  prodBarcode?: string;
  onProdBarcodeChange?: (val: string) => void;
  barcodeDuplicateProductName?: string | null;
  prodVolumeValue?: string;
  onProdVolumeValueChange?: (val: string) => void;
  prodVolumeUnit?: string;
  onProdVolumeUnitChange?: (val: string) => void;
  prodSaleUnit?: ProductSaleUnit;
  onProdSaleUnitChange?: (val: ProductSaleUnit) => void;
  prodPackageType?: ProductPackageType;
  onProdPackageTypeChange?: (val: ProductPackageType) => void;
  prodUnitsPerPackage?: string;
  onProdUnitsPerPackageChange?: (val: string) => void;
}

export function ProductFormModal({
  open,
  businessSegment = 'lanchonete',
  editingProduct,
  draftProductId,
  workspaceId,
  prodName,
  onProdNameChange,
  prodCategory,
  onProdCategoryChange,
  selectableCategories,
  prodPrice,
  onProdPriceChange,
  prodCountsXSalada,
  onProdCountsXSaladaChange,
  prodActive,
  onProdActiveChange,
  prodImageUrl,
  prodImagePath,
  onProdImageChange,
  uploadingImage,
  onUploadingImageChange,
  addonGroups,
  selectedAddonGroupIds,
  onToggleAddonGroupId,
  saving,
  errorMessage,
  onClose,
  onSubmit,
  prodDescription = '',
  onProdDescriptionChange,
  prodInternalCode = '',
  onProdInternalCodeChange,
  prodCostPrice = '',
  onProdCostPriceChange,
  prodBrand = '',
  onProdBrandChange,
  availableBrands = [],
  prodNotes = '',
  onProdNotesChange,
  prodBarcode = '',
  onProdBarcodeChange,
  barcodeDuplicateProductName = null,
  prodVolumeValue = '',
  onProdVolumeValueChange,
  prodVolumeUnit = '',
  onProdVolumeUnitChange,
  prodSaleUnit = 'unidade',
  onProdSaleUnitChange,
  prodPackageType = 'individual',
  onProdPackageTypeChange,
  prodUnitsPerPackage = '1',
  onProdUnitsPerPackageChange,
}: ProductFormModalProps) {
  useEscapeClose(open, () => {
    if (!saving) onClose();
  });

  if (!open || typeof document === 'undefined') return null;

  const isAdega = businessSegment === 'adega';

  const categoryOptions = selectableCategories.some(
    (c) => c.toLowerCase() === prodCategory.trim().toLowerCase(),
  )
    ? selectableCategories
    : prodCategory.trim()
      ? [prodCategory.trim(), ...selectableCategories]
      : selectableCategories;

  const parsedPricePreview = parseLocaleDecimalInput(prodPrice);
  const parsedCostPreview = prodCostPrice.trim()
    ? parseLocaleDecimalInput(prodCostPrice)
    : 0;
  const financialsPreview = calculateProductFinancials({
    unitPrice: Number.isFinite(parsedPricePreview) ? parsedPricePreview : 0,
    costPrice: Number.isFinite(parsedCostPreview) ? parsedCostPreview : 0,
  });
  const normalizedBarcodePreview = normalizeBarcodeInput(prodBarcode);
  const hasInvalidBarcodePreview =
    normalizedBarcodePreview !== null &&
    !isValidBarcodeFormat(normalizedBarcodePreview);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-product-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <form
        onSubmit={onSubmit}
        className="w-full sm:max-w-2xl max-h-[92vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3
              id="catalog-product-modal-title"
              className="text-base font-extrabold text-[#172033] truncate"
            >
              {editingProduct
                ? `Editar ${editingProduct.name}`
                : 'Cadastrar Novo Produto'}
            </h3>
            <p className="text-xs text-[#778094] mt-0.5">
              {isAdega
                ? 'Segmento Adega · Configure identificação, preços, custos, volume, embalagem e código de barras.'
                : 'Defina nome, categoria, preço, foto e grupos de adicionais.'}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Fechar formulário de produto"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] flex items-center justify-center text-[#778094] hover:text-[#172033] cursor-pointer shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 overflow-y-auto space-y-4 bg-[#F7F8FC]/40">
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isAdega ? (
            <>
              {/* 1. Informações básicas */}
              <section className="rounded-xl border border-[#E8EAF0] bg-white p-4 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[#172033]">
                      1. Informações básicas
                    </h4>
                    <p className="text-[11px] text-[#778094]">
                      Identificação principal, categoria e disponibilidade do produto.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-[11px] font-semibold text-[#92400E]">
                    Segmento: Adega
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="prod-name"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Nome do produto
                    </label>
                    <input
                      id="prod-name"
                      type="text"
                      maxLength={80}
                      placeholder="Ex: Cerveja Heineken Long Neck, Gin Tanqueray"
                      value={prodName}
                      onChange={(e) => onProdNameChange(e.target.value)}
                      required
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="prod-cat"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Categoria
                    </label>
                    <select
                      id="prod-cat"
                      value={prodCategory}
                      onChange={(e) =>
                        onProdCategoryChange(e.target.value as ProductCategory)
                      }
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
                    >
                      {categoryOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="prod-internal-code"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Código interno (opcional)
                    </label>
                    <input
                      id="prod-internal-code"
                      type="text"
                      maxLength={40}
                      placeholder="Ex: ADG-001"
                      value={prodInternalCode}
                      onChange={(e) => onProdInternalCodeChange?.(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033] font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="prod-description"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Descrição (opcional)
                    </label>
                    <input
                      id="prod-description"
                      type="text"
                      maxLength={400}
                      placeholder="Ex: Garrafa gelada, ideal para combos ou consumo direto"
                      value={prodDescription}
                      onChange={(e) => onProdDescriptionChange?.(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-xs font-medium text-[#172033] cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={prodActive}
                    onChange={(e) => onProdActiveChange(e.target.checked)}
                    className="w-4 h-4 accent-[#F5B900] rounded"
                  />
                  <span>Produto ativo e disponível para venda e cardápio</span>
                </label>
              </section>

              {/* 2. Informações comerciais */}
              <section className="rounded-xl border border-[#E8EAF0] bg-white p-4 space-y-3.5">
                <div>
                  <h4 className="text-xs font-bold text-[#172033]">
                    2. Informações comerciais e margem
                  </h4>
                  <p className="text-[11px] text-[#778094]">
                    Defina preço de venda, custo de aquisição, marca e observações internas.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="prod-price"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Preço de venda (R$)
                    </label>
                    <input
                      id="prod-price"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={prodPrice}
                      onChange={(e) => onProdPriceChange(e.target.value)}
                      required
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033] font-mono tabular-nums"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="prod-cost-price"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Custo de aquisição (R$) (opcional)
                    </label>
                    <input
                      id="prod-cost-price"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={prodCostPrice}
                      onChange={(e) => onProdCostPriceChange?.(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033] font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div
                  className={`rounded-xl border p-3 text-xs ${
                    financialsPreview.hasValidCost &&
                    financialsPreview.grossProfitPerUnit !== null &&
                    financialsPreview.grossProfitPerUnit < 0
                      ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                      : financialsPreview.hasValidCost
                        ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                        : 'bg-[#F7F8FC] border-[#E8EAF0] text-[#778094]'
                  }`}
                >
                  {financialsPreview.hasValidCost &&
                  financialsPreview.grossProfitPerUnit !== null ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">Lucro bruto unitário: </span>
                        <span className="font-mono font-bold tabular-nums">
                          {formatCurrencyBRL(financialsPreview.grossProfitPerUnit)}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Margem bruta sobre venda: </span>
                        <span className="font-mono font-bold tabular-nums">
                          {financialsPreview.marginPercent !== null
                            ? `${financialsPreview.marginPercent.toFixed(2).replace('.', ',')}%`
                            : '—'}
                        </span>
                      </div>
                      <p className="w-full text-[11px] opacity-80">
                        Estimativa unitária (venda - custo de aquisição). Não representa lucro líquido.
                      </p>
                    </div>
                  ) : (
                    <p>
                      Informe o custo de aquisição acima de R$ 0,00 para calcular margem e lucro bruto unitário.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="prod-brand"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Marca (opcional)
                    </label>
                    <input
                      id="prod-brand"
                      type="text"
                      maxLength={80}
                      list="adega-product-brands"
                      placeholder="Ex: Heineken, Red Bull, Smirnoff"
                      value={prodBrand}
                      onChange={(e) => onProdBrandChange?.(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
                    />
                    <datalist id="adega-product-brands">
                      {availableBrands.map((brandName) => (
                        <option key={brandName} value={brandName} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label
                      htmlFor="prod-notes"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Observações internas (opcional)
                    </label>
                    <input
                      id="prod-notes"
                      type="text"
                      maxLength={400}
                      placeholder="Ex: Vender gelada, embalagem retornável..."
                      value={prodNotes}
                      onChange={(e) => onProdNotesChange?.(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
                    />
                  </div>
                </div>
              </section>

              {/* 3. Identificação, volume e embalagem */}
              <section className="rounded-xl border border-[#E8EAF0] bg-white p-4 space-y-3.5">
                <div>
                  <h4 className="text-xs font-bold text-[#172033]">
                    3. Código de barras, volume e embalagem
                  </h4>
                  <p className="text-[11px] text-[#778094]">
                    Campos opcionais e padronizados para leitura por código de barras, volume e estrutura de pacotes/fardos.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="prod-barcode"
                    className="block text-xs font-semibold text-[#172033] mb-1.5"
                  >
                    Código de barras (EAN / GTIN opcional)
                  </label>
                  <input
                    id="prod-barcode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={18}
                    placeholder="Digite ou utilize o leitor USB (8 a 14 dígitos)"
                    value={prodBarcode}
                    onChange={(e) => onProdBarcodeChange?.(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033] font-mono tabular-nums"
                  />
                  {barcodeDuplicateProductName ? (
                    <p className="text-[11px] font-medium text-[#B91C1C] mt-1">
                      Este código de barras já está cadastrado em &ldquo;{barcodeDuplicateProductName}&rdquo; neste estabelecimento.
                    </p>
                  ) : hasInvalidBarcodePreview ? (
                    <p className="text-[11px] font-medium text-[#B45309] mt-1">
                      Informe de 8 a 14 dígitos numéricos para o código de barras.
                    </p>
                  ) : (
                    <p className="text-[11px] text-[#778094] mt-1">
                      Compatível com leitores de código de barras em modo teclado (Enter automático protegido).
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="prod-volume-value"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Volume / Quantidade
                    </label>
                    <input
                      id="prod-volume-value"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder="Ex: 350, 473, 1, 2"
                      value={prodVolumeValue}
                      onChange={(e) => onProdVolumeValueChange?.(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033] font-mono tabular-nums"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="prod-volume-unit"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Unidade de medida
                    </label>
                    <select
                      id="prod-volume-unit"
                      value={prodVolumeUnit}
                      onChange={(e) => onProdVolumeUnitChange?.(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
                    >
                      <option value="">Não informar</option>
                      {PRODUCT_VOLUME_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {PRODUCT_VOLUME_UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="prod-sale-unit"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Unidade de venda
                    </label>
                    <select
                      id="prod-sale-unit"
                      value={prodSaleUnit}
                      onChange={(e) =>
                        onProdSaleUnitChange?.(e.target.value as ProductSaleUnit)
                      }
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
                    >
                      {PRODUCT_SALE_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {PRODUCT_SALE_UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  <div>
                    <label
                      htmlFor="prod-package-type"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Tipo de embalagem
                    </label>
                    <select
                      id="prod-package-type"
                      value={prodPackageType}
                      onChange={(e) => {
                        const nextPkg = e.target.value as ProductPackageType;
                        onProdPackageTypeChange?.(nextPkg);
                        if (nextPkg === 'individual') {
                          onProdUnitsPerPackageChange?.('1');
                        }
                      }}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
                    >
                      {PRODUCT_PACKAGE_TYPES.map((pkg) => (
                        <option key={pkg} value={pkg}>
                          {PRODUCT_PACKAGE_TYPE_LABELS[pkg]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="prod-units-per-package"
                      className="block text-xs font-semibold text-[#172033] mb-1.5"
                    >
                      Unidades por embalagem
                    </label>
                    <input
                      id="prod-units-per-package"
                      type="number"
                      min="1"
                      max="1000"
                      step="1"
                      inputMode="numeric"
                      value={prodUnitsPerPackage}
                      onChange={(e) => onProdUnitsPerPackageChange?.(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033] font-mono tabular-nums"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {[1, 6, 12, 24].map((presetQty) => (
                        <button
                          key={presetQty}
                          type="button"
                          onClick={() =>
                            onProdUnitsPerPackageChange?.(String(presetQty))
                          }
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-mono cursor-pointer transition-colors ${
                            prodUnitsPerPackage === String(presetQty)
                              ? 'bg-[#FFF2BE] border-[#F5B900] text-[#172033] font-bold'
                              : 'bg-[#F7F8FC] border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                          }`}
                        >
                          {presetQty === 1 ? '1 un' : `c/ ${presetQty}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="prod-name"
                    className="block text-xs font-semibold text-[#172033] mb-1.5"
                  >
                    Nome do produto
                  </label>
                  <input
                    id="prod-name"
                    type="text"
                    maxLength={80}
                    placeholder="Ex: X-Salada, Refrigerante Tuchaua 250 ml"
                    value={prodName}
                    onChange={(e) => onProdNameChange(e.target.value)}
                    required
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prod-cat"
                    className="block text-xs font-semibold text-[#172033] mb-1.5"
                  >
                    Categoria
                  </label>
                  <select
                    id="prod-cat"
                    value={prodCategory}
                    onChange={(e) =>
                      onProdCategoryChange(e.target.value as ProductCategory)
                    }
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div>
                  <label
                    htmlFor="prod-price"
                    className="block text-xs font-semibold text-[#172033] mb-1.5"
                  >
                    Preço de venda individual (R$)
                  </label>
                  <input
                    id="prod-price"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={prodPrice}
                    onChange={(e) => onProdPriceChange(e.target.value)}
                    required
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033] font-mono tabular-nums"
                  />
                </div>

                <div className="space-y-2.5 sm:pt-6">
                  <label className="flex items-center gap-2.5 text-xs font-medium text-[#172033] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodCountsXSalada}
                      onChange={(e) => onProdCountsXSaladaChange(e.target.checked)}
                      className="w-4 h-4 accent-[#F5B900] rounded"
                    />
                    <span>Contabiliza como X-Salada nos indicadores</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs font-medium text-[#172033] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodActive}
                      onChange={(e) => onProdActiveChange(e.target.checked)}
                      className="w-4 h-4 accent-[#F5B900] rounded"
                    />
                    <span>Produto ativo e disponível no cardápio</span>
                  </label>
                </div>
              </div>
            </>
          )}

          <section className="rounded-xl border border-[#E8EAF0] bg-white p-3.5 space-y-2.5">
            <div>
              <h4 className="text-xs font-bold text-[#172033]">
                Grupos de adicionais deste produto
              </h4>
              <p className="text-[11px] text-[#778094] mt-0.5">
                Selecione os grupos que o cliente poderá escolher no cardápio. Um
                grupo pode ser reutilizado em vários produtos.
              </p>
            </div>

            {addonGroups.length === 0 ? (
              <p className="text-xs text-[#778094] bg-[#F7F8FC] rounded-lg px-3 py-2">
                Nenhum grupo de adicionais cadastrado ainda. Crie grupos na aba
                Adicionais.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {addonGroups.map((group) => {
                  const checked = selectedAddonGroupIds.includes(group.id);
                  return (
                    <label
                      key={group.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#172033]'
                          : 'bg-[#F7F8FC]/60 border-[#E8EAF0] text-[#172033] hover:border-[#D5D9E4]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          onToggleAddonGroupId(group.id, e.target.checked)
                        }
                        className="w-4 h-4 mt-0.5 accent-[#F5B900] rounded shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold truncate">
                          {group.name}
                        </span>
                        <span className="block text-[11px] text-[#778094] font-mono tabular-nums mt-0.5">
                          {group.options.length}{' '}
                          {group.options.length === 1 ? 'opção' : 'opções'} ·{' '}
                          {group.isRequired ? 'Obrigatório' : 'Opcional'} (mín.{' '}
                          {group.minSelect} / máx. {group.maxSelect})
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <ImageUploadField
            label="Foto do produto (opcional)"
            helperText="Exibida nos cards e detalhes do cardápio digital."
            workspaceId={workspaceId}
            folder="products"
            entityHint={prodName || editingProduct?.id || 'produto'}
            entityId={editingProduct?.id || draftProductId}
            preset="catalog"
            valueUrl={prodImageUrl}
            valuePath={prodImagePath}
            savedPath={editingProduct?.imagePath || ''}
            onChange={onProdImageChange}
            onUploadingChange={onUploadingImageChange}
            disabled={saving}
          />
        </div>

        <footer className="px-5 py-3.5 border-t border-[#E8EAF0] bg-white flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="mgw-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || uploadingImage}
            className="mgw-btn-primary disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : uploadingImage ? (
              <span>Enviando foto...</span>
            ) : editingProduct ? (
              <span>Salvar Produto</span>
            ) : (
              <span>Cadastrar Produto</span>
            )}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

interface ComboFormModalProps {
  open: boolean;
  editingCombo: ComboRecord | null;
  draftComboId: string;
  workspaceId: string;
  products: ProductRecord[];
  comboName: string;
  onComboNameChange: (val: string) => void;
  comboPrice: string;
  onComboPriceChange: (val: string) => void;
  comboCost: string;
  onComboCostChange: (val: string) => void;
  comboDescription: string;
  onComboDescriptionChange: (val: string) => void;
  comboActive: boolean;
  onComboActiveChange: (val: boolean) => void;
  comboImageUrl: string;
  comboImagePath: string;
  onComboImageChange: (next: { url: string; path: string }) => void;
  uploadingImage: boolean;
  onUploadingImageChange: (uploading: boolean) => void;
  comboItems: ComboProductItem[];
  selectedProdToAdd: string;
  onSelectedProdToAddChange: (productId: string) => void;
  onAddProductToCombo: () => void;
  onUpdateComboItemQty: (productId: string, delta: number) => void;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function ComboFormModal({
  open,
  editingCombo,
  draftComboId,
  workspaceId,
  products,
  comboName,
  onComboNameChange,
  comboPrice,
  onComboPriceChange,
  comboCost,
  onComboCostChange,
  comboDescription,
  onComboDescriptionChange,
  comboActive,
  onComboActiveChange,
  comboImageUrl,
  comboImagePath,
  onComboImageChange,
  uploadingImage,
  onUploadingImageChange,
  comboItems,
  selectedProdToAdd,
  onSelectedProdToAddChange,
  onAddProductToCombo,
  onUpdateComboItemQty,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: ComboFormModalProps) {
  useEscapeClose(open, () => {
    if (!saving) onClose();
  });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-combo-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <form
        onSubmit={onSubmit}
        className="w-full sm:max-w-2xl max-h-[92vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3
              id="catalog-combo-modal-title"
              className="text-base font-extrabold text-[#172033] truncate"
            >
              {editingCombo
                ? `Editar ${editingCombo.name}`
                : 'Cadastrar Novo Combo'}
            </h3>
            <p className="text-xs text-[#778094] mt-0.5">
              Monte a composição dos produtos e configure o preço promocional.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Fechar formulário de combo"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] flex items-center justify-center text-[#778094] hover:text-[#172033] cursor-pointer shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 overflow-y-auto space-y-4 bg-[#F7F8FC]/40">
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="combo-name"
                className="block text-xs font-semibold text-[#172033] mb-1.5"
              >
                Nome do combo
              </label>
              <input
                id="combo-name"
                type="text"
                maxLength={80}
                placeholder="Ex: Combo 1, Combo Família"
                value={comboName}
                onChange={(e) => onComboNameChange(e.target.value)}
                required
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="combo-price"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Preço de venda (R$)
                </label>
                <input
                  id="combo-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="27,00"
                  value={comboPrice}
                  onChange={(e) => onComboPriceChange(e.target.value)}
                  required
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033] font-mono tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="combo-cost"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Custo est. (opcional)
                </label>
                <input
                  id="combo-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={comboCost}
                  onChange={(e) => onComboCostChange(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033] font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="combo-desc"
              className="block text-xs font-semibold text-[#172033] mb-1.5"
            >
              Descrição (opcional — preenchida automaticamente se vazio)
            </label>
            <input
              id="combo-desc"
              type="text"
              maxLength={240}
              placeholder="Ex: 2 X-Saladas + 1 Refrigerante Tuchaua 1 L"
              value={comboDescription}
              onChange={(e) => onComboDescriptionChange(e.target.value)}
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
            />
          </div>

          <section className="rounded-xl border border-[#E8EAF0] bg-white p-3.5 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-[#172033]">
                Produtos que compõem este combo
              </h4>
              <p className="text-[11px] text-[#778094] mt-0.5">
                Adicione os itens e ajuste as quantidades de cada produto.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <select
                aria-label="Selecionar produto para adicionar ao combo"
                value={selectedProdToAdd}
                onChange={(e) => onSelectedProdToAddChange(e.target.value)}
                className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {!p.active ? '(Inativo)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onAddProductToCombo}
                className="min-h-[42px] px-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] hover:bg-[#FFF2BE] text-[#8A6200] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar produto</span>
              </button>
            </div>

            {comboItems.length === 0 ? (
              <p className="text-xs text-[#778094] bg-[#F7F8FC] rounded-lg px-3 py-2">
                Nenhum produto adicionado ao combo ainda.
              </p>
            ) : (
              <div className="divide-y divide-[#E8EAF0] border border-[#E8EAF0] rounded-xl bg-[#F7F8FC]/60">
                {comboItems.map((item) => (
                  <div
                    key={item.productId}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-[#172033] truncate">
                        {item.productName}
                      </p>
                      {item.countsAsXSalada && (
                        <p className="text-[11px] font-medium text-[#16A36A]">
                          Contabiliza como X-Salada
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUpdateComboItemQty(item.productId, -1)}
                        aria-label={`Diminuir quantidade de ${item.productName}`}
                        className="w-8 h-8 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#F5B900] flex items-center justify-center text-[#172033] cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-bold text-[#172033] font-mono tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateComboItemQty(item.productId, 1)}
                        aria-label={`Aumentar quantidade de ${item.productName}`}
                        className="w-8 h-8 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#F5B900] flex items-center justify-center text-[#172033] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateComboItemQty(item.productId, -item.quantity)
                        }
                        aria-label={`Remover ${item.productName} do combo`}
                        className="w-8 h-8 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#FECACA] hover:bg-[#FEF2F2] flex items-center justify-center text-[#778094] hover:text-[#E35D62] cursor-pointer ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <ImageUploadField
            label="Foto do combo (opcional)"
            helperText="Exibida no cardápio digital para destacar este combo."
            workspaceId={workspaceId}
            folder="combos"
            entityHint={comboName || editingCombo?.id || 'combo'}
            entityId={editingCombo?.id || draftComboId}
            preset="catalog"
            valueUrl={comboImageUrl}
            valuePath={comboImagePath}
            savedPath={editingCombo?.imagePath || ''}
            onChange={onComboImageChange}
            onUploadingChange={onUploadingImageChange}
            disabled={saving}
          />

          <label className="inline-flex items-center gap-2.5 text-xs font-medium text-[#172033] cursor-pointer">
            <input
              type="checkbox"
              checked={comboActive}
              onChange={(e) => onComboActiveChange(e.target.checked)}
              className="w-4 h-4 accent-[#F5B900] rounded"
            />
            <span>Combo ativo (disponível na tela de Nova Venda e cardápio)</span>
          </label>
        </div>

        <footer className="px-5 py-3.5 border-t border-[#E8EAF0] bg-white flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="mgw-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || uploadingImage}
            className="mgw-btn-primary disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : uploadingImage ? (
              <span>Enviando foto...</span>
            ) : editingCombo ? (
              <span>Salvar Alterações</span>
            ) : (
              <span>Cadastrar Combo</span>
            )}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

interface CategoryEditModalProps {
  open: boolean;
  editingCategory: CatalogCategoryRecord | null;
  nameDraft: string;
  onNameDraftChange: (val: string) => void;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function CategoryFormModal({
  open,
  editingCategory,
  nameDraft,
  onNameDraftChange,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: CategoryEditModalProps) {
  useEscapeClose(open, () => {
    if (!saving) onClose();
  });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-category-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <form
        onSubmit={onSubmit}
        className="w-full sm:max-w-md bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3">
          <div>
            <h3
              id="catalog-category-modal-title"
              className="text-base font-extrabold text-[#172033]"
            >
              {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </h3>
            <p className="text-xs text-[#778094] mt-0.5">
              Organize seus produtos por seções no cardápio.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Fechar formulário de categoria"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] flex items-center justify-center text-[#778094] hover:text-[#172033] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-4 bg-[#F7F8FC]/40">
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="cat-name-input"
              className="block text-xs font-semibold text-[#172033] mb-1.5"
            >
              Nome da categoria
            </label>
            <input
              id="cat-name-input"
              type="text"
              maxLength={60}
              required
              placeholder="Ex: Pastéis, Kikão, Porções, Bebidas"
              value={nameDraft}
              onChange={(e) => onNameDraftChange(e.target.value)}
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
            />
          </div>

          {editingCategory && editingCategory.productCount > 0 && (
            <p className="text-xs text-[#778094] bg-white border border-[#E8EAF0] rounded-xl px-3 py-2.5">
              Esta categoria possui{' '}
              <strong className="text-[#172033] font-mono tabular-nums">
                {editingCategory.productCount}
              </strong>{' '}
              {editingCategory.productCount === 1
                ? 'produto associado, que será atualizado automaticamente.'
                : 'produtos associados, que serão atualizados automaticamente.'}
            </p>
          )}
        </div>

        <footer className="px-5 py-3.5 border-t border-[#E8EAF0] bg-white flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="mgw-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="mgw-btn-primary disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : editingCategory ? (
              <span>Salvar Categoria</span>
            ) : (
              <span>Criar Categoria</span>
            )}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

interface AddonGroupFormModalProps {
  open: boolean;
  editingGroup: CatalogAddonGroup | null;
  nameDraft: string;
  onNameDraftChange: (val: string) => void;
  ruleDraft: AddonGroupRuleInput;
  onRuleDraftChange: (next: AddonGroupRuleInput) => void;
  products: ProductRecord[];
  linkedProductIds: string[];
  onToggleLinkedProduct: (productId: string, checked: boolean) => void;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AddonGroupFormModal({
  open,
  editingGroup,
  nameDraft,
  onNameDraftChange,
  ruleDraft,
  onRuleDraftChange,
  products,
  linkedProductIds,
  onToggleLinkedProduct,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: AddonGroupFormModalProps) {
  useEscapeClose(open, () => {
    if (!saving) onClose();
  });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-addon-group-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <form
        onSubmit={onSubmit}
        className="w-full sm:max-w-lg max-h-[92vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3 shrink-0">
          <div>
            <h3
              id="catalog-addon-group-modal-title"
              className="text-base font-extrabold text-[#172033]"
            >
              {editingGroup
                ? `Editar Grupo: ${editingGroup.name}`
                : 'Novo Grupo de Adicionais'}
            </h3>
            <p className="text-xs text-[#778094] mt-0.5">
              Configure nome, obrigatoriedade, limites e produtos vinculados.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Fechar formulário de grupo"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] flex items-center justify-center text-[#778094] hover:text-[#172033] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 overflow-y-auto space-y-4 bg-[#F7F8FC]/40">
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="addon-group-name-input"
              className="block text-xs font-semibold text-[#172033] mb-1.5"
            >
              Nome do grupo
            </label>
            <input
              id="addon-group-name-input"
              type="text"
              maxLength={80}
              required
              placeholder="Ex: Sabores de pastel, Adicionais extras"
              value={nameDraft}
              onChange={(e) => onNameDraftChange(e.target.value)}
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
            />
          </div>

          <div className="bg-white border border-[#E8EAF0] rounded-xl p-3.5 space-y-3">
            <p className="text-xs font-bold text-[#172033]">
              Regras de seleção no cardápio
            </p>
            <label className="flex items-center gap-2.5 text-xs font-medium text-[#172033] cursor-pointer">
              <input
                type="checkbox"
                checked={ruleDraft.isRequired}
                onChange={(e) => {
                  const nextReq = e.target.checked;
                  onRuleDraftChange({
                    ...ruleDraft,
                    isRequired: nextReq,
                    minSelect: nextReq
                      ? Math.max(1, ruleDraft.minSelect || 1)
                      : ruleDraft.minSelect,
                    maxSelect: nextReq
                      ? Math.max(ruleDraft.maxSelect, Math.max(1, ruleDraft.minSelect || 1))
                      : ruleDraft.maxSelect,
                  });
                }}
                className="w-4 h-4 accent-[#F5B900] rounded"
              />
              <span>Seleção obrigatória para o cliente</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="addon-group-min"
                  className="block text-[11px] font-semibold text-[#778094] mb-1"
                >
                  Mínimo de escolhas
                </label>
                <input
                  id="addon-group-min"
                  type="number"
                  min={ruleDraft.isRequired ? 1 : 0}
                  max={30}
                  value={ruleDraft.minSelect}
                  onChange={(e) =>
                    onRuleDraftChange({
                      ...ruleDraft,
                      minSelect: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                    })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm font-mono tabular-nums text-[#172033]"
                />
              </div>

              <div>
                <label
                  htmlFor="addon-group-max"
                  className="block text-[11px] font-semibold text-[#778094] mb-1"
                >
                  Máximo de escolhas
                </label>
                <input
                  id="addon-group-max"
                  type="number"
                  min={1}
                  max={30}
                  value={ruleDraft.maxSelect}
                  onChange={(e) =>
                    onRuleDraftChange({
                      ...ruleDraft,
                      maxSelect: Math.max(1, Math.trunc(Number(e.target.value) || 1)),
                    })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm font-mono tabular-nums text-[#172033]"
                />
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E8EAF0] rounded-xl p-3.5 space-y-2.5">
            <div>
              <p className="text-xs font-bold text-[#172033]">
                Produtos associados a este grupo
              </p>
              <p className="text-[11px] text-[#778094] mt-0.5">
                Escolha em quais produtos este grupo será exibido.
              </p>
            </div>
            {products.length === 0 ? (
              <p className="text-xs text-[#778094]">
                Nenhum produto cadastrado ainda.
              </p>
            ) : (
              <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                {products.map((prod) => {
                  const checked = linkedProductIds.includes(prod.id);
                  return (
                    <label
                      key={prod.id}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#172033]'
                          : 'bg-[#F7F8FC]/60 border-[#E8EAF0] text-[#172033]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          onToggleLinkedProduct(prod.id, e.target.checked)
                        }
                        className="w-3.5 h-3.5 accent-[#F5B900] rounded shrink-0"
                      />
                      <span className="truncate font-medium">{prod.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <footer className="px-5 py-3.5 border-t border-[#E8EAF0] bg-white flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="mgw-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="mgw-btn-primary disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : editingGroup ? (
              <span>Salvar Grupo</span>
            ) : (
              <span>Criar Grupo</span>
            )}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

interface AddonOptionEditModalProps {
  open: boolean;
  option: CatalogAddonOption | null;
  groupName: string;
  nameDraft: string;
  onNameDraftChange: (val: string) => void;
  priceDraft: string;
  onPriceDraftChange: (val: string) => void;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AddonOptionEditModal({
  open,
  option,
  groupName,
  nameDraft,
  onNameDraftChange,
  priceDraft,
  onPriceDraftChange,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: AddonOptionEditModalProps) {
  useEscapeClose(open, () => {
    if (!saving) onClose();
  });

  if (!open || !option || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-addon-option-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <form
        onSubmit={onSubmit}
        className="w-full sm:max-w-md bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3">
          <div>
            <h3
              id="catalog-addon-option-modal-title"
              className="text-base font-extrabold text-[#172033]"
            >
              Editar Adicional
            </h3>
            <p className="text-xs text-[#778094] mt-0.5 truncate">
              Grupo: {groupName}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Fechar edição de adicional"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] flex items-center justify-center text-[#778094] hover:text-[#172033] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-4 bg-[#F7F8FC]/40">
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="addon-opt-edit-name"
              className="block text-xs font-semibold text-[#172033] mb-1.5"
            >
              Nome da opção ou sabor
            </label>
            <input
              id="addon-opt-edit-name"
              type="text"
              maxLength={80}
              required
              value={nameDraft}
              onChange={(e) => onNameDraftChange(e.target.value)}
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm text-[#172033]"
            />
          </div>

          <div>
            <label
              htmlFor="addon-opt-edit-price"
              className="block text-xs font-semibold text-[#172033] mb-1.5"
            >
              Preço adicional (R$)
            </label>
            <input
              id="addon-opt-edit-price"
              type="number"
              min="0"
              max="10000"
              step="0.01"
              inputMode="decimal"
              required
              value={priceDraft}
              onChange={(e) => onPriceDraftChange(e.target.value)}
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-sm font-mono tabular-nums text-[#172033]"
            />
            <p className="text-[11px] text-[#778094] mt-1">
              Informe {formatCurrencyBRL(0)} se este sabor/adicional for sem
              custo extra.
            </p>
          </div>
        </div>

        <footer className="px-5 py-3.5 border-t border-[#E8EAF0] bg-white flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="mgw-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="mgw-btn-primary disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <span>Salvar Opção</span>
            )}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

interface CatalogConfirmDeleteModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CatalogConfirmDeleteModal({
  open,
  title,
  description,
  confirmLabel = 'Confirmar exclusão',
  busy,
  onCancel,
  onConfirm,
}: CatalogConfirmDeleteModalProps) {
  useEscapeClose(open, () => {
    if (!busy) onCancel();
  });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-confirm-delete-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] overflow-hidden">
        <div className="p-5 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-[#FEF2F2] border border-[#FECACA] text-[#E35D62] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3
              id="catalog-confirm-delete-title"
              className="text-base font-extrabold text-[#172033]"
            >
              {title}
            </h3>
            <p className="text-xs sm:text-[13px] text-[#778094] mt-1 leading-relaxed">
              {description}
            </p>
          </div>
        </div>
        <footer className="px-5 py-3.5 border-t border-[#E8EAF0] bg-[#F7F8FC]/60 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="mgw-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="min-h-[40px] px-4 rounded-[10px] bg-[#E35D62] hover:bg-[#DC2626] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors"
          >
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processando...</span>
              </>
            ) : (
              <span>{confirmLabel}</span>
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
