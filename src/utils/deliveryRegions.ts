import type {
  DeliveryCoverageResolution,
  DeliveryFeeRuleApplied,
  DeliveryPricingSettingsInput,
  DeliveryRegionInput,
  DeliveryRegionRecord,
  DigitalMenuSettingsInput,
  OnlineOrderFulfillment,
  OnlineOrderRecord,
  PublicDeliveryPricingSettings,
  PublicDeliveryRegion,
} from '../types/finance';
import { DEFAULT_SHOP_TIMEZONE, formatCurrencyBRL, roundCurrency } from './finance';

export const SCHEDULE_DAY_OPTIONS = [
  { value: 0, shortLabel: 'Dom', fullLabel: 'Domingo' },
  { value: 1, shortLabel: 'Seg', fullLabel: 'Segunda' },
  { value: 2, shortLabel: 'Ter', fullLabel: 'Terça' },
  { value: 3, shortLabel: 'Qua', fullLabel: 'Quarta' },
  { value: 4, shortLabel: 'Qui', fullLabel: 'Quinta' },
  { value: 5, shortLabel: 'Sex', fullLabel: 'Sexta' },
  { value: 6, shortLabel: 'Sáb', fullLabel: 'Sábado' },
] as const;

export const DEFAULT_DELIVERY_PRICING_SETTINGS: DeliveryPricingSettingsInput = {
  pricingMode: 'by_neighborhood',
  defaultFeeEnabled: false,
  defaultDeliveryFee: 5,
  defaultMinimumOrderAmount: 0,
  defaultEstimatedTime: '35 - 50 min',
  freeDeliveryEnabled: false,
  freeDeliveryMinAmount: 0,
};

export function normalizeDeliveryGeoText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function cleanNeighborhoodName(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

export function deduplicateNeighborhoods(list: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const clean = cleanNeighborhoodName(item);
    const norm = normalizeDeliveryGeoText(clean);
    if (clean.length < 2 || norm.length < 2) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    result.push(clean);
  }
  return result;
}

export function parseNeighborhoodListInput(raw: string): string[] {
  const parts = String(raw || '').split(/[,;\n]+/g);
  return deduplicateNeighborhoods(parts);
}

export function isValidTimeHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((part) => Number(part));
  return h * 60 + m;
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getZonedDayAndMinutes(
  date: Date = new Date(),
  timezone: string = DEFAULT_SHOP_TIMEZONE,
): { dayIndex: number; minutesOfDay: number } {
  const safeTz = timezone?.trim() || DEFAULT_SHOP_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const rawMin = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const hour = rawHour === 24 ? 0 : rawHour;
    return {
      dayIndex: WEEKDAY_TO_INDEX[weekday] ?? date.getDay(),
      minutesOfDay: hour * 60 + rawMin,
    };
  } catch {
    return {
      dayIndex: date.getDay(),
      minutesOfDay: date.getHours() * 60 + date.getMinutes(),
    };
  }
}

export function isDeliveryRegionOpenAtTime(
  region: Pick<
    PublicDeliveryRegion,
    'scheduleEnabled' | 'scheduleDays' | 'scheduleStart' | 'scheduleEnd'
  >,
  nowDate: Date = new Date(),
  timezone: string = DEFAULT_SHOP_TIMEZONE,
): boolean {
  if (!region.scheduleEnabled) return true;

  const days =
    region.scheduleDays && region.scheduleDays.length > 0
      ? region.scheduleDays
      : [0, 1, 2, 3, 4, 5, 6];
  const start = isValidTimeHHMM(region.scheduleStart) ? region.scheduleStart : '00:00';
  const end = isValidTimeHHMM(region.scheduleEnd) ? region.scheduleEnd : '23:59';

  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  const { dayIndex, minutesOfDay } = getZonedDayAndMinutes(nowDate, timezone);
  const yesterdayIndex = (dayIndex + 6) % 7;

  if (endMin >= startMin) {
    return days.includes(dayIndex) && minutesOfDay >= startMin && minutesOfDay <= endMin;
  }

  // Janela noturna que cruza a meia-noite (ex: 18:00 às 02:00)
  return (
    (days.includes(dayIndex) && minutesOfDay >= startMin) ||
    (days.includes(yesterdayIndex) && minutesOfDay <= endMin)
  );
}

export function formatRegionScheduleSummary(
  region: Pick<
    PublicDeliveryRegion,
    'scheduleEnabled' | 'scheduleDays' | 'scheduleStart' | 'scheduleEnd'
  >,
): string {
  if (!region.scheduleEnabled) {
    return 'Horário livre (acompanha abertura da loja)';
  }
  const days = region.scheduleDays && region.scheduleDays.length > 0
    ? [...region.scheduleDays].sort((a, b) => a - b)
    : [0, 1, 2, 3, 4, 5, 6];

  const daysLabel =
    days.length === 7
      ? 'Todos os dias'
      : days
          .map(
            (d) =>
              SCHEDULE_DAY_OPTIONS.find((opt) => opt.value === d)?.shortLabel ??
              String(d),
          )
          .join(', ');

  return `${daysLabel} · ${region.scheduleStart || '00:00'} às ${region.scheduleEnd || '23:59'}`;
}

export function validateDeliveryRegionInput(
  input: DeliveryRegionInput,
  existingRegions: Pick<DeliveryRegionRecord, 'id' | 'name' | 'city' | 'neighborhoods'>[],
  excludeRegionId?: string | null,
): { valid: boolean; error?: string; normalizedNeighborhoods: string[] } {
  const cleanName = String(input.name || '').trim().replace(/\s+/g, ' ');
  if (cleanName.length < 2) {
    return {
      valid: false,
      error: 'Informe o nome da região ou bairro (mínimo 2 caracteres).',
      normalizedNeighborhoods: [],
    };
  }

  const cleanCity = String(input.city || '').trim().replace(/\s+/g, ' ');
  if (cleanCity.length < 2) {
    return {
      valid: false,
      error: 'Informe o município atendido por esta região.',
      normalizedNeighborhoods: [],
    };
  }

  const cleanNeighborhoods = deduplicateNeighborhoods(input.neighborhoods || []);
  if (cleanNeighborhoods.length === 0) {
    return {
      valid: false,
      error: 'Adicione pelo menos um bairro atendido nesta região.',
      normalizedNeighborhoods: [],
    };
  }

  const fee = Number(input.deliveryFee);
  if (!Number.isFinite(fee) || fee < 0) {
    return {
      valid: false,
      error: 'A taxa de entrega não pode ser negativa.',
      normalizedNeighborhoods: cleanNeighborhoods,
    };
  }

  const minOrder = Number(input.minimumOrderAmount ?? 0);
  if (!Number.isFinite(minOrder) || minOrder < 0) {
    return {
      valid: false,
      error: 'O pedido mínimo da região não pode ser negativo.',
      normalizedNeighborhoods: cleanNeighborhoods,
    };
  }

  if (input.scheduleEnabled) {
    if (
      !isValidTimeHHMM(input.scheduleStart || '') ||
      !isValidTimeHHMM(input.scheduleEnd || '')
    ) {
      return {
        valid: false,
        error: 'Informe horários válidos de início e fim no formato HH:MM.',
        normalizedNeighborhoods: cleanNeighborhoods,
      };
    }
    if ((input.scheduleDays || []).length === 0) {
      return {
        valid: false,
        error: 'Selecione ao menos um dia da semana para o horário da região.',
        normalizedNeighborhoods: cleanNeighborhoods,
      };
    }
  }

  const targetNormCity = normalizeDeliveryGeoText(cleanCity);
  const targetNormNeighborhoods = new Set(
    cleanNeighborhoods.map((n) => normalizeDeliveryGeoText(n)),
  );

  for (const existing of existingRegions) {
    if (excludeRegionId && existing.id === excludeRegionId) continue;
    if (normalizeDeliveryGeoText(existing.city) !== targetNormCity) continue;

    for (const existingNb of existing.neighborhoods) {
      if (targetNormNeighborhoods.has(normalizeDeliveryGeoText(existingNb))) {
        return {
          valid: false,
          error: `O bairro "${existingNb}" já está cadastrado na região "${existing.name}" (${existing.city}).`,
          normalizedNeighborhoods: cleanNeighborhoods,
        };
      }
    }
  }

  return {
    valid: true,
    normalizedNeighborhoods: cleanNeighborhoods,
  };
}

export function validateDeliveryPricingSettingsInput(
  input: DeliveryPricingSettingsInput,
): { valid: boolean; error?: string } {
  const defaultFee = Number(input.defaultDeliveryFee);
  if (!Number.isFinite(defaultFee) || defaultFee < 0) {
    return { valid: false, error: 'A taxa padrão de entrega não pode ser negativa.' };
  }

  const defaultMin = Number(input.defaultMinimumOrderAmount);
  if (!Number.isFinite(defaultMin) || defaultMin < 0) {
    return { valid: false, error: 'O pedido mínimo padrão não pode ser negativo.' };
  }

  const freeMin = Number(input.freeDeliveryMinAmount);
  if (!Number.isFinite(freeMin) || freeMin < 0) {
    return { valid: false, error: 'O valor mínimo para entrega grátis não pode ser negativo.' };
  }

  if (input.freeDeliveryEnabled && freeMin <= 0) {
    return {
      valid: false,
      error: 'Informe um valor mínimo maior que zero para ativar a entrega grátis.',
    };
  }

  return { valid: true };
}

export function resolveDeliveryCoverageAndFee(params: {
  fulfillmentType: OnlineOrderFulfillment;
  neighborhood?: string | null;
  city?: string | null;
  address?: string | null;
  regionId?: string | null;
  subtotal: number;
  menuSettings: Pick<DigitalMenuSettingsInput, 'deliveryFee' | 'minimumOrderAmount'>;
  pricingSettings?: PublicDeliveryPricingSettings | null;
  regions?: PublicDeliveryRegion[];
  timezone?: string;
  nowDate?: Date;
}): DeliveryCoverageResolution {
  const {
    fulfillmentType,
    neighborhood,
    city,
    address,
    regionId,
    subtotal,
    menuSettings,
    pricingSettings,
    regions = [],
    timezone = DEFAULT_SHOP_TIMEZONE,
    nowDate = new Date(),
  } = params;

  const safeSubtotal = roundCurrency(Math.max(0, Number(subtotal) || 0));
  const pricing: PublicDeliveryPricingSettings = pricingSettings || {
    ...DEFAULT_DELIVERY_PRICING_SETTINGS,
    defaultFeeEnabled: regions.length === 0,
    defaultDeliveryFee: roundCurrency(Math.max(0, menuSettings.deliveryFee || 0)),
    defaultMinimumOrderAmount: roundCurrency(Math.max(0, menuSettings.minimumOrderAmount || 0)),
    defaultEstimatedTime: '',
  };

  if (fulfillmentType === 'pickup') {
    const minOrder = roundCurrency(
      Math.max(0, menuSettings.minimumOrderAmount || 0, pricing.defaultMinimumOrderAmount || 0),
    );
    return {
      available: true,
      reasonCode: 'pickup',
      message: 'Retirada no estabelecimento sem taxa de entrega.',
      matchedRegion: null,
      matchedNeighborhood: '',
      matchedCity: '',
      baseDeliveryFee: 0,
      appliedDeliveryFee: 0,
      minimumOrderAmount: minOrder,
      estimatedTime: '',
      feeRule: 'pickup',
      freeDeliveryApplied: false,
      freeDeliveryThreshold: 0,
      missingForFreeDelivery: 0,
    };
  }

  const freeEnabled = Boolean(pricing.freeDeliveryEnabled && pricing.freeDeliveryMinAmount > 0);
  const freeThreshold = freeEnabled ? roundCurrency(pricing.freeDeliveryMinAmount) : 0;

  const applyFreeDeliveryRule = (baseFee: number) => {
    const safeBase = roundCurrency(Math.max(0, baseFee));
    const isFree = freeEnabled && safeSubtotal >= freeThreshold;
    const appliedFee = isFree ? 0 : safeBase;
    const missingForFree =
      freeEnabled && !isFree ? roundCurrency(Math.max(0, freeThreshold - safeSubtotal)) : 0;
    return {
      baseDeliveryFee: safeBase,
      appliedDeliveryFee: appliedFee,
      freeDeliveryApplied: isFree,
      freeDeliveryThreshold: freeThreshold,
      missingForFreeDelivery: missingForFree,
    };
  };

  const usesRegionRules = regions.length > 0 && pricing.pricingMode !== 'default_only';
  if (!usesRegionRules) {
    const baseFee = pricingSettings
      ? pricing.defaultDeliveryFee
      : menuSettings.deliveryFee;
    const minOrder = roundCurrency(
      Math.max(
        0,
        pricingSettings && pricing.defaultMinimumOrderAmount > 0
          ? pricing.defaultMinimumOrderAmount
          : menuSettings.minimumOrderAmount || 0,
      ),
    );
    const feeData = applyFreeDeliveryRule(baseFee);
    return {
      available: true,
      reasonCode: 'store_default',
      message: feeData.freeDeliveryApplied
        ? `Entrega grátis aplicada (pedido acima de ${formatCurrencyBRL(freeThreshold)}).`
        : 'Taxa padrão de entrega aplicada.',
      matchedRegion: null,
      matchedNeighborhood: cleanNeighborhoodName(neighborhood || ''),
      matchedCity: cleanNeighborhoodName(city || ''),
      ...feeData,
      minimumOrderAmount: minOrder,
      estimatedTime: pricing.defaultEstimatedTime || '',
      feeRule: 'store_default',
    };
  }

  const normNeighborhood = normalizeDeliveryGeoText(neighborhood);
  const normCity = normalizeDeliveryGeoText(city);
  const normAddress = normalizeDeliveryGeoText(address);

  let matchedRegion: PublicDeliveryRegion | null = null;
  let matchedNeighborhood = cleanNeighborhoodName(neighborhood || '');

  // 1) Busca direta por bairro (+ município se informado)
  if (normNeighborhood) {
    const candidates = regions.filter((region) => {
      if (normCity && normalizeDeliveryGeoText(region.city) !== normCity) {
        return false;
      }
      return region.neighborhoods.some(
        (nb) => normalizeDeliveryGeoText(nb) === normNeighborhood,
      );
    });
    if (candidates.length > 0) {
      matchedRegion =
        candidates.find((r) => r.status === 'active' && !r.isTemporarilySuspended) ||
        candidates[0];
      const exactNb = matchedRegion.neighborhoods.find(
        (nb) => normalizeDeliveryGeoText(nb) === normNeighborhood,
      );
      if (exactNb) matchedNeighborhood = exactNb;
    }
  }

  // 2) Busca por regionId selecionado (caso o cliente tenha escolhido diretamente na lista)
  if (!matchedRegion && regionId) {
    const byId = regions.find((r) => r.id === regionId);
    if (
      byId &&
      (!normNeighborhood ||
        byId.neighborhoods.some(
          (nb) => normalizeDeliveryGeoText(nb) === normNeighborhood,
        ))
    ) {
      matchedRegion = byId;
      if (!matchedNeighborhood && byId.neighborhoods.length === 1) {
        matchedNeighborhood = byId.neighborhoods[0];
      }
    }
  }

  // 3) Detecção automática de bairro dentro do endereço digitado (maior nome primeiro)
  if (!matchedRegion && normAddress.length >= 3) {
    const pairs: Array<{ region: PublicDeliveryRegion; nb: string; norm: string }> = [];
    for (const region of regions) {
      if (normCity && normalizeDeliveryGeoText(region.city) !== normCity) continue;
      for (const nb of region.neighborhoods) {
        const norm = normalizeDeliveryGeoText(nb);
        if (norm.length >= 3) {
          pairs.push({ region, nb, norm });
        }
      }
    }
    pairs.sort((a, b) => b.norm.length - a.norm.length);
    const found = pairs.find((pair) => normAddress.includes(pair.norm));
    if (found) {
      matchedRegion = found.region;
      matchedNeighborhood = found.nb;
    }
  }

  if (matchedRegion) {
    if (matchedRegion.status !== 'active') {
      return {
        available: false,
        reasonCode: 'region_inactive',
        message: `Entregas para "${matchedRegion.name}" estão desativadas no momento.`,
        matchedRegion,
        matchedNeighborhood,
        matchedCity: matchedRegion.city,
        baseDeliveryFee: 0,
        appliedDeliveryFee: 0,
        minimumOrderAmount: matchedRegion.minimumOrderAmount,
        estimatedTime: matchedRegion.estimatedTime || '',
        feeRule: pricing.pricingMode === 'by_region' ? 'region' : 'neighborhood',
        freeDeliveryApplied: false,
        freeDeliveryThreshold: freeThreshold,
        missingForFreeDelivery: 0,
      };
    }

    if (matchedRegion.isTemporarilySuspended) {
      const reasonText = matchedRegion.suspensionReason.trim()
        ? ` Motivo: ${matchedRegion.suspensionReason.trim()}`
        : '';
      return {
        available: false,
        reasonCode: 'region_suspended',
        message: `Entregas temporariamente suspensas para "${matchedRegion.name}".${reasonText}`,
        matchedRegion,
        matchedNeighborhood,
        matchedCity: matchedRegion.city,
        baseDeliveryFee: 0,
        appliedDeliveryFee: 0,
        minimumOrderAmount: matchedRegion.minimumOrderAmount,
        estimatedTime: matchedRegion.estimatedTime || '',
        feeRule: pricing.pricingMode === 'by_region' ? 'region' : 'neighborhood',
        freeDeliveryApplied: false,
        freeDeliveryThreshold: freeThreshold,
        missingForFreeDelivery: 0,
      };
    }

    if (!isDeliveryRegionOpenAtTime(matchedRegion, nowDate, timezone)) {
      return {
        available: false,
        reasonCode: 'outside_schedule',
        message: `Entregas para "${matchedRegion.name}" atendem somente de ${matchedRegion.scheduleStart} às ${matchedRegion.scheduleEnd}.`,
        matchedRegion,
        matchedNeighborhood,
        matchedCity: matchedRegion.city,
        baseDeliveryFee: 0,
        appliedDeliveryFee: 0,
        minimumOrderAmount: matchedRegion.minimumOrderAmount,
        estimatedTime: matchedRegion.estimatedTime || '',
        feeRule: pricing.pricingMode === 'by_region' ? 'region' : 'neighborhood',
        freeDeliveryApplied: false,
        freeDeliveryThreshold: freeThreshold,
        missingForFreeDelivery: 0,
      };
    }

    const minOrder = roundCurrency(
      Math.max(
        0,
        matchedRegion.minimumOrderAmount > 0
          ? matchedRegion.minimumOrderAmount
          : pricing.defaultMinimumOrderAmount > 0
            ? pricing.defaultMinimumOrderAmount
            : menuSettings.minimumOrderAmount || 0,
      ),
    );
    const feeRule: DeliveryFeeRuleApplied =
      pricing.pricingMode === 'by_region' ? 'region' : 'neighborhood';
    const feeData = applyFreeDeliveryRule(matchedRegion.deliveryFee);

    return {
      available: true,
      reasonCode: 'matched_region',
      message: feeData.freeDeliveryApplied
        ? `Entrega grátis aplicada para ${matchedNeighborhood || matchedRegion.name}!`
        : `${matchedNeighborhood || matchedRegion.name} (${matchedRegion.city}) · Taxa ${formatCurrencyBRL(feeData.appliedDeliveryFee)}`,
      matchedRegion,
      matchedNeighborhood,
      matchedCity: matchedRegion.city,
      ...feeData,
      minimumOrderAmount: minOrder,
      estimatedTime:
        matchedRegion.estimatedTime || pricing.defaultEstimatedTime || '',
      feeRule,
    };
  }

  // Nenhuma região encontrada: verifica taxa padrão fallback
  if (!normNeighborhood && normAddress.length < 3 && !pricing.defaultFeeEnabled) {
    return {
      available: false,
      reasonCode: 'missing_neighborhood',
      message: 'Selecione ou informe seu bairro para calcular a taxa de entrega.',
      matchedRegion: null,
      matchedNeighborhood: '',
      matchedCity: cleanNeighborhoodName(city || ''),
      baseDeliveryFee: 0,
      appliedDeliveryFee: 0,
      minimumOrderAmount: roundCurrency(
        Math.max(0, pricing.defaultMinimumOrderAmount || menuSettings.minimumOrderAmount || 0),
      ),
      estimatedTime: pricing.defaultEstimatedTime || '',
      feeRule: 'store_default',
      freeDeliveryApplied: false,
      freeDeliveryThreshold: freeThreshold,
      missingForFreeDelivery: 0,
    };
  }

  if (pricing.defaultFeeEnabled) {
    const minOrder = roundCurrency(
      Math.max(
        0,
        pricing.defaultMinimumOrderAmount > 0
          ? pricing.defaultMinimumOrderAmount
          : menuSettings.minimumOrderAmount || 0,
      ),
    );
    const feeData = applyFreeDeliveryRule(pricing.defaultDeliveryFee);
    return {
      available: true,
      reasonCode: 'default_fallback',
      message: feeData.freeDeliveryApplied
        ? `Entrega grátis aplicada (pedido a partir de ${formatCurrencyBRL(freeThreshold)}).`
        : `Taxa padrão de entrega aplicada: ${formatCurrencyBRL(feeData.appliedDeliveryFee)}.`,
      matchedRegion: null,
      matchedNeighborhood,
      matchedCity: cleanNeighborhoodName(city || ''),
      ...feeData,
      minimumOrderAmount: minOrder,
      estimatedTime: pricing.defaultEstimatedTime || '',
      feeRule: 'default_fallback',
    };
  }

  return {
    available: false,
    reasonCode: 'outside_coverage',
    message: matchedNeighborhood
      ? `Não realizamos entregas para o bairro "${matchedNeighborhood}". Escolha outro endereço ou retirada no local.`
      : 'Endereço ou bairro fora da nossa área de cobertura. Selecione um bairro atendido ou escolha retirada no local.',
    matchedRegion: null,
    matchedNeighborhood,
    matchedCity: cleanNeighborhoodName(city || ''),
    baseDeliveryFee: 0,
    appliedDeliveryFee: 0,
    minimumOrderAmount: roundCurrency(
      Math.max(0, pricing.defaultMinimumOrderAmount || menuSettings.minimumOrderAmount || 0),
    ),
    estimatedTime: '',
    feeRule: 'store_default',
    freeDeliveryApplied: false,
    freeDeliveryThreshold: freeThreshold,
    missingForFreeDelivery: 0,
  };
}

export interface DeliveryRegionOrderMetric {
  regionKey: string;
  regionId: string | null;
  regionName: string;
  city: string;
  ordersCount: number;
  revenueTotal: number;
}

export interface DeliveryRegionsKpisSummary {
  totalRegionsCount: number;
  activeRegionsCount: number;
  suspendedRegionsCount: number;
  temporarilySuspendedCount: number;
  inactiveRegionsCount: number;
  totalNeighborhoodsCount: number;
  averageDeliveryFee: number;
  deliveryOrdersWithRegionCount: number;
  ordersByRegion: DeliveryRegionOrderMetric[];
}

export function computeDeliveryRegionsKpis(
  regions: DeliveryRegionRecord[],
  orders: OnlineOrderRecord[],
): DeliveryRegionsKpisSummary {
  const activeRegions = regions.filter(
    (r) => r.status === 'active' && !r.isTemporarilySuspended,
  );
  const temporarilySuspendedCount = regions.filter(
    (r) => r.isTemporarilySuspended,
  ).length;
  const inactiveRegionsCount = regions.filter((r) => r.status === 'inactive').length;
  const suspendedRegionsCount = regions.filter(
    (r) => r.isTemporarilySuspended || r.status === 'inactive',
  ).length;

  const totalNeighborhoodsCount = regions.reduce(
    (sum, region) => sum + region.neighborhoods.length,
    0,
  );

  const feeSample = activeRegions.length > 0 ? activeRegions : regions;
  const averageDeliveryFee =
    feeSample.length > 0
      ? roundCurrency(
          feeSample.reduce((sum, r) => sum + r.deliveryFee, 0) / feeSample.length,
        )
      : 0;

  const metricsMap = new Map<string, DeliveryRegionOrderMetric>();
  for (const region of regions) {
    metricsMap.set(region.id, {
      regionKey: region.id,
      regionId: region.id,
      regionName: region.name,
      city: region.city,
      ordersCount: 0,
      revenueTotal: 0,
    });
  }

  let deliveryOrdersWithRegionCount = 0;

  for (const order of orders) {
    if (order.fulfillmentType !== 'delivery') continue;
    const regionId = order.deliveryRegionId || null;
    const regionName = (order.deliveryRegionName || order.deliveryNeighborhood || '').trim();
    const city = (order.deliveryCity || '').trim();

    if (!regionId && !regionName) continue;
    deliveryOrdersWithRegionCount += 1;

    const key = regionId || `snapshot:${normalizeDeliveryGeoText(city)}:${normalizeDeliveryGeoText(regionName)}`;
    const existing = metricsMap.get(key);
    if (existing) {
      existing.ordersCount += 1;
      existing.revenueTotal = roundCurrency(existing.revenueTotal + order.totalAmount);
    } else {
      metricsMap.set(key, {
        regionKey: key,
        regionId,
        regionName: regionName || 'Região removida',
        city,
        ordersCount: 1,
        revenueTotal: roundCurrency(order.totalAmount),
      });
    }
  }

  const ordersByRegion = Array.from(metricsMap.values()).sort(
    (a, b) => b.ordersCount - a.ordersCount || a.regionName.localeCompare(b.regionName, 'pt-BR'),
  );

  return {
    totalRegionsCount: regions.length,
    activeRegionsCount: activeRegions.length,
    suspendedRegionsCount,
    temporarilySuspendedCount,
    inactiveRegionsCount,
    totalNeighborhoodsCount,
    averageDeliveryFee,
    deliveryOrdersWithRegionCount,
    ordersByRegion,
  };
}

export interface CityRegionsGroup {
  city: string;
  regions: DeliveryRegionRecord[];
  activeCount: number;
  suspendedCount: number;
  neighborhoodsCount: number;
  minFee: number;
  maxFee: number;
}

export function buildCityRegionsHierarchy(
  regions: DeliveryRegionRecord[],
): CityRegionsGroup[] {
  const byCity = new Map<string, DeliveryRegionRecord[]>();

  for (const region of regions) {
    const cityLabel = region.city.trim() || 'Município não informado';
    const existing = byCity.get(cityLabel) || [];
    existing.push(region);
    byCity.set(cityLabel, existing);
  }

  return Array.from(byCity.entries())
    .map(([city, list]) => {
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const fees = sorted.map((r) => r.deliveryFee);
      return {
        city,
        regions: sorted,
        activeCount: sorted.filter((r) => r.status === 'active' && !r.isTemporarilySuspended).length,
        suspendedCount: sorted.filter((r) => r.status === 'inactive' || r.isTemporarilySuspended).length,
        neighborhoodsCount: sorted.reduce((acc, r) => acc + r.neighborhoods.length, 0),
        minFee: fees.length > 0 ? Math.min(...fees) : 0,
        maxFee: fees.length > 0 ? Math.max(...fees) : 0,
      };
    })
    .sort((a, b) => a.city.localeCompare(b.city, 'pt-BR'));
}

export function formatDeliveryFeeRuleLabel(
  rule?: DeliveryFeeRuleApplied | null,
  freeApplied?: boolean,
): string {
  if (freeApplied) {
    return 'Entrega grátis (valor mínimo atingido)';
  }
  switch (rule) {
    case 'neighborhood':
      return 'Taxa por bairro';
    case 'region':
      return 'Taxa por região';
    case 'default_fallback':
      return 'Taxa padrão (fora de bairro específico)';
    case 'pickup':
      return 'Retirada no balcão (sem taxa)';
    case 'store_default':
    default:
      return 'Taxa padrão da loja';
  }
}

export function getPublicServedNeighborhoodOptions(
  regions: PublicDeliveryRegion[] = [],
): Array<{
  city: string;
  neighborhood: string;
  regionId: string;
  regionName: string;
  deliveryFee: number;
  minimumOrderAmount: number;
  estimatedTime: string;
  isAvailableNow: boolean;
  unavailableReason: string;
}> {
  const options: Array<{
    city: string;
    neighborhood: string;
    regionId: string;
    regionName: string;
    deliveryFee: number;
    minimumOrderAmount: number;
    estimatedTime: string;
    isAvailableNow: boolean;
    unavailableReason: string;
  }> = [];

  for (const region of regions) {
    const unavailableReason =
      region.status !== 'active'
        ? 'Região inativa'
        : region.isTemporarilySuspended
          ? 'Temporariamente suspensa'
          : '';
    for (const nb of region.neighborhoods) {
      options.push({
        city: region.city,
        neighborhood: nb,
        regionId: region.id,
        regionName: region.name,
        deliveryFee: region.deliveryFee,
        minimumOrderAmount: region.minimumOrderAmount,
        estimatedTime: region.estimatedTime,
        isAvailableNow: !unavailableReason,
        unavailableReason,
      });
    }
  }

  return options.sort(
    (a, b) =>
      a.city.localeCompare(b.city, 'pt-BR') ||
      a.neighborhood.localeCompare(b.neighborhood, 'pt-BR'),
  );
}
