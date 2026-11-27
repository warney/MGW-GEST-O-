import {
  PRODUCT_CATEGORIES,
  type ComboRecord,
  type ProductRecord,
} from '../types/finance';

export type CatalogSectionTab = 'products' | 'combos' | 'categories' | 'addons';
export type CatalogStatusFilter = 'all' | 'active' | 'inactive';

export interface CatalogCategoryRecord {
  id?: string;
  name: string;
  sortOrder: number;
  active: boolean;
  isPersisted: boolean;
  productCount: number;
  activeProductCount: number;
}

export interface CatalogAddonOption {
  id: string;
  groupId: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
}

export interface CatalogAddonGroup {
  id: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  active: boolean;
  sortOrder: number;
  options: CatalogAddonOption[];
  linkedProductIds: string[];
}

export interface AddonGroupRuleInput {
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
}

export interface RawCategoryRow {
  id?: string;
  name: string;
  sort_order?: number;
  active?: boolean;
}

export function buildCatalogCategories(
  dbCategories: RawCategoryRow[],
  products: ProductRecord[],
): CatalogCategoryRecord[] {
  const countsByLower = new Map<string, { total: number; active: number; rawName: string }>();

  for (const product of products) {
    const clean = product.category.trim() || 'Outro';
    const key = clean.toLowerCase();
    const cur = countsByLower.get(key) ?? { total: 0, active: 0, rawName: clean };
    cur.total += 1;
    if (product.active) cur.active += 1;
    countsByLower.set(key, cur);
  }

  const seen = new Set<string>();
  const result: CatalogCategoryRecord[] = [];

  for (const row of dbCategories) {
    const clean = String(row.name || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const counts = countsByLower.get(key);
    result.push({
      id: row.id ? String(row.id) : undefined,
      name: clean,
      sortOrder: Number(row.sort_order) || result.length,
      active: row.active !== false,
      isPersisted: Boolean(row.id),
      productCount: counts?.total ?? 0,
      activeProductCount: counts?.active ?? 0,
    });
  }

  // Also include any category currently used by products or legacy defaults if no DB categories yet
  for (const [key, counts] of countsByLower.entries()) {
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      name: counts.rawName,
      sortOrder: result.length,
      active: true,
      isPersisted: false,
      productCount: counts.total,
      activeProductCount: counts.active,
    });
  }

  if (result.length === 0) {
    for (const def of PRODUCT_CATEGORIES) {
      result.push({
        name: def,
        sortOrder: result.length,
        active: true,
        isPersisted: false,
        productCount: 0,
        activeProductCount: 0,
      });
    }
  }

  return result.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'));
}

export function buildSelectableCategoryNames(
  categories: CatalogCategoryRecord[],
): string[] {
  const activeNames = categories
    .filter((c) => c.active)
    .map((c) => c.name);
  if (activeNames.length > 0) {
    return activeNames;
  }
  return PRODUCT_CATEGORIES.slice();
}

export function filterProductsForCatalog(
  products: ProductRecord[],
  filters: {
    search: string;
    category: string;
    status: CatalogStatusFilter;
  },
): ProductRecord[] {
  const query = filters.search.trim().toLowerCase();
  return products.filter((p) => {
    if (filters.status === 'active' && !p.active) return false;
    if (filters.status === 'inactive' && p.active) return false;
    if (
      filters.category !== 'all' &&
      p.category.trim().toLowerCase() !== filters.category.trim().toLowerCase()
    ) {
      return false;
    }
    if (query) {
      const volumeText =
        p.volumeValue && p.volumeUnit ? `${p.volumeValue}${p.volumeUnit} ${p.volumeValue} ${p.volumeUnit}` : '';
      const hay = `${p.name} ${p.category} ${p.unitPrice.toFixed(2)} ${p.brand || ''} ${p.barcode || ''} ${p.internalCode || ''} ${p.description || ''} ${volumeText}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

export function filterCombosForCatalog(
  combos: ComboRecord[],
  filters: {
    search: string;
    status: CatalogStatusFilter;
    category?: string;
  },
): ComboRecord[] {
  const query = filters.search.trim().toLowerCase();
  const catFilter = (filters.category || 'all').trim().toLowerCase();
  return combos.filter((c) => {
    if (filters.status === 'active' && !c.active) return false;
    if (filters.status === 'inactive' && c.active) return false;
    if (catFilter !== 'all') {
      const comboCat = (c.category || '').trim().toLowerCase();
      if (comboCat !== catFilter) return false;
    }
    if (query) {
      const itemsText = c.items.map((i) => i.productName).join(' ');
      const hay = `${c.name} ${c.description} ${c.category || ''} ${itemsText}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

export function filterAddonGroupsForCatalog(
  groups: CatalogAddonGroup[],
  search: string,
): CatalogAddonGroup[] {
  const query = search.trim().toLowerCase();
  if (!query) return groups;
  return groups.filter((g) => {
    const optionsText = g.options.map((o) => o.name).join(' ');
    const hay = `${g.name} ${optionsText}`.toLowerCase();
    return hay.includes(query);
  });
}

export function validateAddonGroupRules(rule: AddonGroupRuleInput): string | null {
  if (!Number.isInteger(rule.minSelect) || rule.minSelect < 0) {
    return 'A seleção mínima deve ser maior ou igual a 0.';
  }
  if (!Number.isInteger(rule.maxSelect) || rule.maxSelect < 1 || rule.maxSelect > 30) {
    return 'A seleção máxima deve ficar entre 1 e 30.';
  }
  if (rule.minSelect > rule.maxSelect) {
    return 'A seleção mínima não pode ser maior que a máxima.';
  }
  if (rule.isRequired && rule.minSelect < 1) {
    return 'Grupos obrigatórios precisam de seleção mínima igual ou maior que 1.';
  }
  return null;
}

export function computeCatalogStats(
  products: ProductRecord[],
  combos: ComboRecord[],
  categories: CatalogCategoryRecord[],
  addonGroups: CatalogAddonGroup[],
) {
  const activeProductsCount = products.filter((p) => p.active).length;
  const activeCombosCount = combos.filter((c) => c.active).length;
  const activeCategoriesCount = categories.filter((c) => c.active).length;
  const totalAddonOptionsCount = addonGroups.reduce(
    (acc, g) => acc + g.options.filter((o) => o.active !== false).length,
    0,
  );

  return {
    totalProductsCount: products.length,
    activeProductsCount,
    totalCombosCount: combos.length,
    activeCombosCount,
    totalCategoriesCount: categories.length,
    activeCategoriesCount,
    totalAddonGroupsCount: addonGroups.length,
    totalAddonOptionsCount,
  };
}
