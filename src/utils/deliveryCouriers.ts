import type {
  DeliveryCourierAvailability,
  DeliveryCourierRecord,
  DeliveryCourierStatus,
  DeliveryCourierType,
} from '../types/finance';
import {
  formatCpfBR,
  formatCustomerPhoneBR,
  formatPhoneMaskInput,
  isValidCustomerPhone,
  isValidOptionalCpf,
  normalizeCustomerPhone,
} from './deliveryCustomers';

export {
  formatCpfBR,
  formatCustomerPhoneBR,
  formatPhoneMaskInput,
  isValidCustomerPhone,
  isValidOptionalCpf,
  normalizeCustomerPhone,
};

export type CourierFilterOption =
  | 'all'
  | 'active'
  | 'available'
  | 'unavailable'
  | 'inactive';

export type CourierSortOption = 'availability' | 'name' | 'recent';

export const COURIER_FILTER_OPTIONS: ReadonlyArray<{
  id: CourierFilterOption;
  label: string;
}> = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Ativos' },
  { id: 'available', label: 'Disponíveis' },
  { id: 'unavailable', label: 'Indisponíveis' },
  { id: 'inactive', label: 'Inativos' },
];

export const COURIER_TYPE_SPEC: Record<
  DeliveryCourierType,
  {
    label: string;
    containerClass: string;
  }
> = {
  own: {
    label: 'Próprio',
    containerClass: 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]',
  },
  outsourced: {
    label: 'Terceirizado',
    containerClass: 'bg-[#F5F3FF] border-[#DDD6FE] text-[#6D28D9]',
  },
};

export function normalizeCourierType(raw: unknown): DeliveryCourierType {
  return raw === 'outsourced' ? 'outsourced' : 'own';
}

export const COURIER_STATUS_SPEC: Record<
  DeliveryCourierStatus,
  {
    label: string;
    containerClass: string;
  }
> = {
  active: {
    label: 'Ativo',
    containerClass: 'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]',
  },
  inactive: {
    label: 'Inativo',
    containerClass: 'bg-[#F3F4F6] border-[#E5E7EB] text-[#4B5563]',
  },
};

export const COURIER_AVAILABILITY_SPEC: Record<
  DeliveryCourierAvailability,
  {
    label: string;
    containerClass: string;
  }
> = {
  available: {
    label: 'Disponível',
    containerClass: 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]',
  },
  unavailable: {
    label: 'Indisponível',
    containerClass: 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]',
  },
};

export function formatMotorcyclePlate(value: string | null | undefined): string {
  const clean = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7);
  if (clean.length <= 3) return clean;
  // Padrão antigo ABC1234 -> ABC-1234; Mercosul ABC1D23 mantém ABC1D23
  if (/^[A-Z]{3}\d{4}$/.test(clean)) {
    return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  return clean;
}

export function normalizeCourierPlateForStorage(
  value: string | null | undefined,
): string {
  return formatMotorcyclePlate(value).slice(0, 16);
}

export function formatCourierMotorcycleSummary(
  courier: Pick<
    DeliveryCourierRecord,
    | 'motorcycleBrand'
    | 'motorcycleModel'
    | 'motorcycleColor'
    | 'motorcyclePlate'
  >,
): string {
  const brandModel = [
    courier.motorcycleBrand?.trim(),
    courier.motorcycleModel?.trim(),
  ]
    .filter(Boolean)
    .join(' ');
  const parts = [
    brandModel,
    courier.motorcycleColor?.trim(),
    courier.motorcyclePlate?.trim()
      ? `Placa ${courier.motorcyclePlate.trim().toUpperCase()}`
      : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'Motocicleta não informada';
}

export function findDuplicateCourierByPhone(
  couriers: DeliveryCourierRecord[],
  phone: string,
  excludeCourierId?: string | null,
): DeliveryCourierRecord | null {
  const normalized = normalizeCustomerPhone(phone);
  if (normalized.length < 8) return null;
  return (
    couriers.find(
      (c) => c.id !== excludeCourierId && c.normalizedPhone === normalized,
    ) ?? null
  );
}

export interface DeliveryCouriersKpis {
  totalCouriers: number;
  activeCouriers: number;
  availableCouriers: number;
  inactiveCouriers: number;
  unavailableActiveCouriers: number;
}

export function computeDeliveryCouriersKpis(
  couriers: Pick<DeliveryCourierRecord, 'status' | 'availabilityStatus'>[],
): DeliveryCouriersKpis {
  let activeCouriers = 0;
  let availableCouriers = 0;
  let inactiveCouriers = 0;
  let unavailableActiveCouriers = 0;

  for (const courier of couriers) {
    if (courier.status === 'active') {
      activeCouriers += 1;
      if (courier.availabilityStatus === 'available') {
        availableCouriers += 1;
      } else {
        unavailableActiveCouriers += 1;
      }
    } else {
      inactiveCouriers += 1;
    }
  }

  return {
    totalCouriers: couriers.length,
    activeCouriers,
    availableCouriers,
    inactiveCouriers,
    unavailableActiveCouriers,
  };
}

export function filterAndSortDeliveryCouriers(
  couriers: DeliveryCourierRecord[],
  params: {
    searchQuery: string;
    filter: CourierFilterOption;
    sortBy: CourierSortOption;
  },
): DeliveryCourierRecord[] {
  const q = params.searchQuery.trim().toLowerCase();
  const qDigits = params.searchQuery.replace(/\D/g, '');
  const qNormPhone = qDigits.length >= 8 ? normalizeCustomerPhone(qDigits) : '';

  const filtered = couriers.filter((courier) => {
    if (params.filter === 'active' && courier.status !== 'active') return false;
    if (params.filter === 'inactive' && courier.status !== 'inactive') return false;
    if (
      params.filter === 'available' &&
      !(courier.status === 'active' && courier.availabilityStatus === 'available')
    ) {
      return false;
    }
    if (
      params.filter === 'unavailable' &&
      !(
        courier.status === 'active' &&
        courier.availabilityStatus === 'unavailable'
      )
    ) {
      return false;
    }

    if (!q) return true;

    if (courier.name.toLowerCase().includes(q)) return true;
    if (courier.motorcyclePlate.toLowerCase().includes(q)) return true;
    if (courier.motorcycleModel.toLowerCase().includes(q)) return true;
    if (courier.email.toLowerCase().includes(q)) return true;

    if (qDigits) {
      const phoneMatches =
        courier.normalizedPhone.includes(qDigits) ||
        courier.phone.replace(/\D/g, '').includes(qDigits) ||
        courier.normalizedWhatsapp.includes(qDigits) ||
        courier.whatsapp.replace(/\D/g, '').includes(qDigits) ||
        (qNormPhone
          ? courier.normalizedPhone.includes(qNormPhone) ||
            courier.normalizedWhatsapp.includes(qNormPhone)
          : false);
      if (phoneMatches) return true;
    }

    return false;
  });

  return [...filtered].sort((a, b) => {
    if (params.sortBy === 'name') {
      return a.name.localeCompare(b.name, 'pt-BR');
    }
    if (params.sortBy === 'recent') {
      if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
      return a.name.localeCompare(b.name, 'pt-BR');
    }
    // availability: ativos disponíveis -> ativos indisponíveis -> inativos -> ordem alfabética
    const rank = (c: DeliveryCourierRecord): number => {
      if (c.status === 'active' && c.availabilityStatus === 'available') return 0;
      if (c.status === 'active') return 1;
      return 2;
    };
    const rDiff = rank(a) - rank(b);
    if (rDiff !== 0) return rDiff;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

export function buildWhatsappUrlBR(phoneOrWhatsapp: string): string | null {
  const normalized = normalizeCustomerPhone(phoneOrWhatsapp);
  if (normalized.length < 10) return null;
  return `https://wa.me/${normalized}`;
}
