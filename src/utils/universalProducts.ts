import type {
  ProductInput,
  ProductPackageType,
  ProductRecord,
  ProductSaleUnit,
  ProductVolumeUnit,
} from '../types/finance';
import type { BusinessSegment } from '../types/segments';
import { roundCurrency } from './finance';

export const PRODUCT_VOLUME_UNITS: readonly ProductVolumeUnit[] = [
  'ml',
  'l',
  'g',
  'kg',
  'un',
] as const;

export const PRODUCT_SALE_UNITS: readonly ProductSaleUnit[] = [
  'unidade',
  'garrafa',
  'lata',
  'pacote',
  'caixa',
  'fardo',
] as const;

export const PRODUCT_PACKAGE_TYPES: readonly ProductPackageType[] = [
  'individual',
  'pacote',
  'caixa',
  'fardo',
] as const;

export const PRODUCT_VOLUME_UNIT_LABELS: Record<ProductVolumeUnit, string> = {
  ml: 'ml (mililitros)',
  l: 'L (litros)',
  g: 'g (gramas)',
  kg: 'kg (quilos)',
  un: 'un (unidades)',
};

export const PRODUCT_VOLUME_UNIT_SHORT: Record<ProductVolumeUnit, string> = {
  ml: 'ml',
  l: 'L',
  g: 'g',
  kg: 'kg',
  un: 'un',
};

export const PRODUCT_SALE_UNIT_LABELS: Record<ProductSaleUnit, string> = {
  unidade: 'Unidade',
  garrafa: 'Garrafa',
  lata: 'Lata',
  pacote: 'Pacote',
  caixa: 'Caixa',
  fardo: 'Fardo',
};

export const PRODUCT_PACKAGE_TYPE_LABELS: Record<ProductPackageType, string> = {
  individual: 'Individual (avulso)',
  pacote: 'Pacote',
  caixa: 'Caixa',
  fardo: 'Fardo',
};

export const MAX_PRODUCT_MONEY_VALUE = 100_000;
export const MAX_PRODUCT_VOLUME_VALUE = 100_000;
export const MAX_UNITS_PER_PACKAGE = 1_000;

export interface ProductFinancialMetrics {
  unitPrice: number;
  costPrice: number;
  hasValidCost: boolean;
  /** Lucro bruto unitario (preco de venda - custo de aquisicao). Nao representa lucro liquido. */
  grossProfitPerUnit: number | null;
  /** Margem bruta percentual sobre o preco de venda: ((venda - custo) / venda) * 100. */
  marginPercent: number | null;
}

export function normalizeVolumeUnit(
  raw: unknown,
): ProductVolumeUnit | undefined {
  if (typeof raw !== 'string') return undefined;
  const clean = raw.trim().toLowerCase();
  if ((PRODUCT_VOLUME_UNITS as readonly string[]).includes(clean)) {
    return clean as ProductVolumeUnit;
  }
  return undefined;
}

export function normalizeSaleUnit(raw: unknown): ProductSaleUnit {
  if (typeof raw !== 'string') return 'unidade';
  const clean = raw.trim().toLowerCase();
  if ((PRODUCT_SALE_UNITS as readonly string[]).includes(clean)) {
    return clean as ProductSaleUnit;
  }
  return 'unidade';
}

export function normalizePackageType(raw: unknown): ProductPackageType {
  if (typeof raw !== 'string') return 'individual';
  const clean = raw.trim().toLowerCase();
  if ((PRODUCT_PACKAGE_TYPES as readonly string[]).includes(clean)) {
    return clean as ProductPackageType;
  }
  return 'individual';
}

export function normalizeBarcodeInput(raw?: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.replace(/\s+/g, '').trim();
  return normalized.length > 0 ? normalized : null;
}

export function isValidBarcodeFormat(barcode: string): boolean {
  return /^[0-9]{8,14}$/.test(barcode);
}

/**
 * Calcula lucro bruto unitario e margem bruta sobre o preco de venda.
 * Evita divisao por zero e retorna null quando nao ha custo valido informado.
 */
export function calculateProductFinancials(params: {
  unitPrice: number;
  costPrice?: number | null;
}): ProductFinancialMetrics {
  const safeUnitPrice =
    Number.isFinite(params.unitPrice) && params.unitPrice >= 0
      ? roundCurrency(params.unitPrice)
      : 0;
  const rawCost = params.costPrice ?? 0;
  const safeCostPrice =
    Number.isFinite(rawCost) && rawCost >= 0 ? roundCurrency(rawCost) : 0;

  if (safeCostPrice <= 0) {
    return {
      unitPrice: safeUnitPrice,
      costPrice: safeCostPrice,
      hasValidCost: false,
      grossProfitPerUnit: null,
      marginPercent: null,
    };
  }

  const grossProfitPerUnit = roundCurrency(safeUnitPrice - safeCostPrice);
  const marginPercent =
    safeUnitPrice > 0
      ? Number((((safeUnitPrice - safeCostPrice) / safeUnitPrice) * 100).toFixed(2))
      : null;

  return {
    unitPrice: safeUnitPrice,
    costPrice: safeCostPrice,
    hasValidCost: true,
    grossProfitPerUnit,
    marginPercent,
  };
}

export function findProductByBarcode(
  products: readonly ProductRecord[],
  barcode: string | null | undefined,
  excludeProductId?: string,
): ProductRecord | undefined {
  const clean = normalizeBarcodeInput(barcode);
  if (!clean) return undefined;
  return products.find((p) => {
    if (excludeProductId && p.id === excludeProductId) return false;
    return normalizeBarcodeInput(p.barcode) === clean;
  });
}

export function collectTenantBrands(products: readonly ProductRecord[]): string[] {
  const seen = new Map<string, string>();
  for (const product of products) {
    const clean = (product.brand || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, clean);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function formatProductVolumeLabel(
  volumeValue?: number | null,
  volumeUnit?: ProductVolumeUnit | null,
): string {
  if (!volumeValue || !Number.isFinite(volumeValue) || volumeValue <= 0 || !volumeUnit) {
    return '';
  }
  const formattedNumber = Number.isInteger(volumeValue)
    ? String(volumeValue)
    : String(Number(volumeValue.toFixed(3))).replace('.', ',');
  return `${formattedNumber} ${PRODUCT_VOLUME_UNIT_SHORT[volumeUnit]}`;
}

export function formatProductPackagingLabel(product: {
  saleUnit?: ProductSaleUnit;
  packageType?: ProductPackageType;
  unitsPerPackage?: number;
}): string {
  const saleUnit = normalizeSaleUnit(product.saleUnit);
  const packageType = normalizePackageType(product.packageType);
  const units =
    product.unitsPerPackage && Number.isInteger(product.unitsPerPackage) && product.unitsPerPackage > 1
      ? product.unitsPerPackage
      : 1;

  if (packageType !== 'individual' && units > 1) {
    return `${PRODUCT_PACKAGE_TYPE_LABELS[packageType]} c/ ${units} un`;
  }
  if (saleUnit !== 'unidade') {
    return PRODUCT_SALE_UNIT_LABELS[saleUnit];
  }
  return '';
}

export function hasExplicitUniversalProductFields(input: ProductInput): boolean {
  return (
    input.description !== undefined ||
    input.internalCode !== undefined ||
    input.costPrice !== undefined ||
    input.brand !== undefined ||
    input.notes !== undefined ||
    input.barcode !== undefined ||
    input.volumeValue !== undefined ||
    input.volumeUnit !== undefined ||
    input.saleUnit !== undefined ||
    input.packageType !== undefined ||
    input.unitsPerPackage !== undefined
  );
}

/**
 * Preserva todos os campos universais do produto ao alternar ativo/inativo
 * ou renomear categoria, evitando perda silenciosa de dados.
 */
export function buildProductInputFromRecord(
  product: ProductRecord,
  overrides: Partial<ProductInput> = {},
): ProductInput {
  const base: ProductInput = {
    name: product.name,
    category: product.category,
    unitPrice: product.unitPrice,
    countsAsXSalada: product.countsAsXSalada,
    active: product.active,
    imageUrl: product.imageUrl || '',
    imagePath: product.imagePath || '',
  };

  if (product.description !== undefined) base.description = product.description;
  if (product.internalCode !== undefined) base.internalCode = product.internalCode;
  if (product.costPrice !== undefined) base.costPrice = product.costPrice;
  if (product.brand !== undefined) base.brand = product.brand;
  if (product.notes !== undefined) base.notes = product.notes;
  if (product.barcode !== undefined) base.barcode = product.barcode;
  if (product.volumeValue !== undefined) base.volumeValue = product.volumeValue;
  if (product.volumeUnit !== undefined) base.volumeUnit = product.volumeUnit;
  if (product.saleUnit !== undefined) base.saleUnit = product.saleUnit;
  if (product.packageType !== undefined) base.packageType = product.packageType;
  if (product.unitsPerPackage !== undefined) base.unitsPerPackage = product.unitsPerPackage;

  return {
    ...base,
    ...overrides,
  };
}

export function parseLocaleDecimalInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return Number.NaN;
  return Number(trimmed.replace(',', '.'));
}

export interface UniversalProductValidationInput {
  name: string;
  category: string;
  unitPriceRaw: string | number;
  costPriceRaw?: string | number;
  description?: string;
  internalCode?: string;
  brand?: string;
  notes?: string;
  barcode?: string;
  volumeValueRaw?: string | number | null;
  volumeUnit?: string | null;
  saleUnit?: string | null;
  packageType?: string | null;
  unitsPerPackageRaw?: string | number;
  countsAsXSalada?: boolean;
  active?: boolean;
  imageUrl?: string;
  imagePath?: string;
}

export function validateUniversalProductInput(
  raw: UniversalProductValidationInput,
  existingProducts: readonly ProductRecord[],
  options: {
    editingProductId?: string;
    segment?: BusinessSegment;
  } = {},
): ProductInput {
  const cleanName = raw.name.trim().slice(0, 80);
  if (!cleanName) {
    throw new Error('Informe o nome do produto.');
  }

  const cleanCategory = raw.category.trim().slice(0, 60);
  if (!cleanCategory) {
    throw new Error('Selecione ou informe a categoria do produto.');
  }

  const unitPrice =
    typeof raw.unitPriceRaw === 'number'
      ? raw.unitPriceRaw
      : parseLocaleDecimalInput(String(raw.unitPriceRaw));

  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > MAX_PRODUCT_MONEY_VALUE) {
    throw new Error('Informe um preço de venda válido (não negativo).');
  }

  const costRawStr =
    raw.costPriceRaw === undefined || raw.costPriceRaw === null
      ? ''
      : String(raw.costPriceRaw).trim();
  const costPrice =
    costRawStr === ''
      ? 0
      : typeof raw.costPriceRaw === 'number'
        ? raw.costPriceRaw
        : parseLocaleDecimalInput(costRawStr);

  if (!Number.isFinite(costPrice) || costPrice < 0 || costPrice > MAX_PRODUCT_MONEY_VALUE) {
    throw new Error('Informe um custo de aquisição válido (maior ou igual a zero).');
  }

  const cleanBarcode = normalizeBarcodeInput(raw.barcode);
  if (cleanBarcode !== null) {
    if (!isValidBarcodeFormat(cleanBarcode)) {
      throw new Error('Código de barras inválido. Use de 8 a 14 dígitos numéricos.');
    }
    const duplicate = findProductByBarcode(
      existingProducts,
      cleanBarcode,
      options.editingProductId,
    );
    if (duplicate) {
      throw new Error(
        `Este código de barras já está cadastrado em "${duplicate.name}" neste estabelecimento.`,
      );
    }
  }

  const volStr =
    raw.volumeValueRaw === undefined || raw.volumeValueRaw === null
      ? ''
      : String(raw.volumeValueRaw).trim();
  const rawUnit = (raw.volumeUnit || '').trim().toLowerCase();
  let volumeValue: number | null = null;
  let volumeUnit: ProductVolumeUnit | null = null;

  if (volStr !== '' || rawUnit !== '') {
    if (volStr === '' || rawUnit === '') {
      throw new Error('Informe o volume/quantidade junto com a unidade de medida.');
    }
    const parsedVol =
      typeof raw.volumeValueRaw === 'number'
        ? raw.volumeValueRaw
        : parseLocaleDecimalInput(volStr);
    if (!Number.isFinite(parsedVol) || parsedVol <= 0 || parsedVol > MAX_PRODUCT_VOLUME_VALUE) {
      throw new Error('O volume ou quantidade deve ser maior que zero.');
    }
    const normalizedUnit = normalizeVolumeUnit(rawUnit);
    if (!normalizedUnit) {
      throw new Error('Selecione uma unidade de medida válida (ml, L, g, kg ou un).');
    }
    volumeValue = Number(parsedVol.toFixed(3));
    volumeUnit = normalizedUnit;
  }

  const saleUnit = normalizeSaleUnit(raw.saleUnit);
  const packageType = normalizePackageType(raw.packageType);

  const unitsStr =
    raw.unitsPerPackageRaw === undefined || raw.unitsPerPackageRaw === null
      ? ''
      : String(raw.unitsPerPackageRaw).trim();
  const unitsPerPackage =
    unitsStr === '' ? 1 : Number(unitsStr);

  if (
    !Number.isInteger(unitsPerPackage) ||
    unitsPerPackage < 1 ||
    unitsPerPackage > MAX_UNITS_PER_PACKAGE
  ) {
    throw new Error('Unidades por embalagem deve ser um número inteiro maior ou igual a 1.');
  }

  const cleanInternalCode = (raw.internalCode || '').trim().slice(0, 40) || null;
  const cleanDescription = (raw.description || '').trim().slice(0, 400);
  const cleanBrand = (raw.brand || '').trim().slice(0, 80);
  const cleanNotes = (raw.notes || '').trim().slice(0, 400);

  return {
    name: cleanName,
    category: cleanCategory,
    unitPrice: roundCurrency(unitPrice),
    countsAsXSalada:
      options.segment === 'adega' ? false : Boolean(raw.countsAsXSalada),
    active: raw.active !== false,
    imageUrl: (raw.imageUrl || '').trim(),
    imagePath: (raw.imagePath || '').trim(),
    description: cleanDescription,
    internalCode: cleanInternalCode,
    costPrice: roundCurrency(costPrice),
    brand: cleanBrand,
    notes: cleanNotes,
    barcode: cleanBarcode,
    volumeValue,
    volumeUnit,
    saleUnit,
    packageType,
    unitsPerPackage,
  };
}
