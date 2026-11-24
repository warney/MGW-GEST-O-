import type {
  DeliveryCustomerAddressInput,
  DeliveryCustomerAddressRecord,
  DeliveryCustomerClassification,
  DeliveryCustomerClassificationConfig,
  DeliveryCustomerRecord,
  DeliveryCustomerWithMetrics,
  OnlineOrderRecord,
} from '../types/finance';
import { roundCurrency } from './finance';

export const DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG: DeliveryCustomerClassificationConfig = {
  recurringMinOrders: 3,
  vipMinOrders: 6,
  vipMinSpent: 300,
  inactiveDays: 45,
};

export type CustomerSortOption = 'lastPurchase' | 'name' | 'ordersCount';
export type CustomerFilterOption = 'all' | DeliveryCustomerClassification;

export const CUSTOMER_FILTER_OPTIONS: ReadonlyArray<{
  id: CustomerFilterOption;
  label: string;
}> = [
  { id: 'all', label: 'Todos' },
  { id: 'new', label: 'Novos' },
  { id: 'recurring', label: 'Recorrentes' },
  { id: 'vip', label: 'VIP' },
  { id: 'inactive', label: 'Inativos' },
];

export const CLASSIFICATION_BADGE_SPEC: Record<
  DeliveryCustomerClassification,
  {
    label: string;
    shortLabel: string;
    containerClass: string;
  }
> = {
  new: {
    label: 'Novo cliente',
    shortLabel: 'Novo',
    containerClass: 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]',
  },
  recurring: {
    label: 'Cliente recorrente',
    shortLabel: 'Recorrente',
    containerClass: 'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]',
  },
  vip: {
    label: 'Cliente VIP',
    shortLabel: 'VIP',
    containerClass: 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]',
  },
  inactive: {
    label: 'Cliente inativo',
    shortLabel: 'Inativo',
    containerClass: 'bg-[#F3F4F6] border-[#E5E7EB] text-[#4B5563]',
  },
};

/**
 * Normaliza telefones brasileiros de forma idêntica à função PostgreSQL `normalize_br_phone`:
 * remove caracteres não numéricos e garante prefixo 55 quando DDD + número (10 ou 11 dígitos).
 */
export function normalizeCustomerPhone(phone: string | null | undefined): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (/^55\d{10,11}$/.test(digits)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

/**
 * Extrai apenas os dígitos nacionais (DDD + número) quando o telefone começa com +55.
 */
export function extractNationalBrDigits(phone: string | null | undefined): string {
  const normalized = normalizeCustomerPhone(phone);
  if (/^55\d{10,11}$/.test(normalized)) {
    return normalized.slice(2);
  }
  return String(phone || '').replace(/\D/g, '');
}

export function isValidCustomerPhone(phone: string | null | undefined): boolean {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export function formatCustomerPhoneBR(phone: string | null | undefined): string {
  const raw = String(phone || '').trim();
  if (!raw) return '—';
  const national = extractNationalBrDigits(raw);
  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  }
  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }
  return raw;
}

export function formatPhoneMaskInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatCepBR(value: string | null | undefined): string {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function formatCpfBR(value: string | null | undefined): string {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Valida CPF apenas quando preenchido (campo sempre opcional por LGPD/minimização).
 */
export function isValidOptionalCpf(cpf: string | null | undefined): boolean {
  const digits = String(cpf || '').replace(/\D/g, '');
  if (!digits) return true;
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(digits[i]) * (10 - i);
  }
  let check1 = (sum * 10) % 11;
  if (check1 === 10) check1 = 0;
  if (check1 !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(digits[i]) * (11 - i);
  }
  let check2 = (sum * 10) % 11;
  if (check2 === 10) check2 = 0;
  return check2 === Number(digits[10]);
}

export function normalizeClassificationConfig(
  raw?: Partial<DeliveryCustomerClassificationConfig> | null,
): DeliveryCustomerClassificationConfig {
  const recurringMinOrders = Math.max(
    2,
    Math.min(
      100,
      Math.trunc(Number(raw?.recurringMinOrders ?? DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG.recurringMinOrders) || 3),
    ),
  );
  const vipMinOrders = Math.max(
    recurringMinOrders,
    Math.min(
      500,
      Math.trunc(Number(raw?.vipMinOrders ?? DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG.vipMinOrders) || 6),
    ),
  );
  const vipMinSpent = roundCurrency(
    Math.max(
      0,
      Number(raw?.vipMinSpent ?? DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG.vipMinSpent) || 0,
    ),
  );
  const inactiveDays = Math.max(
    7,
    Math.min(
      365,
      Math.trunc(Number(raw?.inactiveDays ?? DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG.inactiveDays) || 45),
    ),
  );
  return {
    recurringMinOrders,
    vipMinOrders,
    vipMinSpent,
    inactiveDays,
  };
}

export function formatCustomerAddressSummary(
  addr: Pick<
    DeliveryCustomerAddressInput,
    'street' | 'number' | 'neighborhood' | 'complement' | 'city' | 'state' | 'cep'
  >,
): string {
  const streetPart = [addr.street?.trim(), addr.number?.trim()]
    .filter(Boolean)
    .join(', ');
  const cityState = [addr.city?.trim(), addr.state?.trim().toUpperCase()]
    .filter(Boolean)
    .join('/');
  const parts = [
    streetPart,
    addr.neighborhood?.trim(),
    addr.complement?.trim(),
    cityState,
    addr.cep?.trim() ? `CEP ${formatCepBR(addr.cep)}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'Endereço sem logradouro';
}

export function hasNonEmptyAddressFields(addr: Partial<DeliveryCustomerAddressInput>): boolean {
  return Boolean(
    addr.street?.trim() ||
      addr.cep?.trim() ||
      addr.neighborhood?.trim() ||
      addr.city?.trim(),
  );
}

export function findDuplicateCustomerByPhone(
  customers: DeliveryCustomerRecord[],
  phone: string,
  excludeCustomerId?: string | null,
): DeliveryCustomerRecord | null {
  const normalized = normalizeCustomerPhone(phone);
  if (normalized.length < 8) return null;
  return (
    customers.find(
      (c) => c.id !== excludeCustomerId && c.normalizedPhone === normalized,
    ) ?? null
  );
}

/**
 * Classificação automática determinística e sem regras contraditórias:
 * 1) Se possui >= 1 pedido válido e ficou >= inactiveDays sem comprar -> 'inactive'
 * 2) Caso contrário, se validOrdersCount >= vipMinOrders OU totalSpent >= vipMinSpent -> 'vip'
 * 3) Caso contrário, se validOrdersCount >= recurringMinOrders -> 'recurring'
 * 4) Caso contrário (0 ou menos que recurringMinOrders) -> 'new'
 */
export function classifyDeliveryCustomer(params: {
  validOrdersCount: number;
  totalSpent: number;
  lastOrderAtMs: number | null;
  nowMs?: number;
  config?: DeliveryCustomerClassificationConfig;
}): DeliveryCustomerClassification {
  const config = normalizeClassificationConfig(params.config);
  const nowMs = params.nowMs ?? Date.now();
  const { validOrdersCount, totalSpent, lastOrderAtMs } = params;

  if (validOrdersCount >= 1 && lastOrderAtMs !== null && Number.isFinite(lastOrderAtMs)) {
    const inactiveCutoffMs = config.inactiveDays * 24 * 60 * 60 * 1000;
    if (nowMs - lastOrderAtMs >= inactiveCutoffMs) {
      return 'inactive';
    }
  }

  if (
    validOrdersCount >= config.vipMinOrders ||
    (validOrdersCount >= 1 && totalSpent >= config.vipMinSpent && config.vipMinSpent > 0)
  ) {
    return 'vip';
  }

  if (validOrdersCount >= config.recurringMinOrders) {
    return 'recurring';
  }

  return 'new';
}

export function describeClassificationRules(
  config: DeliveryCustomerClassificationConfig,
): string[] {
  const c = normalizeClassificationConfig(config);
  return [
    `Cliente inativo: ${c.inactiveDays}+ dias sem novos pedidos válidos (prioridade máxima).`,
    `Cliente VIP: ${c.vipMinOrders}+ pedidos válidos ou R$ ${c.vipMinSpent.toFixed(2).replace('.', ',')}+ gastos (e ativo nos últimos ${c.inactiveDays} dias).`,
    `Cliente recorrente: ${c.recurringMinOrders} a ${Math.max(c.recurringMinOrders, c.vipMinOrders - 1)} pedidos válidos ativos.`,
    `Novo cliente: cadastro manual recente ou menos de ${c.recurringMinOrders} pedidos válidos.`,
  ];
}

export function isCountableCustomerOrder(order: Pick<OnlineOrderRecord, 'status'>): boolean {
  return order.status !== 'cancelled' && order.status !== 'rejected';
}

export function enrichDeliveryCustomersWithMetrics(
  customers: DeliveryCustomerRecord[],
  addresses: DeliveryCustomerAddressRecord[],
  orders: OnlineOrderRecord[],
  config: DeliveryCustomerClassificationConfig = DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
  nowMs = Date.now(),
): DeliveryCustomerWithMetrics[] {
  const normalizedConfig = normalizeClassificationConfig(config);

  const addressesByCustomer = new Map<string, DeliveryCustomerAddressRecord[]>();
  for (const addr of addresses) {
    const list = addressesByCustomer.get(addr.customerId) ?? [];
    list.push(addr);
    addressesByCustomer.set(addr.customerId, list);
  }

  const customerById = new Map<string, DeliveryCustomerRecord>();
  const customerByTenantPhone = new Map<string, DeliveryCustomerRecord>();
  for (const customer of customers) {
    customerById.set(customer.id, customer);
    if (customer.normalizedPhone) {
      customerByTenantPhone.set(
        `${customer.tenantId}::${customer.normalizedPhone}`,
        customer,
      );
    }
  }

  const ordersByCustomer = new Map<string, Map<string, OnlineOrderRecord>>();
  for (const order of orders) {
    let matchedCustomer: DeliveryCustomerRecord | undefined;

    if (order.customerId) {
      const byId = customerById.get(order.customerId);
      if (byId && (!order.tenantId || byId.tenantId === order.tenantId)) {
        matchedCustomer = byId;
      }
    }

    if (!matchedCustomer) {
      const normOrderPhone = normalizeCustomerPhone(order.customerPhone);
      if (normOrderPhone) {
        matchedCustomer = customerByTenantPhone.get(
          `${order.tenantId}::${normOrderPhone}`,
        );
      }
    }

    if (!matchedCustomer) continue;

    let orderMap = ordersByCustomer.get(matchedCustomer.id);
    if (!orderMap) {
      orderMap = new Map<string, OnlineOrderRecord>();
      ordersByCustomer.set(matchedCustomer.id, orderMap);
    }
    orderMap.set(order.id, order);
  }

  return customers.map((customer) => {
    const custAddresses = [...(addressesByCustomer.get(customer.id) ?? [])].sort(
      (a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.createdAtMs - b.createdAtMs;
      },
    );
    const primaryAddress =
      custAddresses.find((a) => a.isPrimary) ?? custAddresses[0] ?? null;

    const customerOrders = Array.from(
      ordersByCustomer.get(customer.id)?.values() ?? [],
    ).sort((a, b) => b.createdAtMs - a.createdAtMs);

    const validOrders = customerOrders.filter(isCountableCustomerOrder);
    const cancelledOrdersCount = customerOrders.length - validOrders.length;

    let totalSpent = 0;
    let firstOrderAtMs: number | null = null;
    let lastOrderAtMs: number | null = null;

    for (const ord of validOrders) {
      totalSpent += Number(ord.totalAmount) || 0;
      if (Number.isFinite(ord.createdAtMs) && ord.createdAtMs > 0) {
        if (firstOrderAtMs === null || ord.createdAtMs < firstOrderAtMs) {
          firstOrderAtMs = ord.createdAtMs;
        }
        if (lastOrderAtMs === null || ord.createdAtMs > lastOrderAtMs) {
          lastOrderAtMs = ord.createdAtMs;
        }
      }
    }

    totalSpent = roundCurrency(totalSpent);
    const validOrdersCount = validOrders.length;
    const averageTicket =
      validOrdersCount > 0 ? roundCurrency(totalSpent / validOrdersCount) : 0;

    const classification = classifyDeliveryCustomer({
      validOrdersCount,
      totalSpent,
      lastOrderAtMs,
      nowMs,
      config: normalizedConfig,
    });

    return {
      customer,
      addresses: custAddresses,
      primaryAddress,
      orders: customerOrders,
      validOrdersCount,
      cancelledOrdersCount,
      totalSpent,
      averageTicket,
      firstOrderAtMs,
      lastOrderAtMs,
      classification,
    };
  });
}

export interface DeliveryCustomersKpis {
  totalCustomers: number;
  newCustomers: number;
  recurringCustomers: number;
  recurringOnlyCustomers: number;
  vipCustomers: number;
  inactiveCustomers: number;
}

export function computeDeliveryCustomersKpis(
  list: DeliveryCustomerWithMetrics[],
): DeliveryCustomersKpis {
  let newCustomers = 0;
  let recurringOnlyCustomers = 0;
  let vipCustomers = 0;
  let inactiveCustomers = 0;

  for (const item of list) {
    if (item.classification === 'new') newCustomers += 1;
    else if (item.classification === 'recurring') recurringOnlyCustomers += 1;
    else if (item.classification === 'vip') vipCustomers += 1;
    else if (item.classification === 'inactive') inactiveCustomers += 1;
  }

  return {
    totalCustomers: list.length,
    newCustomers,
    recurringCustomers: recurringOnlyCustomers + vipCustomers,
    recurringOnlyCustomers,
    vipCustomers,
    inactiveCustomers,
  };
}

export function filterAndSortDeliveryCustomers(
  list: DeliveryCustomerWithMetrics[],
  params: {
    searchQuery: string;
    classificationFilter: CustomerFilterOption;
    sortBy: CustomerSortOption;
  },
): DeliveryCustomerWithMetrics[] {
  const q = params.searchQuery.trim().toLowerCase();
  const qDigits = params.searchQuery.replace(/\D/g, '');
  const qNormPhone = qDigits.length >= 8 ? normalizeCustomerPhone(qDigits) : '';

  const filtered = list.filter((item) => {
    if (
      params.classificationFilter !== 'all' &&
      item.classification !== params.classificationFilter
    ) {
      return false;
    }

    if (!q) return true;

    const nameMatches = item.customer.name.toLowerCase().includes(q);
    if (nameMatches) return true;

    if (qDigits) {
      const phoneMatches =
        item.customer.normalizedPhone.includes(qDigits) ||
        item.customer.phone.replace(/\D/g, '').includes(qDigits) ||
        (qNormPhone ? item.customer.normalizedPhone.includes(qNormPhone) : false);
      if (phoneMatches) return true;
    }

    return item.customer.email.toLowerCase().includes(q);
  });

  return [...filtered].sort((a, b) => {
    if (params.sortBy === 'name') {
      return a.customer.name.localeCompare(b.customer.name, 'pt-BR');
    }
    if (params.sortBy === 'ordersCount') {
      if (b.validOrdersCount !== a.validOrdersCount) {
        return b.validOrdersCount - a.validOrdersCount;
      }
      return b.totalSpent - a.totalSpent;
    }
    // lastPurchase: mais recente primeiro; sem pedidos cai para createdAtMs mais recente
    const aRef = a.lastOrderAtMs ?? a.customer.createdAtMs;
    const bRef = b.lastOrderAtMs ?? b.customer.createdAtMs;
    if (bRef !== aRef) return bRef - aRef;
    return a.customer.name.localeCompare(b.customer.name, 'pt-BR');
  });
}

export function paginateDeliveryCustomers<T>(
  items: T[],
  page: number,
  pageSize = 12,
): {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
} {
  const safeSize = Math.max(1, Math.trunc(pageSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const currentPage = Math.max(1, Math.min(totalPages, Math.trunc(page || 1)));
  const start = (currentPage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    totalItems,
    totalPages,
    currentPage,
  };
}
