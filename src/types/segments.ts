export const BUSINESS_SEGMENTS = {
  LANCHONETE: 'lanchonete',
  ADEGA: 'adega',
} as const;

export type BusinessSegment =
  (typeof BUSINESS_SEGMENTS)[keyof typeof BUSINESS_SEGMENTS];

export const SUPPORTED_BUSINESS_SEGMENTS: readonly BusinessSegment[] = [
  BUSINESS_SEGMENTS.LANCHONETE,
  BUSINESS_SEGMENTS.ADEGA,
] as const;

export type UniversalFeatureKey =
  | 'sales'
  | 'expenses'
  | 'reports'
  | 'combos'
  | 'digitalMenu'
  | 'onlineOrders'
  | 'deliveryDispatch'
  | 'customerDatabase'
  | 'addonGroups';

export type SegmentSpecificFeatureKey =
  | 'supportsSnackMetrics'
  | 'supportsStockControlFoundation'
  | 'supportsBottleAndPackUnits'
  | 'supportsAgeRestrictedCatalogPrep';

export interface SegmentCommercialIdentity {
  displayName: string;
  shortLabel: string;
  signupDescription: string;
  establishmentPlaceholder: string;
  ownerPlaceholder: string;
  tagline: string;
}

export interface SegmentOperationalConfig {
  dashboardMetricsMode: 'snack_xsalada' | 'beverage_retail';
  primaryProductFocus: string;
  defaultCatalogHint: string;
}

export interface SegmentDigitalMenuConfig {
  defaultSubtitle: string;
  featuredFilterLabel: string;
  emptyCatalogTitle: string;
  emptyCatalogDescription: string;
  showSnackSpecificHighlights: boolean;
}

export interface SegmentNomenclature {
  segmentNoun: string;
  catalogTitle: string;
  comboLabel: string;
  itemPluralLabel: string;
}

export interface SegmentConfig {
  id: BusinessSegment;
  displayName: string;
  commercialIdentity: SegmentCommercialIdentity;
  universalFeatures: Record<UniversalFeatureKey, true>;
  specificFeatures: Record<SegmentSpecificFeatureKey, boolean>;
  operationalConfig: SegmentOperationalConfig;
  digitalMenuConfig: SegmentDigitalMenuConfig;
  nomenclature: SegmentNomenclature;
  extensions: Record<string, unknown>;
}
