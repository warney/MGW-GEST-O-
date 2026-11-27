import type {
  ComboAvailabilityComponentDetail,
  ComboAvailabilityResult,
  ComboComponentInput,
  ComboComponentRecord,
  ComboInput,
  ComboProductItem,
  ComboRecord,
  InventoryBalanceRecord,
  InventoryPackagingConversionRecord,
  ProductRecord,
} from '../types/finance';
import { roundCurrency } from './finance';
import { createInventoryIdempotencyKey, roundQty, roundUnitCost } from './inventory';

export const ADEGA_COMBO_CATEGORIES = [
  'Combos de Gin',
  'Combos de Whisky',
  'Combos de Vodka',
  'Combos de Cerveja',
  'Tabacaria & Conveniência',
  'Festas & Eventos',
  'Outros Combos',
] as const;

export interface ResolvedComboComponentDraft {
  product: ProductRecord;
  quantity: number;
  unitLabel: string;
  conversionFactor: number;
  packagingConversionId: string | null;
  baseQuantity: number;
  unitCost: number;
  totalCost: number;
  standaloneUnitPrice: number;
  standaloneLineTotal: number;
}

export interface ComboCompositionMetrics {
  componentsCount: number;
  totalBaseUnits: number;
  realComponentCost: number;
  standaloneTotalPrice: number;
  salePrice: number;
  estimatedProfit: number;
  marginPercent: number | null;
  savingsVsStandalone: number;
  components: ResolvedComboComponentDraft[];
}

export function createComboConsumptionIdempotencyKey(prefix = 'cmb'): string {
  return createInventoryIdempotencyKey(prefix);
}

/**
 * Resolve o custo unitario efetivo do produto na base (unidade/garrafa/lata):
 * prioridade 1 = custo medio ponderado do estoque (Etapa 4),
 * prioridade 2 = costPrice cadastrado no produto (Etapa 3),
 * prioridade 3 = lastCostPrice do saldo ou 0.
 */
export function resolveComponentUnitCost(
  product: Pick<ProductRecord, 'costPrice'>,
  balance?: Pick<InventoryBalanceRecord, 'averageUnitCost' | 'lastCostPrice'> | null,
): number {
  const avg = Number(balance?.averageUnitCost ?? 0);
  if (Number.isFinite(avg) && avg > 0) {
    return roundUnitCost(avg);
  }
  const prodCost = Number(product.costPrice ?? 0);
  if (Number.isFinite(prodCost) && prodCost > 0) {
    return roundUnitCost(prodCost);
  }
  const lastCost = Number(balance?.lastCostPrice ?? 0);
  if (Number.isFinite(lastCost) && lastCost > 0) {
    return roundUnitCost(lastCost);
  }
  return 0;
}

/**
 * Converte ComboComponentRecord (ou legado ComboRecord.items para retrocompatibilidade)
 * para inputs normalizados de composicao.
 */
export function extractNormalizedComboComponents(
  combo: Pick<ComboRecord, 'items' | 'components'>,
  products: ProductRecord[],
): ComboComponentInput[] {
  if (combo.components && combo.components.length > 0) {
    return [...combo.components]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        productId: c.productId,
        quantity: roundQty(c.quantity),
        unitLabel: c.unitLabel,
        conversionFactor: roundQty(c.conversionFactor),
        packagingConversionId: c.packagingConversionId ?? null,
      }));
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  return (combo.items || [])
    .filter((i) => i.productId && i.quantity > 0)
    .map((i) => {
      const prod = productById.get(i.productId);
      return {
        productId: i.productId,
        quantity: roundQty(i.quantity),
        unitLabel: prod?.saleUnit || 'unidade',
        conversionFactor: 1,
        packagingConversionId: null,
      };
    });
}

/**
 * Consolida itens repetidos se tiverem exatamente a mesma embalagem/unidade,
 * ou bloqueia duplicidade conflitante quando strictDuplicates=true.
 */
export function consolidateComboComponentInputs(
  inputs: ComboComponentInput[],
  options?: { mergeSameProduct?: boolean },
): ComboComponentInput[] {
  const map = new Map<string, ComboComponentInput>();
  for (const raw of inputs) {
    const productId = String(raw.productId || '').trim();
    if (!productId) {
      throw new Error('Todo componente precisa referenciar um produto individual válido.');
    }
    const quantity = roundQty(Number(raw.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      throw new Error('A quantidade de cada componente do combo deve ser maior que zero.');
    }
    const factor = roundQty(
      raw.conversionFactor !== undefined && raw.conversionFactor !== null
        ? Number(raw.conversionFactor)
        : 1,
    );
    if (!Number.isFinite(factor) || factor <= 0 || factor > 10000) {
      throw new Error('O fator de conversão do componente deve ser maior que zero.');
    }

    const unitLabel = String(raw.unitLabel || '').trim() || undefined;
    const packagingConversionId = raw.packagingConversionId ?? null;
    const existing = map.get(productId);
    if (existing) {
      if (!options?.mergeSameProduct) {
        throw new Error(
          'Este produto já foi adicionado ao combo. Ajuste a quantidade no item existente.',
        );
      }

      // Só é seguro consolidar quando os dois lançamentos representam a
      // mesma unidade/embalagem. Somar quantidades de embalagens diferentes
      // usando o fator do primeiro item distorce o consumo e o custo.
      const samePackaging =
        roundQty(existing.conversionFactor || 1) === factor &&
        (existing.packagingConversionId ?? null) === packagingConversionId &&
        (String(existing.unitLabel || '').trim() || undefined) === unitLabel;
      if (!samePackaging) {
        throw new Error(
          'O mesmo produto foi informado com embalagens ou unidades diferentes. Mantenha os componentes separados ou padronize a unidade.',
        );
      }
      map.set(productId, {
        ...existing,
        quantity: roundQty(existing.quantity + quantity),
      });
    } else {
      map.set(productId, {
        productId,
        quantity,
        unitLabel,
        conversionFactor: factor,
        packagingConversionId,
      });
    }
  }
  return Array.from(map.values());
}

export function calculateComboCompositionMetrics(params: {
  components: ComboComponentInput[];
  products: ProductRecord[];
  balances?: InventoryBalanceRecord[];
  packagingConversions?: InventoryPackagingConversionRecord[];
  salePrice: number;
}): ComboCompositionMetrics {
  const productMap = new Map(params.products.map((p) => [p.id, p]));
  const balanceMap = new Map((params.balances || []).map((b) => [b.productId, b]));
  const pkgMap = new Map((params.packagingConversions || []).map((pk) => [pk.id, pk]));

  const resolved: ResolvedComboComponentDraft[] = [];
  let totalBaseUnits = 0;
  let realComponentCost = 0;
  let standaloneTotalPrice = 0;

  if (!Array.isArray(params.components) || params.components.length === 0) {
    throw new Error('O combo precisa possuir pelo menos um componente válido.');
  }

  for (const comp of params.components) {
    const prod = productMap.get(comp.productId);
    if (!prod) {
      throw new Error(
        `O componente "${comp.productId}" não foi encontrado nos produtos deste estabelecimento.`,
      );
    }
    const qty = Number(comp.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Quantidade inválida para o componente "${prod.name}".`);
    }

    const pkg = comp.packagingConversionId
      ? pkgMap.get(comp.packagingConversionId)
      : undefined;
    if (comp.packagingConversionId && (!pkg || pkg.productId !== prod.id)) {
      throw new Error(`Embalagem de conversão inválida para "${prod.name}".`);
    }
    const rawFactor = pkg ? Number(pkg.factorToBase) : Number(comp.conversionFactor ?? 1);
    if (!Number.isFinite(rawFactor) || rawFactor <= 0) {
      throw new Error(`Fator de conversão inválido para "${prod.name}".`);
    }
    const conversionFactor = roundQty(rawFactor);
    const unitLabel =
      String(comp.unitLabel || '').trim() ||
      pkg?.packageLabel ||
      prod.saleUnit ||
      'unidade';
    const baseQuantity = roundQty(qty * conversionFactor);
    const bal = balanceMap.get(prod.id);
    const unitCost = resolveComponentUnitCost(prod, bal);
    const totalCost = roundCurrency(baseQuantity * unitCost);
    const standaloneUnitPrice = roundCurrency(Math.max(0, prod.unitPrice || 0));
    const standaloneLineTotal = roundCurrency(baseQuantity * standaloneUnitPrice);

    totalBaseUnits = roundQty(totalBaseUnits + baseQuantity);
    realComponentCost = roundCurrency(realComponentCost + totalCost);
    standaloneTotalPrice = roundCurrency(standaloneTotalPrice + standaloneLineTotal);

    resolved.push({
      product: prod,
      quantity: qty,
      unitLabel,
      conversionFactor,
      packagingConversionId: pkg?.id ?? comp.packagingConversionId ?? null,
      baseQuantity,
      unitCost,
      totalCost,
      standaloneUnitPrice,
      standaloneLineTotal,
    });
  }

  const salePrice = roundCurrency(Math.max(0, Number(params.salePrice) || 0));
  const estimatedProfit = roundCurrency(salePrice - realComponentCost);
  const marginPercent =
    salePrice > 0
      ? Math.round(((salePrice - realComponentCost) / salePrice) * 1000) / 10
      : null;
  const savingsVsStandalone = roundCurrency(standaloneTotalPrice - salePrice);

  return {
    componentsCount: resolved.length,
    totalBaseUnits,
    realComponentCost,
    standaloneTotalPrice,
    salePrice,
    estimatedProfit,
    marginPercent,
    savingsVsStandalone,
    components: resolved,
  };
}

export function evaluateComboStockAvailability(params: {
  combo: Pick<ComboRecord, 'id' | 'name' | 'items' | 'components'>;
  products: ProductRecord[];
  balances: InventoryBalanceRecord[];
  requestedQuantity?: number;
}): ComboAvailabilityResult {
  const requestedQty = Math.max(0.001, roundQty(params.requestedQuantity ?? 1));
  const productMap = new Map(params.products.map((p) => [p.id, p]));
  const balanceMap = new Map(params.balances.map((b) => [b.productId, b]));
  const normalizedInputs = extractNormalizedComboComponents(
    params.combo,
    params.products,
  );

  if (normalizedInputs.length === 0) {
    return {
      comboId: params.combo.id,
      comboName: params.combo.name,
      requestedQuantity: requestedQty,
      available: false,
      maxProducibleQty: 0,
      limitingProductId: null,
      limitingProductName: null,
      components: [],
    };
  }

  const details: ComboAvailabilityComponentDetail[] = [];
  let maxProducibleQty: number | null = null;
  let limitingProductId: string | null = null;
  let limitingProductName: string | null = null;
  let available = true;

  for (const comp of normalizedInputs) {
    const prod = productMap.get(comp.productId);
    const bal = balanceMap.get(comp.productId);
    const factor = Math.max(0.001, roundQty(comp.conversionFactor || 1));
    const requiredPerComboBase = roundQty(comp.quantity * factor);
    const requiredTotalBase = roundQty(requiredPerComboBase * requestedQty);
    const availableQty = roundQty(bal?.availableQty ?? 0);
    const allowNegativeStock = Boolean(bal?.allowNegativeStock);
    const productName = prod?.name || 'Produto removido';
    if (!prod) {
      available = false;
      maxProducibleQty = 0;
      limitingProductId = comp.productId;
      limitingProductName = productName;
    }

    const maxFromComp = !prod
      ? 0
      : allowNegativeStock
        ? null
        : Math.max(0, Math.floor(availableQty / requiredPerComboBase + 1e-9));

    if (!allowNegativeStock && maxFromComp !== null) {
      if (maxProducibleQty === null || maxFromComp < maxProducibleQty) {
        maxProducibleQty = maxFromComp;
        limitingProductId = comp.productId;
        limitingProductName = productName;
      }
      if (availableQty < requiredTotalBase - 1e-9) {
        available = false;
      }
    }

    details.push({
      productId: comp.productId,
      productName,
      unitLabel: comp.unitLabel || prod?.saleUnit || 'unidade',
      conversionFactor: factor,
      requiredPerComboInput: roundQty(comp.quantity),
      requiredPerComboBase,
      requiredTotalBase,
      availableQty,
      allowNegativeStock,
      sufficient: Boolean(prod) && (allowNegativeStock || availableQty >= requiredTotalBase - 1e-9),
      maxCombosFromComponent: maxFromComp,
    });
  }

  return {
    comboId: params.combo.id,
    comboName: params.combo.name,
    requestedQuantity: requestedQty,
    available,
    maxProducibleQty,
    limitingProductId,
    limitingProductName,
    components: details,
  };
}

export function buildLegacyItemsFromComponents(
  components: ComboComponentInput[],
  products: ProductRecord[],
): ComboProductItem[] {
  const productMap = new Map(products.map((p) => [p.id, p]));
  return components.map((comp) => {
    const prod = productMap.get(comp.productId);
    const baseQty = roundQty(
      comp.quantity * Math.max(0.001, comp.conversionFactor ?? 1),
    );
    return {
      productId: comp.productId,
      productName: prod?.name || 'Produto',
      quantity: baseQty,
      countsAsXSalada: false,
    };
  });
}

export function validateAdegaComboInput(params: {
  name: string;
  description?: string;
  category?: string;
  notes?: string;
  salePrice: number;
  active: boolean;
  imageUrl?: string;
  imagePath?: string;
  components: ComboComponentInput[];
  products: ProductRecord[];
  balances?: InventoryBalanceRecord[];
  packagingConversions?: InventoryPackagingConversionRecord[];
  editingComboIds?: Set<string>;
}): {
  comboInput: ComboInput;
  metrics: ComboCompositionMetrics;
} {
  const cleanName = String(params.name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  if (!cleanName) {
    throw new Error('Informe o nome do combo.');
  }

  const salePrice = roundCurrency(Number(params.salePrice));
  if (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice > 100000) {
    throw new Error('Informe um preço de venda válido maior que zero.');
  }

  if (!Array.isArray(params.components) || params.components.length === 0) {
    throw new Error('Adicione pelo menos 1 produto individual na composição do combo.');
  }
  if (params.components.length > 40) {
    throw new Error('Limite máximo de 40 componentes por combo.');
  }

  const productMap = new Map(params.products.map((p) => [p.id, p]));
  const pkgMap = new Map(
    (params.packagingConversions || []).map((pk) => [pk.id, pk]),
  );

  // Impede combo dentro de combo ou produto inexistente
  for (const rawComp of params.components) {
    if (params.editingComboIds?.has(rawComp.productId)) {
      throw new Error(
        'Não é permitido adicionar outro combo como componente. Utilize apenas produtos individuais.',
      );
    }
    const prod = productMap.get(rawComp.productId);
    if (!prod) {
      throw new Error(
        'Um dos componentes selecionados não pertence aos produtos cadastrados do estabelecimento.',
      );
    }
    if (rawComp.packagingConversionId) {
      const pkg = pkgMap.get(rawComp.packagingConversionId);
      if (!pkg || pkg.productId !== prod.id) {
        throw new Error(
          `Embalagem de conversão inválida para "${prod.name}".`,
        );
      }
    }
  }

  const normalizedComponents = consolidateComboComponentInputs(params.components, {
    mergeSameProduct: false,
  }).map((comp) => {
    const prod = productMap.get(comp.productId)!;
    const pkg = comp.packagingConversionId
      ? pkgMap.get(comp.packagingConversionId)
      : undefined;
    return {
      productId: comp.productId,
      quantity: roundQty(comp.quantity),
      unitLabel:
        String(comp.unitLabel || '').trim() ||
        pkg?.packageLabel ||
        prod.saleUnit ||
        'unidade',
      conversionFactor: pkg
        ? roundQty(pkg.factorToBase)
        : roundQty(comp.conversionFactor ?? 1),
      packagingConversionId: pkg?.id ?? null,
    };
  });

  const metrics = calculateComboCompositionMetrics({
    components: normalizedComponents,
    products: params.products,
    balances: params.balances,
    packagingConversions: params.packagingConversions,
    salePrice,
  });

  const autoDescription =
    metrics.components
      .map((c) => `${c.quantity}x ${c.product.name}`)
      .join(' + ')
      .slice(0, 240);
  const cleanDescription =
    String(params.description || '').trim().slice(0, 240) || autoDescription;

  return {
    comboInput: {
      name: cleanName,
      description: cleanDescription,
      category: String(params.category || '').trim().slice(0, 60),
      notes: String(params.notes || '').trim().slice(0, 600),
      items: buildLegacyItemsFromComponents(normalizedComponents, params.products),
      components: normalizedComponents,
      salePrice,
      estimatedCost: metrics.realComponentCost,
      active: Boolean(params.active),
      imageUrl: String(params.imageUrl || '').trim(),
      imagePath: String(params.imagePath || '').trim(),
    },
    metrics,
  };
}

export function buildComboComponentRowsFromDraft(
  tenantId: string,
  comboId: string,
  components: ComboComponentInput[],
  products: ProductRecord[],
  balances: InventoryBalanceRecord[],
  packagingConversions: InventoryPackagingConversionRecord[],
): ComboComponentRecord[] {
  const now = Date.now();
  const metrics = calculateComboCompositionMetrics({
    components,
    products,
    balances,
    packagingConversions,
    salePrice: 0,
  });
  return metrics.components.map((c, idx) => ({
    id: `cmp_${comboId}_${idx}_${c.product.id}`,
    tenantId,
    comboId,
    productId: c.product.id,
    quantity: c.quantity,
    unitLabel: c.unitLabel,
    conversionFactor: c.conversionFactor,
    packagingConversionId: c.packagingConversionId,
    baseQuantity: c.baseQuantity,
    unitCostSnapshot: c.unitCost,
    totalCostSnapshot: c.totalCost,
    sortOrder: idx,
    createdAtMs: now,
    updatedAtMs: now,
  }));
}
