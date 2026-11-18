import type {
  ComboInput,
  ComboRecord,
  CreatePublicOrderPayload,
  CreatePublicOrderResponse,
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
  PublicDigitalMenuPayload,
  PublicOrderTrackingRecord,
  SaleInput,
  SaleRecord,
  ShopSettings,
} from '../types/finance';
import { calculateSaleTotal, getLocalTodayDate, roundCurrency } from '../utils/finance';
import {
  buildSaleInputFromCompletedOrder,
  computeCartSummary,
  DEFAULT_DIGITAL_MENU_SETTINGS,
  formatOrderNumber,
  generateTrackingSecretToken,
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
    const parsed = JSON.parse(raw) as DemoState;
    return {
      ...parsed,
      digitalMenu: {
        ...DEFAULT_DIGITAL_MENU_SETTINGS,
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

export function subscribeDemoAdminState(
  callbacks: {
    onSettings: (s: ShopSettings) => void;
    onDigitalMenuSettings: (d: DigitalMenuSettings) => void;
    onProducts: (p: ProductRecord[]) => void;
    onCombos: (c: ComboRecord[]) => void;
    onSales: (s: SaleRecord[]) => void;
    onExpenses: (e: ExpenseRecord[]) => void;
    onOrders: (o: OnlineOrderRecord[]) => void;
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
  addSale(input: SaleInput) {
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
      createdAtMs: now,
      updatedAtMs: now,
    };
    writeDemoState({ ...st, sales: [sale, ...st.sales] });
  },
  updateSale(id: string, input: SaleInput) {
    const st = readDemoState();
    const now = Date.now();
    const totalAmount =
      input.items && input.items.length > 0
        ? roundCurrency(input.items.reduce((acc, i) => acc + i.lineTotal, 0))
        : calculateSaleTotal(input.quantity, input.unitPrice);
    writeDemoState({
      ...st,
      sales: st.sales.map((s) =>
        s.id === id ? { ...s, ...input, totalAmount, updatedAtMs: now } : s,
      ),
    });
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
      return { found: false, store: null, products: [], combos: [] };
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
    return { found: true, store: st.digitalMenu, products, combos };
  },
  async createPublicOrder(payload: CreatePublicOrderPayload): Promise<CreatePublicOrderResponse> {
    const st = readDemoState();
    const activeProds = st.products.filter((p) => p.active);
    const activeCombos = st.combos.filter((c) => c.active);
    const summary = computeCartSummary(
      payload.items,
      activeProds,
      activeCombos,
      st.digitalMenu,
      payload.fulfillmentType,
    );
    const check = validateCheckoutPayload(payload, summary, st.digitalMenu);
    if (!check.valid) throw new Error(check.error || 'Pedido inválido.');

    const trackingToken = generateTrackingSecretToken();
    const tokenHash = await sha256Hex(trackingToken);
    const orderNumber = st.nextOrderSeq;
    const orderCode = trackingToken.slice(0, 6).toUpperCase();
    const orderId = `demo_order_${Date.now()}`;
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

    const newOrder: OnlineOrderRecord = {
      id: orderId,
      tenantId: 'mgw_lanches',
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
    const cleanReason =
      nextStatus === 'rejected' || nextStatus === 'cancelled'
        ? reason.trim()
        : `${ORDER_STATUS_LABELS[nextStatus]}.`;

    let nextSales = st.sales;
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
        ...st.sales.filter((s) => s.onlineOrderId !== order.id),
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
          id: `dh_${now}`,
          fromStatus: order.status,
          toStatus: nextStatus,
          reason: cleanReason,
          actorType: 'admin',
          createdAtMs: now,
        },
      ],
    };

    writeDemoState({
      ...st,
      orders: st.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
      sales: nextSales,
    });
  },
};
