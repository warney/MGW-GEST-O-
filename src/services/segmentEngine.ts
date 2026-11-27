import type { TenantContext } from '../types/finance';
import {
  BUSINESS_SEGMENTS,
  SUPPORTED_BUSINESS_SEGMENTS,
  type BusinessSegment,
  type SegmentConfig,
  type SegmentSpecificFeatureKey,
  type UniversalFeatureKey,
} from '../types/segments';

const UNIVERSAL_FEATURES_ALL_ENABLED: SegmentConfig['universalFeatures'] = {
  sales: true,
  expenses: true,
  reports: true,
  combos: true,
  digitalMenu: true,
  onlineOrders: true,
  deliveryDispatch: true,
  customerDatabase: true,
  addonGroups: true,
};

export const SEGMENT_REGISTRY: Record<BusinessSegment, SegmentConfig> = {
  [BUSINESS_SEGMENTS.LANCHONETE]: {
    id: BUSINESS_SEGMENTS.LANCHONETE,
    displayName: 'Lanchonete',
    commercialIdentity: {
      displayName: 'Lanchonete',
      shortLabel: 'Lanchonete',
      signupDescription: 'Lanches, porções, combos e cardápio tradicional.',
      establishmentPlaceholder: 'Minha Lanchonete',
      ownerPlaceholder: 'Nome do proprietário',
      tagline: 'Gestão completa para lanchonetes e delivery.',
    },
    universalFeatures: { ...UNIVERSAL_FEATURES_ALL_ENABLED },
    specificFeatures: {
      supportsSnackMetrics: true,
      supportsStockControlFoundation: false,
      supportsBottleAndPackUnits: false,
      supportsAgeRestrictedCatalogPrep: false,
    },
    operationalConfig: {
      dashboardMetricsMode: 'snack_xsalada',
      primaryProductFocus: 'Lanches e combos',
      defaultCatalogHint: 'Cadastre produtos, categorias, combos e adicionais direto no painel.',
    },
    digitalMenuConfig: {
      defaultSubtitle: 'Confira nosso cardápio e faça seu pedido online.',
      featuredFilterLabel: 'Combos',
      emptyCatalogTitle: 'Nenhum item encontrado neste filtro',
      emptyCatalogDescription: 'Tente buscar outro nome ou selecione a aba "Todos".',
      showSnackSpecificHighlights: true,
    },
    nomenclature: {
      segmentNoun: 'Lanchonete',
      catalogTitle: 'Produtos e Combos',
      comboLabel: 'Combo',
      itemPluralLabel: 'Produtos',
    },
    extensions: {
      legacyDefault: true,
    },
  },
  [BUSINESS_SEGMENTS.ADEGA]: {
    id: BUSINESS_SEGMENTS.ADEGA,
    displayName: 'Adega',
    commercialIdentity: {
      displayName: 'Adega',
      shortLabel: 'Adega',
      signupDescription: 'Bebidas, destilados, cervejas, gelo e combos.',
      establishmentPlaceholder: 'Minha Adega',
      ownerPlaceholder: 'Nome do proprietário',
      tagline: 'Núcleo preparado para operação de adegas e bebidas.',
    },
    universalFeatures: { ...UNIVERSAL_FEATURES_ALL_ENABLED },
    specificFeatures: {
      supportsSnackMetrics: false,
      supportsStockControlFoundation: true,
      supportsBottleAndPackUnits: true,
      supportsAgeRestrictedCatalogPrep: true,
    },
    operationalConfig: {
      dashboardMetricsMode: 'beverage_retail',
      primaryProductFocus: 'Bebidas, combos e conveniência',
      defaultCatalogHint: 'Cadastre suas bebidas, combos e categorias conforme a operação da sua adega.',
    },
    digitalMenuConfig: {
      defaultSubtitle: 'Confira nossas bebidas e combos e faça seu pedido online.',
      featuredFilterLabel: 'Combos',
      emptyCatalogTitle: 'Catálogo em preparação',
      emptyCatalogDescription: 'Esta adega ainda não publicou bebidas ou combos no catálogo digital.',
      showSnackSpecificHighlights: false,
    },
    nomenclature: {
      segmentNoun: 'Adega',
      catalogTitle: 'Produtos e Combos',
      comboLabel: 'Combo',
      itemPluralLabel: 'Bebidas e itens',
    },
    extensions: {
      preparedForInventoryEtapa3: true,
    },
  },
};

export function isValidBusinessSegment(value: unknown): value is BusinessSegment {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return (SUPPORTED_BUSINESS_SEGMENTS as readonly string[]).includes(normalized);
}

/**
 * Normaliza qualquer valor vindo do banco, payload público ou estado antigo.
 * Ausência, nulo ou valor legado desconhecido sempre preservam 'lanchonete'.
 */
export function normalizeBusinessSegment(value: unknown): BusinessSegment {
  if (typeof value !== 'string') return BUSINESS_SEGMENTS.LANCHONETE;
  const normalized = value.trim().toLowerCase();
  if (normalized === BUSINESS_SEGMENTS.ADEGA) {
    return BUSINESS_SEGMENTS.ADEGA;
  }
  return BUSINESS_SEGMENTS.LANCHONETE;
}

/**
 * Validação estrita para entradas explícitas de cadastro/onboarding.
 */
export function parseStrictBusinessSegment(value: unknown): BusinessSegment | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === BUSINESS_SEGMENTS.LANCHONETE) return BUSINESS_SEGMENTS.LANCHONETE;
  if (normalized === BUSINESS_SEGMENTS.ADEGA) return BUSINESS_SEGMENTS.ADEGA;
  return null;
}

export function getSegmentConfig(
  segment?: BusinessSegment | string | null,
): SegmentConfig {
  const normalized = normalizeBusinessSegment(segment);
  return SEGMENT_REGISTRY[normalized];
}

export function resolveTenantSegment(
  tenant?: Pick<TenantContext, 'businessSegment'> | null,
): BusinessSegment {
  return normalizeBusinessSegment(tenant?.businessSegment);
}

export function resolveTenantSegmentConfig(
  tenant?: Pick<TenantContext, 'businessSegment'> | null,
): SegmentConfig {
  return getSegmentConfig(resolveTenantSegment(tenant));
}

export function resolvePublicStoreSegment(
  store?: { businessSegment?: unknown } | null,
): BusinessSegment {
  return normalizeBusinessSegment(store?.businessSegment);
}

export function resolvePublicStoreSegmentConfig(
  store?: { businessSegment?: unknown } | null,
): SegmentConfig {
  return getSegmentConfig(resolvePublicStoreSegment(store));
}

export function isSegmentFeatureEnabled(
  segment: BusinessSegment | string | null | undefined,
  feature: UniversalFeatureKey | SegmentSpecificFeatureKey,
): boolean {
  const cfg = getSegmentConfig(segment);
  if (feature in cfg.universalFeatures) {
    return cfg.universalFeatures[feature as UniversalFeatureKey];
  }
  if (feature in cfg.specificFeatures) {
    return cfg.specificFeatures[feature as SegmentSpecificFeatureKey];
  }
  return false;
}

export function getSignupSegmentOptions(): Array<{
  id: BusinessSegment;
  label: string;
  description: string;
}> {
  return SUPPORTED_BUSINESS_SEGMENTS.map((segmentId) => {
    const cfg = SEGMENT_REGISTRY[segmentId];
    return {
      id: cfg.id,
      label: cfg.commercialIdentity.shortLabel,
      description: cfg.commercialIdentity.signupDescription,
    };
  });
}
