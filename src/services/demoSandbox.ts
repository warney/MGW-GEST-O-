import type {
  ComboInput,
  ComboRecord,
  CreatePublicOrderPayload,
  CreatePublicOrderResponse,
  DeliveryCourierAvailability,
  DeliveryCourierInput,
  DeliveryCourierRecord,
  DeliveryCourierStatus,
  DeliveryCustomerAddressInput,
  DeliveryCustomerAddressRecord,
  DeliveryCustomerClassificationConfig,
  DeliveryCustomerInput,
  DeliveryCustomerRecord,
  DeliveryDispatchHistoryRecord,
  DeliveryDispatchRecord,
  DeliveryDispatchStatus,
  DeliveryPricingSettings,
  DeliveryPricingSettingsInput,
  DeliveryRegionInput,
  DeliveryRegionRecord,
  DeliveryRegionStatus,
  DigitalMenuSettings,
  DigitalMenuSettingsInput,
  ExpenseInput,
  ExpenseRecord,
  OnlineOrderItemSnapshot,
  OnlineOrderRecord,
  OnlineOrderStatus,
  ProductInput,
  ProductRecord,
  PublicCatalogCombo,
  PublicCatalogProduct,
  PublicDeliveryRegion,
  PublicDigitalMenuPayload,
  PublicOrderTrackingRecord,
  SaleInput,
  SaleRecord,
  ShopSettings,
} from '../types/finance';
import {
  normalizeCourierPlateForStorage,
  normalizeCourierType,
} from '../utils/deliveryCouriers';
import {
  DISPATCH_STATUS_LABELS,
  isActiveDispatchStatus,
  validateCourierAssignmentEligibility,
} from '../utils/deliveryDispatch';
import {
  DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
  isValidCustomerPhone,
  isValidOptionalCpf,
  normalizeClassificationConfig,
  normalizeCustomerPhone,
} from '../utils/deliveryCustomers';
import {
  DEFAULT_DELIVERY_PRICING_SETTINGS,
  deduplicateNeighborhoods,
  isValidTimeHHMM,
  resolveDeliveryCoverageAndFee,
  validateDeliveryPricingSettingsInput,
  validateDeliveryRegionInput,
} from '../utils/deliveryRegions';
import {
  calculateSaleTotal,
  DEFAULT_SHOP_TIMEZONE,
  getLocalTodayDate,
  roundCurrency,
} from '../utils/finance';
import {
  buildSaleInputFromCompletedOrder,
  computeCartSummary,
  DEFAULT_DIGITAL_MENU_SETTINGS,
  formatOrderNumber,
  generateTrackingSecretToken,
  isTerminalOrderStatus,
  normalizePixKeyInput,
  ORDER_STATUS_LABELS,
  sanitizeMenuSlug,
  sha256Hex,
  validateCheckoutPayload,
  validateOrderStatusTransition,
} from '../utils/onlineOrders';

const DEMO_FLAG_KEY = 'mgw_demo_sandbox_enabled';
const DEMO_STORE_KEY = 'mgw_demo_sandbox_state_v1';
const DEMO_CHANNEL_NAME = 'mgw_demo_sandbox_channel_v1';

interface DemoState {
  settings: ShopSettings;
  digitalMenu: DigitalMenuSettings;
  products: ProductRecord[];
  combos: ComboRecord[];
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  orders: OnlineOrderRecord[];
  customers: DeliveryCustomerRecord[];
  customerAddresses: DeliveryCustomerAddressRecord[];
  customerClassificationConfig: DeliveryCustomerClassificationConfig;
  couriers: DeliveryCourierRecord[];
  dispatches: DeliveryDispatchRecord[];
  dispatchHistory: DeliveryDispatchHistoryRecord[];
  deliveryRegions: DeliveryRegionRecord[];
  deliveryPricingSettings: DeliveryPricingSettings;
  nextOrderSeq: number;
  tokensByHash: Record<string, string>;
}

const listeners = new Set<() => void>();
let broadcast: BroadcastChannel | null = null;

function ensureBroadcast(): void {
  if (broadcast || typeof BroadcastChannel === 'undefined') return;
  try {
    broadcast = new BroadcastChannel(DEMO_CHANNEL_NAME);
    broadcast.onmessage = () => {
      for (const fn of listeners) fn();
    };
  } catch {
    broadcast = null;
  }
}

export function isDemoSandboxActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      window.sessionStorage.setItem(DEMO_FLAG_KEY, '1');
      return true;
    }
    if (params.get('demo') === '0') {
      window.sessionStorage.removeItem(DEMO_FLAG_KEY);
      return false;
    }
    return window.sessionStorage.getItem(DEMO_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function createInitialDemoState(): DemoState {
  const today = getLocalTodayDate();
  const now = Date.now();
  const pXSaladaId = 'demo_prod_xsalada';
  const pRefri250Id = 'demo_prod_refri250';
  const pRefri1LId = 'demo_prod_refri1l';
  const pBatataId = 'demo_prod_batata';

  const products: ProductRecord[] = [
    {
      id: pXSaladaId,
      ownerId: 'demo-owner',
      name: 'X-Salada Artesanal',
      category: 'Lanche',
      unitPrice: 22,
      countsAsXSalada: true,
      active: true,
      createdAtMs: now - 100000,
      updatedAtMs: now - 100000,
    },
    {
      id: pRefri250Id,
      ownerId: 'demo-owner',
      name: 'Refrigerante Tuchaua 250 ml',
      category: 'Bebida',
      unitPrice: 5,
      countsAsXSalada: false,
      active: true,
      createdAtMs: now - 90000,
      updatedAtMs: now - 90000,
    },
    {
      id: pRefri1LId,
      ownerId: 'demo-owner',
      name: 'Refrigerante Tuchaua 1 L',
      category: 'Bebida',
      unitPrice: 10,
      countsAsXSalada: false,
      active: true,
      createdAtMs: now - 80000,
      updatedAtMs: now - 80000,
    },
    {
      id: pBatataId,
      ownerId: 'demo-owner',
      name: 'Batata Frita Individual',
      category: 'Adicional',
      unitPrice: 12,
      countsAsXSalada: false,
      active: true,
      createdAtMs: now - 70000,
      updatedAtMs: now - 70000,
    },
  ];

  const combos: ComboRecord[] = [
    {
      id: 'demo_combo_1',
      ownerId: 'demo-owner',
      name: 'COMBO 1',
      description: '1 X-Salada Artesanal + 1 Refrigerante Tuchaua 250 ml',
      items: [
        { productId: pXSaladaId, productName: 'X-Salada Artesanal', quantity: 1, countsAsXSalada: true },
        { productId: pRefri250Id, productName: 'Refrigerante Tuchaua 250 ml', quantity: 1, countsAsXSalada: false },
      ],
      salePrice: 26,
      estimatedCost: 11,
      active: true,
      createdAtMs: now - 60000,
      updatedAtMs: now - 60000,
    },
    {
      id: 'demo_combo_2',
      ownerId: 'demo-owner',
      name: 'COMBO 2',
      description: '2 X-Saladas + 1 Refrigerante Tuchaua 1 L',
      items: [
        { productId: pXSaladaId, productName: 'X-Salada Artesanal', quantity: 2, countsAsXSalada: true },
        { productId: pRefri1LId, productName: 'Refrigerante Tuchaua 1 L', quantity: 1, countsAsXSalada: false },
      ],
      salePrice: 51,
      estimatedCost: 22,
      active: true,
      createdAtMs: now - 50000,
      updatedAtMs: now - 50000,
    },
  ];

  const sales: SaleRecord[] = [
    {
      id: 'demo_sale_manual_1',
      ownerId: 'demo-owner',
      date: today,
      quantity: 2,
      unitPrice: 26,
      totalAmount: 52,
      paymentMethod: 'Pix',
      note: 'Balcão',
      saleMode: 'combo',
      xSaladaCount: 2,
      combosCount: 2,
      items: [
        {
          kind: 'combo',
          refId: 'demo_combo_1',
          name: 'COMBO 1',
          quantity: 2,
          unitPrice: 26,
          lineTotal: 52,
          selectedAddons: [],
          estimatedUnitCost: 11,
          xSaladasPerUnit: 1,
          components: [
            { productId: pXSaladaId, productName: 'X-Salada Artesanal', quantityPerUnit: 1, totalQuantity: 2, countsAsXSalada: true },
            { productId: pRefri250Id, productName: 'Refrigerante Tuchaua 250 ml', quantityPerUnit: 1, totalQuantity: 2, countsAsXSalada: false },
          ],
        },
      ],
      saleOrigin: 'manual',
      onlineOrderId: null,
      deliveryFee: 0,
      createdAtMs: now - 40000,
      updatedAtMs: now - 40000,
    },
  ];

  const expenses: ExpenseRecord[] = [
    {
      id: 'demo_exp_1',
      ownerId: 'demo-owner',
      description: 'Compra de pães e carnes',
      amount: 45,
      category: 'Carnes e hambúrgueres',
      date: today,
      paymentMethod: 'Dinheiro',
      note: 'Reposição do dia',
      createdAtMs: now - 45000,
      updatedAtMs: now - 45000,
    },
  ];

  return {
    settings: {
      ownerId: 'demo-owner',
      establishmentName: 'MGW Lanches',
      xSaladaPrice: 22,
      dailyGoal: 800,
      monthlyGoal: 18000,
      startDate: '2026-01-01',
    },
    digitalMenu: {
      tenantId: 'mgw_lanches',
      ...DEFAULT_DIGITAL_MENU_SETTINGS,
      slug: 'mgw_lanches',
      isActive: true,
      isOpen: true,
      phoneWhatsapp: '92999990000',
      address: 'Av. Principal, 100 - Centro',
      openingHours: 'Todos os dias · 18h às 23h30',
      deliveryFee: 5,
      minimumOrderAmount: 15,
      acceptsDelivery: true,
      acceptsPickup: true,
      updatedAtMs: now,
    },
    products,
    combos,
    sales,
    expenses,
    orders: [],
    customers: [],
    customerAddresses: [],
    customerClassificationConfig: { ...DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG },
    couriers: [],
    dispatches: [],
    dispatchHistory: [],
    deliveryRegions: [],
    deliveryPricingSettings: {
      tenantId: 'mgw_lanches',
      ...DEFAULT_DELIVERY_PRICING_SETTINGS,
      defaultFeeEnabled: true,
      defaultDeliveryFee: 5,
      defaultMinimumOrderAmount: 15,
      updatedAtMs: now,
    },
    nextOrderSeq: 1,
    tokensByHash: {},
  };
}

function readDemoState(): DemoState {
  if (typeof window === 'undefined') return createInitialDemoState();
  try {
    const raw = window.localStorage.getItem(DEMO_STORE_KEY);
    if (!raw) {
      const init = createInitialDemoState();
      window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(init));
      return init;
    }
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    const baseInit = createInitialDemoState();
    return {
      ...baseInit,
      ...parsed,
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      customerAddresses: Array.isArray(parsed.customerAddresses)
        ? parsed.customerAddresses
        : [],
      customerClassificationConfig: normalizeClassificationConfig(
        parsed.customerClassificationConfig,
      ),
      couriers: Array.isArray(parsed.couriers)
        ? parsed.couriers.map((c) => ({
            ...c,
            courierType: normalizeCourierType(c.courierType),
          }))
        : [],
      dispatches: Array.isArray(parsed.dispatches) ? parsed.dispatches : [],
      dispatchHistory: Array.isArray(parsed.dispatchHistory)
        ? parsed.dispatchHistory
        : [],
      deliveryRegions: Array.isArray(parsed.deliveryRegions)
        ? parsed.deliveryRegions
        : [],
      deliveryPricingSettings: parsed.deliveryPricingSettings
        ? {
            ...baseInit.deliveryPricingSettings,
            ...parsed.deliveryPricingSettings,
          }
        : baseInit.deliveryPricingSettings,
      digitalMenu: {
        ...baseInit.digitalMenu,
        ...parsed.digitalMenu,
        pixKey: normalizePixKeyInput(parsed.digitalMenu?.pixKey || ''),
      },
    };
  } catch {
    return createInitialDemoState();
  }
}

function writeDemoState(next: DemoState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(next));
  } catch {
    // noop
  }
  ensureBroadcast();
  try {
    broadcast?.postMessage({ type: 'sync', ts: Date.now() });
  } catch {
    // noop
  }
  for (const fn of listeners) fn();
}

function applyOrderStatusStep(
  order: OnlineOrderRecord,
  nextStatus: OnlineOrderStatus,
  reason: string,
  now: number,
  currentSales: SaleRecord[],
): { updatedOrder: OnlineOrderRecord; nextSales: SaleRecord[] } {
  const cleanReason =
    nextStatus === 'rejected' || nextStatus === 'cancelled'
      ? reason.trim()
      : `${ORDER_STATUS_LABELS[nextStatus]}.`;

  let nextSales = currentSales;
  let linkedSaleId = order.saleId;

  if (nextStatus === 'completed' && !order.saleId) {
    const deterministicSaleId = `demo_sale_online_${order.id}`;
    linkedSaleId = deterministicSaleId;
    const saleInput = buildSaleInputFromCompletedOrder({
      ...order,
      status: 'completed',
      completedAtMs: now,
    });
    const totalAmount = roundCurrency(order.totalAmount);
    nextSales = [
      {
        id: deterministicSaleId,
        ownerId: 'demo-owner',
        ...saleInput,
        totalAmount,
        saleOrigin: 'online',
        onlineOrderId: order.id,
        onlineOrderNumber: order.orderNumber,
        deliveryFee: order.deliveryFee,
        createdAtMs: now,
        updatedAtMs: now,
      },
      ...currentSales.filter((s) => s.onlineOrderId !== order.id),
    ];
  }

  const updatedOrder: OnlineOrderRecord = {
    ...order,
    status: nextStatus,
    viewedAtMs: order.viewedAtMs ?? now,
    rejectionReason:
      nextStatus === 'rejected' || nextStatus === 'cancelled'
        ? cleanReason
        : order.rejectionReason,
    acceptedAtMs: nextStatus === 'accepted' ? now : order.acceptedAtMs,
    preparingAtMs: nextStatus === 'preparing' ? now : order.preparingAtMs,
    readyAtMs: nextStatus === 'ready' ? now : order.readyAtMs,
    dispatchedAtMs:
      nextStatus === 'out_for_delivery' || nextStatus === 'ready_for_pickup'
        ? now
        : order.dispatchedAtMs,
    completedAtMs: nextStatus === 'completed' ? now : order.completedAtMs,
    cancelledAtMs:
      nextStatus === 'rejected' || nextStatus === 'cancelled'
        ? now
        : order.cancelledAtMs,
    saleId: linkedSaleId,
    updatedAtMs: now,
    statusHistory: [
      ...order.statusHistory,
      {
        id: `dh_${now}_${order.statusHistory.length + 1}`,
        fromStatus: order.status,
        toStatus: nextStatus,
        reason: cleanReason,
        actorType: 'admin',
        createdAtMs: now,
      },
    ],
  };

  return { updatedOrder, nextSales };
}

export function subscribeDemoAdminState(
  callbacks: {
    onSettings: (s: ShopSettings) => void;
    onDigitalMenuSettings: (d: DigitalMenuSettings) => void;
    onProducts: (p: ProductRecord[]) => void;
    onCombos: (c: ComboRecord[]) => void;
    onSales: (s: SaleRecord[]) => void;
    onExpenses: (e: ExpenseRecord[]) => void;
    onOrders: (o: OnlineOrderRecord[]) => void;
    onDeliveryCustomers?: (c: DeliveryCustomerRecord[]) => void;
    onDeliveryCustomerAddresses?: (a: DeliveryCustomerAddressRecord[]) => void;
    onCustomerClassificationConfig?: (cfg: DeliveryCustomerClassificationConfig) => void;
    onDeliveryCouriers?: (couriers: DeliveryCourierRecord[]) => void;
    onDeliveryDispatches?: (dispatches: DeliveryDispatchRecord[]) => void;
    onDeliveryDispatchHistory?: (history: DeliveryDispatchHistoryRecord[]) => void;
    onDeliveryRegions?: (regions: DeliveryRegionRecord[]) => void;
    onDeliveryPricingSettings?: (settings: DeliveryPricingSettings) => void;
    onReady: () => void;
  },
): () => void {
  ensureBroadcast();
  const emit = () => {
    const st = readDemoState();
    callbacks.onSettings(st.settings);
    callbacks.onDigitalMenuSettings(st.digitalMenu);
    callbacks.onProducts(st.products);
    callbacks.onCombos(st.combos);
    callbacks.onSales(st.sales);
    callbacks.onExpenses(st.expenses);
    callbacks.onOrders(st.orders);
    callbacks.onDeliveryCustomers?.(st.customers);
    callbacks.onDeliveryCustomerAddresses?.(st.customerAddresses);
    callbacks.onCustomerClassificationConfig?.(st.customerClassificationConfig);
    callbacks.onDeliveryCouriers?.(st.couriers);
    callbacks.onDeliveryDispatches?.(st.dispatches);
    callbacks.onDeliveryDispatchHistory?.(st.dispatchHistory);
    callbacks.onDeliveryRegions?.(st.deliveryRegions);
    callbacks.onDeliveryPricingSettings?.(st.deliveryPricingSettings);
    callbacks.onReady();
  };
  listeners.add(emit);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === DEMO_STORE_KEY) emit();
  };
  window.addEventListener('storage', storageHandler);
  emit();
  return () => {
    listeners.delete(emit);
    window.removeEventListener('storage', storageHandler);
  };
}

export const demoMutations = {
  saveSettings(input: Omit<ShopSettings, 'ownerId'>) {
    const st = readDemoState();
    writeDemoState({
      ...st,
      settings: { ownerId: st.settings.ownerId, ...input },
    });
  },
  saveDigitalMenuSettings(input: DigitalMenuSettingsInput) {
    const st = readDemoState();
    writeDemoState({
      ...st,
      digitalMenu: {
        ...st.digitalMenu,
        ...input,
        pixKey: normalizePixKeyInput(input.pixKey || ''),
        slug: sanitizeMenuSlug(input.slug, 'mgw_lanches'),
        updatedAtMs: Date.now(),
      },
    });
  },
  addProduct(input: ProductInput): string {
    const st = readDemoState();
    const { preferredId, ...rest } = input;
    const id = preferredId && preferredId.trim() ? preferredId.trim() : `demo_prod_${Date.now()}`;
    const now = Date.now();
    writeDemoState({
      ...st,
      products: [
        ...st.products,
        { id, ownerId: 'demo-owner', ...rest, createdAtMs: now, updatedAtMs: now },
      ],
    });
    return id;
  },
  updateProduct(id: string, input: ProductInput) {
    const st = readDemoState();
    const { preferredId: _ignored, ...rest } = input;
    writeDemoState({
      ...st,
      products: st.products.map((p) =>
        p.id === id ? { ...p, ...rest, updatedAtMs: Date.now() } : p,
      ),
    });
  },
  addCombo(input: ComboInput): string {
    const st = readDemoState();
    const { preferredId, ...rest } = input;
    const id = preferredId && preferredId.trim() ? preferredId.trim() : `demo_combo_${Date.now()}`;
    const now = Date.now();
    writeDemoState({
      ...st,
      combos: [
        ...st.combos,
        { id, ownerId: 'demo-owner', ...rest, createdAtMs: now, updatedAtMs: now },
      ],
    });
    return id;
  },
  updateCombo(id: string, input: ComboInput) {
    const st = readDemoState();
    const { preferredId: _ignored, ...rest } = input;
    writeDemoState({
      ...st,
      combos: st.combos.map((c) =>
        c.id === id ? { ...c, ...rest, updatedAtMs: Date.now() } : c,
      ),
    });
  },
  addSale(input: SaleInput): SaleRecord {
    const st = readDemoState();
    const now = Date.now();
    const totalAmount =
      input.items && input.items.length > 0
        ? roundCurrency(input.items.reduce((acc, i) => acc + i.lineTotal, 0))
        : calculateSaleTotal(input.quantity, input.unitPrice);
    const sale: SaleRecord = {
      id: `demo_sale_${now}`,
      ownerId: 'demo-owner',
      ...input,
      totalAmount,
      saleOrigin: input.saleOrigin ?? 'manual',
      onlineOrderId: input.onlineOrderId ?? null,
      deliveryFee: input.deliveryFee ?? 0,
      customerId: input.customerId ?? null,
      customerName: (input.customerName || '').trim(),
      customerAddress: (input.customerAddress || '').trim(),
      customerNumber: (input.customerNumber || '').trim(),
      customerNeighborhood: (input.customerNeighborhood || '').trim(),
      customerComplement: (input.customerComplement || '').trim(),
      createdAtMs: now,
      updatedAtMs: now,
    };
    writeDemoState({ ...st, sales: [sale, ...st.sales] });
    return sale;
  },
  updateSale(id: string, input: SaleInput): SaleRecord {
    const st = readDemoState();
    const now = Date.now();
    const totalAmount =
      input.items && input.items.length > 0
        ? roundCurrency(input.items.reduce((acc, i) => acc + i.lineTotal, 0))
        : calculateSaleTotal(input.quantity, input.unitPrice);
    let updatedSale: SaleRecord | null = null;
    const nextSales = st.sales.map((s) => {
      if (s.id !== id) return s;
      updatedSale = {
        ...s,
        ...input,
        totalAmount,
        customerId: input.customerId ?? null,
        customerName: (input.customerName || '').trim(),
        customerAddress: (input.customerAddress || '').trim(),
        customerNumber: (input.customerNumber || '').trim(),
        customerNeighborhood: (input.customerNeighborhood || '').trim(),
        customerComplement: (input.customerComplement || '').trim(),
        updatedAtMs: now,
      };
      return updatedSale;
    });
    writeDemoState({
      ...st,
      sales: nextSales,
    });
    return (
      updatedSale ?? {
        id,
        ownerId: 'demo-owner',
        ...input,
        totalAmount,
        createdAtMs: now,
        updatedAtMs: now,
      }
    );
  },
  deleteSale(id: string) {
    const st = readDemoState();
    writeDemoState({ ...st, sales: st.sales.filter((s) => s.id !== id) });
  },
  addExpense(input: ExpenseInput) {
    const st = readDemoState();
    const now = Date.now();
    writeDemoState({
      ...st,
      expenses: [
        { id: `demo_exp_${now}`, ownerId: 'demo-owner', ...input, createdAtMs: now, updatedAtMs: now },
        ...st.expenses,
      ],
    });
  },
  updateExpense(id: string, input: ExpenseInput) {
    const st = readDemoState();
    writeDemoState({
      ...st,
      expenses: st.expenses.map((e) =>
        e.id === id ? { ...e, ...input, updatedAtMs: Date.now() } : e,
      ),
    });
  },
  deleteExpense(id: string) {
    const st = readDemoState();
    writeDemoState({ ...st, expenses: st.expenses.filter((e) => e.id !== id) });
  },
  fetchPublicMenu(slug?: string): PublicDigitalMenuPayload {
    const st = readDemoState();
    const reqSlug = slug ? sanitizeMenuSlug(slug, '') : '';
    if (reqSlug && reqSlug !== st.digitalMenu.slug && reqSlug !== 'mgw_lanches') {
      return {
        found: false,
        store: null,
        products: [],
        combos: [],
        deliveryPricing: null,
        deliveryRegions: [],
      };
    }
    const products: PublicCatalogProduct[] = st.digitalMenu.isActive
      ? st.products.filter((p) => p.active).map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          unitPrice: p.unitPrice,
          countsAsXSalada: p.countsAsXSalada,
          imageUrl: p.imageUrl,
        }))
      : [];
    const combos: PublicCatalogCombo[] = st.digitalMenu.isActive
      ? st.combos.filter((c) => c.active).map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          items: c.items,
          salePrice: c.salePrice,
          imageUrl: c.imageUrl,
        }))
      : [];
    const deliveryRegions: PublicDeliveryRegion[] = st.deliveryRegions.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      neighborhoods: r.neighborhoods,
      description: r.description,
      deliveryFee: r.deliveryFee,
      minimumOrderAmount: r.minimumOrderAmount,
      estimatedTime: r.estimatedTime,
      status: r.status,
      isTemporarilySuspended: r.isTemporarilySuspended,
      suspensionReason: r.suspensionReason,
      scheduleEnabled: r.scheduleEnabled,
      scheduleDays: r.scheduleDays,
      scheduleStart: r.scheduleStart,
      scheduleEnd: r.scheduleEnd,
    }));
    return {
      found: true,
      store: {
        ...st.digitalMenu,
        timezone: st.settings.timezone || DEFAULT_SHOP_TIMEZONE,
      },
      products,
      combos,
      deliveryPricing: {
        pricingMode: st.deliveryPricingSettings.pricingMode,
        defaultFeeEnabled: st.deliveryPricingSettings.defaultFeeEnabled,
        defaultDeliveryFee: st.deliveryPricingSettings.defaultDeliveryFee,
        defaultMinimumOrderAmount: st.deliveryPricingSettings.defaultMinimumOrderAmount,
        defaultEstimatedTime: st.deliveryPricingSettings.defaultEstimatedTime,
        freeDeliveryEnabled: st.deliveryPricingSettings.freeDeliveryEnabled,
        freeDeliveryMinAmount: st.deliveryPricingSettings.freeDeliveryMinAmount,
      },
      deliveryRegions,
    };
  },
  async createPublicOrder(payload: CreatePublicOrderPayload): Promise<CreatePublicOrderResponse> {
    const st = readDemoState();
    const activeProds = st.products.filter((p) => p.active);
    const activeCombos = st.combos.filter((c) => c.active);
    const baseSummary = computeCartSummary(
      payload.items,
      activeProds,
      activeCombos,
      st.digitalMenu,
      payload.fulfillmentType,
    );
    const coverage = resolveDeliveryCoverageAndFee({
      fulfillmentType: payload.fulfillmentType,
      neighborhood: payload.deliveryNeighborhood,
      city: payload.deliveryCity,
      address: payload.deliveryAddress,
      regionId: payload.deliveryRegionId,
      subtotal: baseSummary.subtotal,
      menuSettings: st.digitalMenu,
      pricingSettings: st.deliveryPricingSettings,
      regions: st.deliveryRegions,
      timezone: st.settings.timezone || DEFAULT_SHOP_TIMEZONE,
    });
    const summary = computeCartSummary(
      payload.items,
      activeProds,
      activeCombos,
      st.digitalMenu,
      payload.fulfillmentType,
      coverage,
    );
    const check = validateCheckoutPayload(payload, summary, st.digitalMenu, coverage);
    if (!check.valid) throw new Error(check.error || 'Pedido inválido.');

    const trackingToken = generateTrackingSecretToken();
    const tokenHash = await sha256Hex(trackingToken);
    const orderNumber = st.nextOrderSeq;
    const orderCode = trackingToken.slice(0, 6).toUpperCase();
    const orderId = `demo_order_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const comboMap = new Map(activeCombos.map((c) => [c.id, c]));
    const prodMap = new Map(activeProds.map((p) => [p.id, p]));

    const items: OnlineOrderItemSnapshot[] = summary.lines.map((l, idx) => {
      if (l.kind === 'combo') {
        const c = comboMap.get(l.id);
        return {
          id: `dit_${idx}`,
          itemKind: 'combo',
          refId: l.id,
          itemName: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          selectedAddons: [],
          estimatedUnitCost: c?.estimatedCost ?? 0,
          xSaladasPerUnit: l.xSaladasPerUnit,
          components: (c?.items ?? []).map((comp) => ({
            productId: comp.productId,
            productName: comp.productName,
            quantityPerUnit: comp.quantity,
            totalQuantity: comp.quantity * l.quantity,
            countsAsXSalada: comp.countsAsXSalada,
          })),
          itemNote: l.note,
        };
      }
      const p = prodMap.get(l.id);
      return {
        id: `dit_${idx}`,
        itemKind: 'product',
        refId: l.id,
        itemName: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        selectedAddons: [],
        estimatedUnitCost: 0,
        xSaladasPerUnit: l.xSaladasPerUnit,
        components: [
          {
            productId: p?.id ?? l.id,
            productName: l.name,
            quantityPerUnit: 1,
            totalQuantity: l.quantity,
            countsAsXSalada: Boolean(p?.countsAsXSalada),
          },
        ],
        itemNote: l.note,
      };
    });

    const normPhone = normalizeCustomerPhone(payload.customerPhone);
    const existingCustomer = st.customers.find((c) => c.normalizedPhone === normPhone);
    const customerId = existingCustomer?.id ?? `demo_cust_${now}_${Math.random().toString(36).slice(2, 6)}`;
    let nextCustomers = st.customers;
    let nextAddresses = st.customerAddresses;

    if (!existingCustomer && normPhone.length >= 8) {
      nextCustomers = [
        {
          id: customerId,
          tenantId: 'mgw_lanches',
          name: payload.customerName.trim(),
          phone: payload.customerPhone.trim(),
          normalizedPhone: normPhone,
          email: '',
          cpf: '',
          birthDate: null,
          notes: '',
          createdAtMs: now,
          updatedAtMs: now,
        },
        ...st.customers,
      ];
    } else if (existingCustomer) {
      nextCustomers = st.customers.map((c) =>
        c.id === existingCustomer.id ? { ...c, updatedAtMs: now } : c,
      );
    }

    if (
      payload.fulfillmentType === 'delivery' &&
      payload.deliveryAddress.trim().length >= 5 &&
      normPhone.length >= 8
    ) {
      const custAddrs = nextAddresses.filter((a) => a.customerId === customerId);
      const cleanAddr = payload.deliveryAddress.trim().slice(0, 200);
      const alreadyExists = custAddrs.some(
        (a) => a.street.trim().toLowerCase() === cleanAddr.toLowerCase(),
      );
      if (!alreadyExists) {
        nextAddresses = [
          ...nextAddresses,
          {
            id: `demo_addr_${now}_${Math.random().toString(36).slice(2, 6)}`,
            tenantId: 'mgw_lanches',
            customerId,
            label: custAddrs.length === 0 ? 'Principal' : 'Entrega',
            cep: '',
            street: cleanAddr,
            number: '',
            neighborhood: '',
            complement: '',
            reference: payload.deliveryReference.trim().slice(0, 160),
            city: '',
            state: '',
            isPrimary: custAddrs.length === 0,
            createdAtMs: now,
            updatedAtMs: now,
          },
        ];
      }
    }

    const newOrder: OnlineOrderRecord = {
      id: orderId,
      tenantId: 'mgw_lanches',
      customerId: normPhone.length >= 8 ? customerId : null,
      orderNumber,
      orderCode,
      tokenHash,
      status: 'received',
      fulfillmentType: payload.fulfillmentType,
      customerName: payload.customerName.trim(),
      customerPhone: payload.customerPhone.trim(),
      deliveryAddress:
        payload.fulfillmentType === 'delivery' ? payload.deliveryAddress.trim() : '',
      deliveryReference:
        payload.fulfillmentType === 'delivery' ? payload.deliveryReference.trim() : '',
      deliveryRegionId: coverage.matchedRegion?.id ?? null,
      deliveryRegionName:
        payload.fulfillmentType === 'delivery'
          ? coverage.matchedRegion?.name ||
            (coverage.feeRule === 'default_fallback'
              ? coverage.matchedNeighborhood || 'Taxa padrão'
              : '')
          : '',
      deliveryNeighborhood:
        payload.fulfillmentType === 'delivery' ? coverage.matchedNeighborhood : '',
      deliveryCity: payload.fulfillmentType === 'delivery' ? coverage.matchedCity : '',
      deliveryBaseFee: coverage.baseDeliveryFee,
      deliveryFeeRule: coverage.feeRule,
      deliveryMinimumOrderApplied: coverage.minimumOrderAmount,
      deliveryFreeApplied: coverage.freeDeliveryApplied,
      deliveryFreeThresholdApplied: coverage.freeDeliveryThreshold,
      paymentMethod: payload.paymentMethod,
      changeFor: payload.changeFor,
      customerNote: payload.customerNote.trim(),
      subtotalAmount: summary.subtotal,
      deliveryFee: summary.deliveryFee,
      totalAmount: summary.totalAmount,
      rejectionReason: '',
      viewedAtMs: null,
      acceptedAtMs: null,
      preparingAtMs: null,
      readyAtMs: null,
      dispatchedAtMs: null,
      completedAtMs: null,
      cancelledAtMs: null,
      saleId: null,
      createdAtMs: now,
      updatedAtMs: now,
      items,
      statusHistory: [
        {
          id: `dh_${now}`,
          fromStatus: null,
          toStatus: 'received',
          reason: 'Pedido enviado pelo cardápio digital.',
          actorType: 'customer',
          createdAtMs: now,
        },
      ],
    };

    writeDemoState({
      ...st,
      orders: [newOrder, ...st.orders],
      customers: nextCustomers,
      customerAddresses: nextAddresses,
      nextOrderSeq: orderNumber + 1,
      tokensByHash: { ...st.tokensByHash, [tokenHash]: orderId },
    });

    return {
      orderId,
      orderNumber,
      orderCode,
      trackingToken,
      tokenHash,
      status: 'received',
      subtotalAmount: summary.subtotal,
      deliveryFee: summary.deliveryFee,
      totalAmount: summary.totalAmount,
      deliveryRegionName: newOrder.deliveryRegionName,
      deliveryNeighborhood: newOrder.deliveryNeighborhood,
      deliveryCity: newOrder.deliveryCity,
      deliveryFeeRule: newOrder.deliveryFeeRule,
      deliveryFreeApplied: newOrder.deliveryFreeApplied,
    };
  },
  async getPublicOrderByToken(token: string): Promise<PublicOrderTrackingRecord | null> {
    const hash = await sha256Hex(token.trim());
    const st = readDemoState();
    const order = st.orders.find((o) => o.tokenHash === hash);
    if (!order) return null;
    return {
      orderId: order.id,
      tokenHash: order.tokenHash,
      orderNumber: order.orderNumber,
      orderCode: order.orderCode || formatOrderNumber(order.orderNumber),
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      customerName: order.customerName,
      deliveryAddress: order.deliveryAddress,
      deliveryReference: order.deliveryReference,
      deliveryRegionName: order.deliveryRegionName || '',
      deliveryNeighborhood: order.deliveryNeighborhood || '',
      deliveryCity: order.deliveryCity || '',
      deliveryBaseFee: order.deliveryBaseFee ?? order.deliveryFee,
      deliveryFeeRule: order.deliveryFeeRule || 'store_default',
      deliveryMinimumOrderApplied: order.deliveryMinimumOrderApplied ?? 0,
      deliveryFreeApplied: Boolean(order.deliveryFreeApplied),
      deliveryFreeThresholdApplied: order.deliveryFreeThresholdApplied ?? 0,
      paymentMethod: order.paymentMethod,
      changeFor: order.changeFor,
      customerNote: order.customerNote,
      subtotalAmount: order.subtotalAmount,
      deliveryFee: order.deliveryFee,
      totalAmount: order.totalAmount,
      rejectionReason: order.rejectionReason,
      storeName: st.digitalMenu.storeName,
      storeSlug: st.digitalMenu.slug,
      storeWhatsapp: st.digitalMenu.phoneWhatsapp,
      storeAddress: st.digitalMenu.address,
      storePixKey: normalizePixKeyInput(st.digitalMenu.pixKey || ''),
      createdAtMs: order.createdAtMs,
      updatedAtMs: order.updatedAtMs,
      items: order.items.map((it) => ({
        id: it.id,
        itemKind: it.itemKind,
        refId: it.refId,
        itemName: it.itemName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
        selectedAddons: it.selectedAddons || [],
        itemNote: it.itemNote,
      })),
      statusHistory: order.statusHistory,
    };
  },
  subscribeTrackingByToken(
    token: string,
    onUpdate: (order: PublicOrderTrackingRecord | null) => void,
  ): () => void {
    ensureBroadcast();
    let active = true;
    const emit = () => {
      void demoMutations.getPublicOrderByToken(token).then((o) => {
        if (active) onUpdate(o);
      });
    };
    listeners.add(emit);
    const storageHandler = (e: StorageEvent) => {
      if (e.key === DEMO_STORE_KEY) emit();
    };
    window.addEventListener('storage', storageHandler);
    emit();
    return () => {
      active = false;
      listeners.delete(emit);
      window.removeEventListener('storage', storageHandler);
    };
  },
  markOrderViewed(orderId: string) {
    const st = readDemoState();
    const target = st.orders.find((o) => o.id === orderId);
    if (!target || target.viewedAtMs) return;
    writeDemoState({
      ...st,
      orders: st.orders.map((o) =>
        o.id === orderId ? { ...o, viewedAtMs: Date.now() } : o,
      ),
    });
  },
  transitionOrderStatus(orderId: string, nextStatus: OnlineOrderStatus, reason: string) {
    const st = readDemoState();
    const order = st.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Pedido não encontrado.');
    const check = validateOrderStatusTransition(
      order.status,
      nextStatus,
      order.fulfillmentType,
      reason,
    );
    if (!check.valid) throw new Error(check.error || 'Transição inválida.');

    const now = Date.now();
    const { updatedOrder, nextSales } = applyOrderStatusStep(
      order,
      nextStatus,
      reason,
      now,
      st.sales,
    );

    let nextDispatches = st.dispatches;
    let nextDispatchHistory = st.dispatchHistory;

    if (order.fulfillmentType === 'delivery') {
      const activeDispatch = st.dispatches.find(
        (d) => d.orderId === orderId && isActiveDispatchStatus(d.dispatchStatus),
      );
      if (activeDispatch) {
        if (nextStatus === 'rejected' || nextStatus === 'cancelled') {
          const cancelReason =
            reason.trim().length >= 3
              ? reason.trim()
              : 'Pedido cancelado ou recusado na Central de Pedidos.';
          nextDispatches = st.dispatches.map((d) =>
            d.id === activeDispatch.id
              ? {
                  ...d,
                  dispatchStatus: 'delivery_cancelled',
                  cancelledAtMs: now,
                  cancellationReason: cancelReason,
                  updatedAtMs: now,
                }
              : d,
          );
          nextDispatchHistory = [
            ...st.dispatchHistory,
            {
              id: `demo_dh_${now}_${st.dispatchHistory.length + 1}`,
              tenantId: activeDispatch.tenantId,
              dispatchId: activeDispatch.id,
              orderId: activeDispatch.orderId,
              courierId: activeDispatch.courierId,
              courierName: activeDispatch.courierNameSnapshot,
              fromStatus: activeDispatch.dispatchStatus,
              toStatus: 'delivery_cancelled',
              actorUserId: null,
              actorEmail: '',
              actorType: 'system',
              reason: cancelReason,
              createdAtMs: now,
            },
          ];
        } else {
          let syncedStatus: DeliveryDispatchStatus | null = null;
          if (
            nextStatus === 'preparing' &&
            activeDispatch.dispatchStatus === 'delivery_accepted'
          ) {
            syncedStatus = 'preparing';
          } else if (
            nextStatus === 'ready' &&
            (activeDispatch.dispatchStatus === 'delivery_accepted' ||
              activeDispatch.dispatchStatus === 'preparing')
          ) {
            syncedStatus = 'ready_for_dispatch';
          } else if (
            nextStatus === 'out_for_delivery' &&
            (activeDispatch.dispatchStatus === 'delivery_accepted' ||
              activeDispatch.dispatchStatus === 'preparing' ||
              activeDispatch.dispatchStatus === 'ready_for_dispatch')
          ) {
            syncedStatus = 'out_for_delivery';
          } else if (
            nextStatus === 'completed' &&
            activeDispatch.dispatchStatus !== 'delivered'
          ) {
            syncedStatus = 'delivered';
          }

          if (syncedStatus) {
            nextDispatches = st.dispatches.map((d) =>
              d.id === activeDispatch.id
                ? {
                    ...d,
                    dispatchStatus: syncedStatus!,
                    dispatchedAtMs:
                      syncedStatus === 'out_for_delivery'
                        ? d.dispatchedAtMs ?? now
                        : d.dispatchedAtMs,
                    deliveredAtMs:
                      syncedStatus === 'delivered'
                        ? d.deliveredAtMs ?? now
                        : d.deliveredAtMs,
                    updatedAtMs: now,
                  }
                : d,
            );
            nextDispatchHistory = [
              ...st.dispatchHistory,
              {
                id: `demo_dh_${now}_${st.dispatchHistory.length + 1}`,
                tenantId: activeDispatch.tenantId,
                dispatchId: activeDispatch.id,
                orderId: activeDispatch.orderId,
                courierId: activeDispatch.courierId,
                courierName: activeDispatch.courierNameSnapshot,
                fromStatus: activeDispatch.dispatchStatus,
                toStatus: syncedStatus,
                actorUserId: null,
                actorEmail: '',
                actorType: 'system',
                reason: 'Sincronizado automaticamente com o status do pedido.',
                createdAtMs: now,
              },
            ];
          }
        }
      }
    }

    writeDemoState({
      ...st,
      orders: st.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
      sales: nextSales,
      dispatches: nextDispatches,
      dispatchHistory: nextDispatchHistory,
    });
  },
  createDeliveryCustomer(
    input: DeliveryCustomerInput,
    initialAddress?: DeliveryCustomerAddressInput | null,
  ): string {
    const st = readDemoState();
    const name = input.name.trim();
    if (name.length < 2) throw new Error('Informe o nome completo do cliente.');
    if (!isValidCustomerPhone(input.phone)) {
      throw new Error('Informe um telefone/WhatsApp válido com DDD.');
    }
    if (!isValidOptionalCpf(input.cpf)) {
      throw new Error('O CPF informado é inválido.');
    }
    const normalizedPhone = normalizeCustomerPhone(input.phone);
    if (st.customers.some((c) => c.normalizedPhone === normalizedPhone)) {
      throw new Error('Já existe um cliente cadastrado com este telefone.');
    }
    const now = Date.now();
    const id = `demo_cust_${now}`;
    const nextCustomers: DeliveryCustomerRecord[] = [
      {
        id,
        tenantId: 'mgw_lanches',
        name,
        phone: input.phone.trim(),
        normalizedPhone,
        email: (input.email || '').trim(),
        cpf: (input.cpf || '').replace(/\D/g, ''),
        birthDate: input.birthDate || null,
        notes: (input.notes || '').trim(),
        createdAtMs: now,
        updatedAtMs: now,
      },
      ...st.customers,
    ];
    let nextAddresses = st.customerAddresses;
    if (initialAddress && initialAddress.street.trim().length >= 3) {
      nextAddresses = [
        ...nextAddresses,
        {
          id: `demo_addr_${now}`,
          tenantId: 'mgw_lanches',
          customerId: id,
          label: initialAddress.label?.trim() || 'Principal',
          cep: initialAddress.cep?.trim() || '',
          street: initialAddress.street.trim(),
          number: initialAddress.number?.trim() || '',
          neighborhood: initialAddress.neighborhood?.trim() || '',
          complement: initialAddress.complement?.trim() || '',
          reference: initialAddress.reference?.trim() || '',
          city: initialAddress.city?.trim() || '',
          state: initialAddress.state?.trim().toUpperCase() || '',
          isPrimary: true,
          createdAtMs: now,
          updatedAtMs: now,
        },
      ];
    }
    writeDemoState({ ...st, customers: nextCustomers, customerAddresses: nextAddresses });
    return id;
  },
  updateDeliveryCustomer(customerId: string, input: DeliveryCustomerInput) {
    const st = readDemoState();
    const name = input.name.trim();
    if (name.length < 2) throw new Error('Informe o nome completo do cliente.');
    if (!isValidCustomerPhone(input.phone)) {
      throw new Error('Informe um telefone/WhatsApp válido com DDD.');
    }
    if (!isValidOptionalCpf(input.cpf)) {
      throw new Error('O CPF informado é inválido.');
    }
    const normalizedPhone = normalizeCustomerPhone(input.phone);
    if (
      st.customers.some(
        (c) => c.id !== customerId && c.normalizedPhone === normalizedPhone,
      )
    ) {
      throw new Error('Já existe outro cliente cadastrado com este telefone.');
    }
    const now = Date.now();
    writeDemoState({
      ...st,
      customers: st.customers.map((c) =>
        c.id === customerId
          ? {
              ...c,
              name,
              phone: input.phone.trim(),
              normalizedPhone,
              email: (input.email || '').trim(),
              cpf: (input.cpf || '').replace(/\D/g, ''),
              birthDate: input.birthDate || null,
              notes: (input.notes || '').trim(),
              updatedAtMs: now,
            }
          : c,
      ),
    });
  },
  saveDeliveryCustomerAddress(
    customerId: string,
    input: DeliveryCustomerAddressInput,
    addressId?: string,
  ) {
    const st = readDemoState();
    const now = Date.now();
    const street = input.street.trim();
    if (street.length < 3) throw new Error('Informe a rua/logradouro do endereço.');
    const existingForCustomer = st.customerAddresses.filter(
      (a) => a.customerId === customerId,
    );
    const shouldBePrimary = Boolean(input.isPrimary) || existingForCustomer.length === 0;
    let nextAddresses = st.customerAddresses.map((a) =>
      shouldBePrimary && a.customerId === customerId && a.id !== addressId
        ? { ...a, isPrimary: false }
        : a,
    );
    if (addressId) {
      nextAddresses = nextAddresses.map((a) =>
        a.id === addressId
          ? {
              ...a,
              label: input.label?.trim() || '',
              cep: input.cep?.trim() || '',
              street,
              number: input.number?.trim() || '',
              neighborhood: input.neighborhood?.trim() || '',
              complement: input.complement?.trim() || '',
              reference: input.reference?.trim() || '',
              city: input.city?.trim() || '',
              state: input.state?.trim().toUpperCase() || '',
              isPrimary: shouldBePrimary ? true : a.isPrimary,
              updatedAtMs: now,
            }
          : a,
      );
    } else {
      nextAddresses = [
        ...nextAddresses,
        {
          id: `demo_addr_${now}`,
          tenantId: 'mgw_lanches',
          customerId,
          label: input.label?.trim() || '',
          cep: input.cep?.trim() || '',
          street,
          number: input.number?.trim() || '',
          neighborhood: input.neighborhood?.trim() || '',
          complement: input.complement?.trim() || '',
          reference: input.reference?.trim() || '',
          city: input.city?.trim() || '',
          state: input.state?.trim().toUpperCase() || '',
          isPrimary: shouldBePrimary,
          createdAtMs: now,
          updatedAtMs: now,
        },
      ];
    }
    writeDemoState({ ...st, customerAddresses: nextAddresses });
  },
  deleteDeliveryCustomerAddress(customerId: string, addressId: string) {
    const st = readDemoState();
    const remaining = st.customerAddresses.filter((a) => a.id !== addressId);
    const custLeft = remaining.filter((a) => a.customerId === customerId);
    if (custLeft.length > 0 && !custLeft.some((a) => a.isPrimary)) {
      const firstId = custLeft[0].id;
      writeDemoState({
        ...st,
        customerAddresses: remaining.map((a) =>
          a.id === firstId ? { ...a, isPrimary: true } : a,
        ),
      });
      return;
    }
    writeDemoState({ ...st, customerAddresses: remaining });
  },
  setPrimaryDeliveryCustomerAddress(customerId: string, addressId: string) {
    const st = readDemoState();
    writeDemoState({
      ...st,
      customerAddresses: st.customerAddresses.map((a) =>
        a.customerId === customerId
          ? { ...a, isPrimary: a.id === addressId }
          : a,
      ),
    });
  },
  saveCustomerClassificationConfig(config: DeliveryCustomerClassificationConfig) {
    const st = readDemoState();
    writeDemoState({
      ...st,
      customerClassificationConfig: normalizeClassificationConfig(config),
    });
  },
  createDeliveryCourier(input: DeliveryCourierInput): string {
    const st = readDemoState();
    const name = input.name.trim();
    if (name.length < 2) throw new Error('Informe o nome completo do entregador.');
    if (!isValidCustomerPhone(input.phone)) {
      throw new Error('Informe um telefone válido com DDD.');
    }
    const rawWa = (input.whatsapp || '').trim();
    if (rawWa && !isValidCustomerPhone(rawWa)) {
      throw new Error('Informe um WhatsApp válido com DDD ou deixe em branco.');
    }
    if (!isValidOptionalCpf(input.cpf)) {
      throw new Error('O CPF informado é inválido.');
    }
    const normalizedPhone = normalizeCustomerPhone(input.phone);
    if (st.couriers.some((c) => c.normalizedPhone === normalizedPhone)) {
      throw new Error('Já existe um entregador cadastrado com este telefone.');
    }
    const now = Date.now();
    const id = `demo_courier_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const status: DeliveryCourierStatus =
      input.status === 'inactive' ? 'inactive' : 'active';
    const availabilityStatus: DeliveryCourierAvailability =
      status === 'inactive'
        ? 'unavailable'
        : input.availabilityStatus === 'unavailable'
          ? 'unavailable'
          : 'available';

    const record: DeliveryCourierRecord = {
      id,
      tenantId: 'mgw_lanches',
      name,
      phone: input.phone.trim(),
      normalizedPhone,
      whatsapp: rawWa,
      normalizedWhatsapp: rawWa ? normalizeCustomerPhone(rawWa) : '',
      cpf: (input.cpf || '').replace(/\D/g, ''),
      email: (input.email || '').trim().toLowerCase(),
      motorcycleBrand: (input.motorcycleBrand || '').trim(),
      motorcycleModel: (input.motorcycleModel || '').trim(),
      motorcycleColor: (input.motorcycleColor || '').trim(),
      motorcyclePlate: normalizeCourierPlateForStorage(input.motorcyclePlate),
      courierType: normalizeCourierType(input.courierType),
      status,
      availabilityStatus,
      notes: (input.notes || '').trim(),
      createdAtMs: now,
      updatedAtMs: now,
    };

    writeDemoState({
      ...st,
      couriers: [record, ...st.couriers],
    });
    return id;
  },
  updateDeliveryCourier(courierId: string, input: DeliveryCourierInput) {
    const st = readDemoState();
    const name = input.name.trim();
    if (name.length < 2) throw new Error('Informe o nome completo do entregador.');
    if (!isValidCustomerPhone(input.phone)) {
      throw new Error('Informe um telefone válido com DDD.');
    }
    const rawWa = (input.whatsapp || '').trim();
    if (rawWa && !isValidCustomerPhone(rawWa)) {
      throw new Error('Informe um WhatsApp válido com DDD ou deixe em branco.');
    }
    if (!isValidOptionalCpf(input.cpf)) {
      throw new Error('O CPF informado é inválido.');
    }
    const normalizedPhone = normalizeCustomerPhone(input.phone);
    if (
      st.couriers.some(
        (c) => c.id !== courierId && c.normalizedPhone === normalizedPhone,
      )
    ) {
      throw new Error('Já existe outro entregador cadastrado com este telefone.');
    }
    const now = Date.now();
    const status: DeliveryCourierStatus =
      input.status === 'inactive' ? 'inactive' : 'active';
    const availabilityStatus: DeliveryCourierAvailability =
      status === 'inactive'
        ? 'unavailable'
        : input.availabilityStatus === 'unavailable'
          ? 'unavailable'
          : 'available';

    writeDemoState({
      ...st,
      couriers: st.couriers.map((c) =>
        c.id === courierId
          ? {
              ...c,
              name,
              phone: input.phone.trim(),
              normalizedPhone,
              whatsapp: rawWa,
              normalizedWhatsapp: rawWa ? normalizeCustomerPhone(rawWa) : '',
              cpf: (input.cpf || '').replace(/\D/g, ''),
              email: (input.email || '').trim().toLowerCase(),
              motorcycleBrand: (input.motorcycleBrand || '').trim(),
              motorcycleModel: (input.motorcycleModel || '').trim(),
              motorcycleColor: (input.motorcycleColor || '').trim(),
              motorcyclePlate: normalizeCourierPlateForStorage(input.motorcyclePlate),
              courierType: normalizeCourierType(input.courierType),
              status,
              availabilityStatus,
              notes: (input.notes || '').trim(),
              updatedAtMs: now,
            }
          : c,
      ),
    });
  },
  setDeliveryCourierStatus(courierId: string, status: DeliveryCourierStatus) {
    const st = readDemoState();
    const now = Date.now();
    writeDemoState({
      ...st,
      couriers: st.couriers.map((c) =>
        c.id === courierId
          ? {
              ...c,
              status,
              availabilityStatus:
                status === 'inactive' ? 'unavailable' : c.availabilityStatus,
              updatedAtMs: now,
            }
          : c,
      ),
    });
  },
  setDeliveryCourierAvailability(
    courierId: string,
    availabilityStatus: DeliveryCourierAvailability,
  ) {
    const st = readDemoState();
    const target = st.couriers.find((c) => c.id === courierId);
    if (!target) return;
    if (target.status === 'inactive' && availabilityStatus === 'available') {
      throw new Error('Ative o entregador antes de marcá-lo como disponível.');
    }
    const now = Date.now();
    writeDemoState({
      ...st,
      couriers: st.couriers.map((c) =>
        c.id === courierId
          ? { ...c, availabilityStatus, updatedAtMs: now }
          : c,
      ),
    });
  },
  deleteDeliveryCourier(courierId: string) {
    const st = readDemoState();
    if (st.dispatches.some((d) => d.courierId === courierId)) {
      throw new Error(
        'Este entregador possui entregas vinculadas e não pode ser excluído definitivamente. Desative-o para preservar o histórico.',
      );
    }
    writeDemoState({
      ...st,
      couriers: st.couriers.filter((c) => c.id !== courierId),
    });
  },
  assignDeliveryCourier(
    orderId: string,
    courierId: string,
    notes = '',
    actorEmail = 'demo@mgw.com',
  ): string {
    const st = readDemoState();
    const order = st.orders.find((o) => o.id === orderId) ?? null;
    const courier = st.couriers.find((c) => c.id === courierId) ?? null;
    const check = validateCourierAssignmentEligibility({
      order,
      courier,
      existingDispatches: st.dispatches,
    });
    if (!check.valid || !order || !courier) {
      throw new Error(check.error || 'Não foi possível atribuir o entregador.');
    }

    const now = Date.now();
    const cleanNotes = notes.trim().slice(0, 500);
    const courierType = normalizeCourierType(courier.courierType);
    const dispatchId = `demo_disp_${now}_${Math.random().toString(36).slice(2, 6)}`;

    let nextOrders = st.orders;
    let nextSales = st.sales;
    if (order.status === 'received') {
      const stepped = applyOrderStatusStep(order, 'accepted', '', now, st.sales);
      nextOrders = st.orders.map((o) => (o.id === order.id ? stepped.updatedOrder : o));
      nextSales = stepped.nextSales;
    }

    const newDispatch: DeliveryDispatchRecord = {
      id: dispatchId,
      tenantId: order.tenantId,
      orderId: order.id,
      courierId: courier.id,
      dispatchStatus: 'awaiting_acceptance',
      courierNameSnapshot: courier.name,
      courierPhoneSnapshot: courier.phone,
      courierTypeSnapshot: courierType,
      assignedByUserId: 'demo-owner',
      assignedByEmail: actorEmail,
      assignedAtMs: now,
      acceptedAtMs: null,
      dispatchedAtMs: null,
      deliveredAtMs: null,
      rejectedAtMs: null,
      cancelledAtMs: null,
      rejectionReason: '',
      cancellationReason: '',
      notes: cleanNotes,
      createdAtMs: now,
      updatedAtMs: now,
    };

    const h1: DeliveryDispatchHistoryRecord = {
      id: `demo_dh_${now}_1_${Math.random().toString(36).slice(2, 5)}`,
      tenantId: order.tenantId,
      dispatchId,
      orderId: order.id,
      courierId: courier.id,
      courierName: courier.name,
      fromStatus: 'awaiting_dispatch',
      toStatus: 'courier_assigned',
      actorUserId: 'demo-owner',
      actorEmail,
      actorType: 'admin',
      reason: cleanNotes || 'Entregador atribuído pela central de despacho.',
      createdAtMs: now,
    };

    const h2: DeliveryDispatchHistoryRecord = {
      id: `demo_dh_${now}_2_${Math.random().toString(36).slice(2, 5)}`,
      tenantId: order.tenantId,
      dispatchId,
      orderId: order.id,
      courierId: courier.id,
      courierName: courier.name,
      fromStatus: 'courier_assigned',
      toStatus: 'awaiting_acceptance',
      actorUserId: 'demo-owner',
      actorEmail,
      actorType: 'system',
      reason: 'Entrega enviada para aceite do entregador.',
      createdAtMs: now + 1,
    };

    writeDemoState({
      ...st,
      orders: nextOrders,
      sales: nextSales,
      dispatches: [newDispatch, ...st.dispatches],
      dispatchHistory: [...st.dispatchHistory, h1, h2],
    });
    return dispatchId;
  },
  reassignDeliveryCourier(
    dispatchId: string,
    newCourierId: string,
    reason = '',
    actorEmail = 'demo@mgw.com',
  ): string {
    const st = readDemoState();
    const current = st.dispatches.find((d) => d.id === dispatchId);
    if (!current) throw new Error('Despacho não encontrado.');
    if (!isActiveDispatchStatus(current.dispatchStatus)) {
      throw new Error('Este despacho já foi encerrado e não pode ser reatribuído diretamente.');
    }
    if (current.dispatchStatus === 'out_for_delivery') {
      throw new Error('Entrega já saiu em rota. Cancele o despacho antes de realizar nova atribuição.');
    }
    if (current.courierId === newCourierId) {
      throw new Error('Selecione um entregador diferente do atual para reatribuir.');
    }
    const order = st.orders.find((o) => o.id === current.orderId);
    if (!order || isTerminalOrderStatus(order.status)) {
      throw new Error('Pedido finalizado não permite reatribuição.');
    }
    const newCourier = st.couriers.find(
      (c) => c.id === newCourierId && c.tenantId === current.tenantId,
    );
    if (!newCourier) {
      throw new Error('Novo entregador não encontrado neste estabelecimento.');
    }
    if (newCourier.status !== 'active' || newCourier.availabilityStatus !== 'available') {
      throw new Error('Selecione um entregador ativo e disponível para reatribuir.');
    }

    const now = Date.now();
    const cleanReason =
      reason.trim().length >= 3
        ? reason.trim().slice(0, 300)
        : 'Reatribuição realizada pela central de despacho.';
    const newDispatchId = `demo_disp_${now}_${Math.random().toString(36).slice(2, 6)}`;

    const cancelledDispatch: DeliveryDispatchRecord = {
      ...current,
      dispatchStatus: 'delivery_cancelled',
      cancelledAtMs: now,
      cancellationReason: cleanReason,
      updatedAtMs: now,
    };

    const newDispatch: DeliveryDispatchRecord = {
      id: newDispatchId,
      tenantId: current.tenantId,
      orderId: current.orderId,
      courierId: newCourier.id,
      dispatchStatus: 'awaiting_acceptance',
      courierNameSnapshot: newCourier.name,
      courierPhoneSnapshot: newCourier.phone,
      courierTypeSnapshot: normalizeCourierType(newCourier.courierType),
      assignedByUserId: 'demo-owner',
      assignedByEmail: actorEmail,
      assignedAtMs: now + 1,
      acceptedAtMs: null,
      dispatchedAtMs: null,
      deliveredAtMs: null,
      rejectedAtMs: null,
      cancelledAtMs: null,
      rejectionReason: '',
      cancellationReason: '',
      notes: current.notes,
      createdAtMs: now + 1,
      updatedAtMs: now + 1,
    };

    const hCancel: DeliveryDispatchHistoryRecord = {
      id: `demo_dh_${now}_rc_${Math.random().toString(36).slice(2, 5)}`,
      tenantId: current.tenantId,
      dispatchId: current.id,
      orderId: current.orderId,
      courierId: current.courierId,
      courierName: current.courierNameSnapshot,
      fromStatus: current.dispatchStatus,
      toStatus: 'delivery_cancelled',
      actorUserId: 'demo-owner',
      actorEmail,
      actorType: 'admin',
      reason: cleanReason,
      createdAtMs: now,
    };

    const hNew1: DeliveryDispatchHistoryRecord = {
      id: `demo_dh_${now}_rn1_${Math.random().toString(36).slice(2, 5)}`,
      tenantId: current.tenantId,
      dispatchId: newDispatchId,
      orderId: current.orderId,
      courierId: newCourier.id,
      courierName: newCourier.name,
      fromStatus: 'awaiting_dispatch',
      toStatus: 'courier_assigned',
      actorUserId: 'demo-owner',
      actorEmail,
      actorType: 'admin',
      reason: `Reatribuído: ${cleanReason}`,
      createdAtMs: now + 2,
    };

    const hNew2: DeliveryDispatchHistoryRecord = {
      id: `demo_dh_${now}_rn2_${Math.random().toString(36).slice(2, 5)}`,
      tenantId: current.tenantId,
      dispatchId: newDispatchId,
      orderId: current.orderId,
      courierId: newCourier.id,
      courierName: newCourier.name,
      fromStatus: 'courier_assigned',
      toStatus: 'awaiting_acceptance',
      actorUserId: 'demo-owner',
      actorEmail,
      actorType: 'system',
      reason: 'Entrega enviada para aceite do novo entregador.',
      createdAtMs: now + 3,
    };

    writeDemoState({
      ...st,
      dispatches: [
        newDispatch,
        ...st.dispatches.map((d) => (d.id === current.id ? cancelledDispatch : d)),
      ],
      dispatchHistory: [...st.dispatchHistory, hCancel, hNew1, hNew2],
    });
    return newDispatchId;
  },
  cancelDeliveryDispatch(
    dispatchId: string,
    reason: string,
    actorEmail = 'demo@mgw.com',
  ) {
    const st = readDemoState();
    const current = st.dispatches.find((d) => d.id === dispatchId);
    if (!current) throw new Error('Atribuição de entrega não encontrada.');
    if (!isActiveDispatchStatus(current.dispatchStatus)) {
      throw new Error('Esta entrega já foi finalizada ou encerrada.');
    }
    const cleanReason = reason.trim().slice(0, 300);
    if (cleanReason.length < 3) {
      throw new Error('Informe o motivo do cancelamento (mínimo 3 caracteres).');
    }
    const now = Date.now();
    writeDemoState({
      ...st,
      dispatches: st.dispatches.map((d) =>
        d.id === current.id
          ? {
              ...d,
              dispatchStatus: 'delivery_cancelled',
              cancelledAtMs: now,
              cancellationReason: cleanReason,
              updatedAtMs: now,
            }
          : d,
      ),
      dispatchHistory: [
        ...st.dispatchHistory,
        {
          id: `demo_dh_${now}_c_${Math.random().toString(36).slice(2, 5)}`,
          tenantId: current.tenantId,
          dispatchId: current.id,
          orderId: current.orderId,
          courierId: current.courierId,
          courierName: current.courierNameSnapshot,
          fromStatus: current.dispatchStatus,
          toStatus: 'delivery_cancelled',
          actorUserId: 'demo-owner',
          actorEmail,
          actorType: 'admin',
          reason: cleanReason,
          createdAtMs: now,
        },
      ],
    });
  },
  respondDeliveryDispatch(
    dispatchId: string,
    decision: 'accept' | 'reject',
    reason = '',
    actorEmail = 'demo@mgw.com',
  ) {
    const st = readDemoState();
    const current = st.dispatches.find((d) => d.id === dispatchId);
    if (!current) throw new Error('Despacho não encontrado.');
    if (current.dispatchStatus !== 'awaiting_acceptance') {
      throw new Error('Este despacho não está mais aguardando aceite.');
    }
    const order = st.orders.find((o) => o.id === current.orderId);
    if (!order || isTerminalOrderStatus(order.status)) {
      throw new Error('O pedido vinculado já foi finalizado ou cancelado.');
    }
    const now = Date.now();
    if (decision === 'accept') {
      writeDemoState({
        ...st,
        dispatches: st.dispatches.map((d) =>
          d.id === current.id
            ? {
                ...d,
                dispatchStatus: 'delivery_accepted',
                acceptedAtMs: d.acceptedAtMs ?? now,
                updatedAtMs: now,
              }
            : d,
        ),
        dispatchHistory: [
          ...st.dispatchHistory,
          {
            id: `demo_dh_${now}_acc_${Math.random().toString(36).slice(2, 5)}`,
            tenantId: current.tenantId,
            dispatchId: current.id,
            orderId: current.orderId,
            courierId: current.courierId,
            courierName: current.courierNameSnapshot,
            fromStatus: current.dispatchStatus,
            toStatus: 'delivery_accepted',
            actorUserId: 'demo-owner',
            actorEmail,
            actorType: 'courier',
            reason: 'Entrega aceita pelo entregador.',
            createdAtMs: now,
          },
        ],
      });
      return;
    }

    const cleanReason = reason.trim().slice(0, 300);
    if (cleanReason.length < 3) {
      throw new Error('Informe o motivo da recusa (mínimo 3 caracteres).');
    }

    writeDemoState({
      ...st,
      dispatches: st.dispatches.map((d) =>
        d.id === current.id
          ? {
              ...d,
              dispatchStatus: 'delivery_rejected',
              rejectedAtMs: now,
              rejectionReason: cleanReason,
              updatedAtMs: now,
            }
          : d,
      ),
      dispatchHistory: [
        ...st.dispatchHistory,
        {
          id: `demo_dh_${now}_rej_${Math.random().toString(36).slice(2, 5)}`,
          tenantId: current.tenantId,
          dispatchId: current.id,
          orderId: current.orderId,
          courierId: current.courierId,
          courierName: current.courierNameSnapshot,
          fromStatus: current.dispatchStatus,
          toStatus: 'delivery_rejected',
          actorUserId: 'demo-owner',
          actorEmail,
          actorType: 'courier',
          reason: cleanReason,
          createdAtMs: now,
        },
      ],
    });
  },
  advanceDeliveryDispatchStatus(
    dispatchId: string,
    nextStatus: DeliveryDispatchStatus,
    actorEmail = 'demo@mgw.com',
  ) {
    const st = readDemoState();
    const current = st.dispatches.find((d) => d.id === dispatchId);
    if (!current) throw new Error('Despacho não encontrado.');

    const validTransition =
      (current.dispatchStatus === 'delivery_accepted' &&
        (nextStatus === 'preparing' ||
          nextStatus === 'ready_for_dispatch' ||
          nextStatus === 'out_for_delivery')) ||
      (current.dispatchStatus === 'preparing' &&
        (nextStatus === 'ready_for_dispatch' ||
          nextStatus === 'out_for_delivery')) ||
      (current.dispatchStatus === 'ready_for_dispatch' &&
        nextStatus === 'out_for_delivery') ||
      (current.dispatchStatus === 'out_for_delivery' &&
        nextStatus === 'delivered');

    if (!validTransition) {
      throw new Error(
        `Transição operacional inválida de ${DISPATCH_STATUS_LABELS[current.dispatchStatus]} para ${DISPATCH_STATUS_LABELS[nextStatus]}.`,
      );
    }

    let order = st.orders.find((o) => o.id === current.orderId);
    if (!order) throw new Error('Pedido vinculado não encontrado.');
    if (isTerminalOrderStatus(order.status)) {
      throw new Error('Pedido já finalizado não permite alteração.');
    }

    const now = Date.now();
    let nextSales = st.sales;

    const advanceOrderIfNeeded = (target: OnlineOrderStatus) => {
      if (!order) return;
      const res = applyOrderStatusStep(order, target, '', now, nextSales);
      order = res.updatedOrder;
      nextSales = res.nextSales;
    };

    if (order.status === 'received') {
      advanceOrderIfNeeded('accepted');
    }
    if (
      (nextStatus === 'preparing' ||
        nextStatus === 'ready_for_dispatch' ||
        nextStatus === 'out_for_delivery' ||
        nextStatus === 'delivered') &&
      order.status === 'accepted'
    ) {
      advanceOrderIfNeeded('preparing');
    }
    if (
      (nextStatus === 'ready_for_dispatch' ||
        nextStatus === 'out_for_delivery' ||
        nextStatus === 'delivered') &&
      order.status === 'preparing'
    ) {
      advanceOrderIfNeeded('ready');
    }
    if (
      (nextStatus === 'out_for_delivery' || nextStatus === 'delivered') &&
      order.status === 'ready'
    ) {
      advanceOrderIfNeeded('out_for_delivery');
    }
    if (nextStatus === 'delivered' && order.status === 'out_for_delivery') {
      advanceOrderIfNeeded('completed');
    }

    writeDemoState({
      ...st,
      orders: st.orders.map((o) => (o.id === order!.id ? order! : o)),
      sales: nextSales,
      dispatches: st.dispatches.map((d) =>
        d.id === current.id
          ? {
              ...d,
              dispatchStatus: nextStatus,
              dispatchedAtMs:
                nextStatus === 'out_for_delivery'
                  ? d.dispatchedAtMs ?? now
                  : d.dispatchedAtMs,
              deliveredAtMs:
                nextStatus === 'delivered'
                  ? d.deliveredAtMs ?? now
                  : d.deliveredAtMs,
              updatedAtMs: now,
            }
          : d,
      ),
      dispatchHistory: [
        ...st.dispatchHistory,
        {
          id: `demo_dh_${now}_adv_${Math.random().toString(36).slice(2, 5)}`,
          tenantId: current.tenantId,
          dispatchId: current.id,
          orderId: current.orderId,
          courierId: current.courierId,
          courierName: current.courierNameSnapshot,
          fromStatus: current.dispatchStatus,
          toStatus: nextStatus,
          actorUserId: 'demo-owner',
          actorEmail,
          actorType: 'admin',
          reason: DISPATCH_STATUS_LABELS[nextStatus],
          createdAtMs: now,
        },
      ],
    });
  },
  createDeliveryRegion(input: DeliveryRegionInput): string {
    const st = readDemoState();
    const validation = validateDeliveryRegionInput(input, st.deliveryRegions);
    if (!validation.valid) {
      throw new Error(validation.error || 'Dados da região inválidos.');
    }
    const now = Date.now();
    const id = `demo_region_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const suspended = Boolean(input.isTemporarilySuspended);
    const record: DeliveryRegionRecord = {
      id,
      tenantId: 'mgw_lanches',
      name: input.name.trim().replace(/\s+/g, ' ').slice(0, 100),
      city: input.city.trim().replace(/\s+/g, ' ').slice(0, 100),
      neighborhoods: deduplicateNeighborhoods(validation.normalizedNeighborhoods),
      description: (input.description || '').trim().slice(0, 300),
      deliveryFee: roundCurrency(Math.max(0, Number(input.deliveryFee) || 0)),
      minimumOrderAmount: roundCurrency(
        Math.max(0, Number(input.minimumOrderAmount ?? 0) || 0),
      ),
      estimatedTime: (input.estimatedTime || '').trim().slice(0, 60),
      status: input.status === 'inactive' ? 'inactive' : 'active',
      isTemporarilySuspended: suspended,
      suspensionReason: suspended
        ? (input.suspensionReason || '').trim().slice(0, 300)
        : '',
      scheduleEnabled: Boolean(input.scheduleEnabled),
      scheduleDays:
        input.scheduleDays && input.scheduleDays.length > 0
          ? [...new Set(input.scheduleDays)].sort((a, b) => a - b)
          : [0, 1, 2, 3, 4, 5, 6],
      scheduleStart: isValidTimeHHMM(input.scheduleStart || '')
        ? String(input.scheduleStart)
        : '00:00',
      scheduleEnd: isValidTimeHHMM(input.scheduleEnd || '')
        ? String(input.scheduleEnd)
        : '23:59',
      notes: (input.notes || '').trim().slice(0, 1000),
      createdAtMs: now,
      updatedAtMs: now,
    };

    writeDemoState({
      ...st,
      deliveryRegions: [record, ...st.deliveryRegions],
    });
    return id;
  },
  updateDeliveryRegion(regionId: string, input: DeliveryRegionInput) {
    const st = readDemoState();
    const validation = validateDeliveryRegionInput(
      input,
      st.deliveryRegions,
      regionId,
    );
    if (!validation.valid) {
      throw new Error(validation.error || 'Dados da região inválidos.');
    }
    const now = Date.now();
    const suspended = Boolean(input.isTemporarilySuspended);
    writeDemoState({
      ...st,
      deliveryRegions: st.deliveryRegions.map((r) =>
        r.id === regionId
          ? {
              ...r,
              name: input.name.trim().replace(/\s+/g, ' ').slice(0, 100),
              city: input.city.trim().replace(/\s+/g, ' ').slice(0, 100),
              neighborhoods: deduplicateNeighborhoods(
                validation.normalizedNeighborhoods,
              ),
              description: (input.description || '').trim().slice(0, 300),
              deliveryFee: roundCurrency(
                Math.max(0, Number(input.deliveryFee) || 0),
              ),
              minimumOrderAmount: roundCurrency(
                Math.max(0, Number(input.minimumOrderAmount ?? 0) || 0),
              ),
              estimatedTime: (input.estimatedTime || '').trim().slice(0, 60),
              status: input.status === 'inactive' ? 'inactive' : 'active',
              isTemporarilySuspended: suspended,
              suspensionReason: suspended
                ? (input.suspensionReason || '').trim().slice(0, 300)
                : '',
              scheduleEnabled: Boolean(input.scheduleEnabled),
              scheduleDays:
                input.scheduleDays && input.scheduleDays.length > 0
                  ? [...new Set(input.scheduleDays)].sort((a, b) => a - b)
                  : [0, 1, 2, 3, 4, 5, 6],
              scheduleStart: isValidTimeHHMM(input.scheduleStart || '')
                ? String(input.scheduleStart)
                : '00:00',
              scheduleEnd: isValidTimeHHMM(input.scheduleEnd || '')
                ? String(input.scheduleEnd)
                : '23:59',
              notes: (input.notes || '').trim().slice(0, 1000),
              updatedAtMs: now,
            }
          : r,
      ),
    });
  },
  toggleDeliveryRegionStatus(regionId: string, status: DeliveryRegionStatus) {
    const st = readDemoState();
    const now = Date.now();
    writeDemoState({
      ...st,
      deliveryRegions: st.deliveryRegions.map((r) =>
        r.id === regionId ? { ...r, status, updatedAtMs: now } : r,
      ),
    });
  },
  toggleDeliveryRegionSuspension(
    regionId: string,
    suspended: boolean,
    reason = '',
  ) {
    const st = readDemoState();
    const now = Date.now();
    writeDemoState({
      ...st,
      deliveryRegions: st.deliveryRegions.map((r) =>
        r.id === regionId
          ? {
              ...r,
              isTemporarilySuspended: suspended,
              suspensionReason: suspended ? reason.trim().slice(0, 300) : '',
              updatedAtMs: now,
            }
          : r,
      ),
    });
  },
  deleteDeliveryRegion(regionId: string) {
    const st = readDemoState();
    writeDemoState({
      ...st,
      deliveryRegions: st.deliveryRegions.filter((r) => r.id !== regionId),
    });
  },
  saveDeliveryPricingSettings(input: DeliveryPricingSettingsInput) {
    const st = readDemoState();
    const check = validateDeliveryPricingSettingsInput(input);
    if (!check.valid) {
      throw new Error(check.error || 'Configurações de taxa inválidas.');
    }
    const now = Date.now();
    writeDemoState({
      ...st,
      deliveryPricingSettings: {
        tenantId: st.deliveryPricingSettings.tenantId,
        pricingMode: input.pricingMode,
        defaultFeeEnabled: Boolean(input.defaultFeeEnabled),
        defaultDeliveryFee: roundCurrency(Math.max(0, input.defaultDeliveryFee)),
        defaultMinimumOrderAmount: roundCurrency(
          Math.max(0, input.defaultMinimumOrderAmount),
        ),
        defaultEstimatedTime: (input.defaultEstimatedTime || '').trim().slice(0, 60),
        freeDeliveryEnabled: Boolean(input.freeDeliveryEnabled),
        freeDeliveryMinAmount: roundCurrency(
          Math.max(0, input.freeDeliveryMinAmount),
        ),
        updatedAtMs: now,
      },
    });
  },
};

