import type {
  OnlineOrderFulfillment,
  OnlineOrderStatus,
  PublicOrderTrackingRecord,
} from '../types/finance';
import {
  isTerminalOrderStatus,
  ORDER_STATUS_LABELS,
  sanitizeMenuSlug,
} from './onlineOrders';

export const TRACKING_RECOVERY_STORAGE_PREFIX = 'mgw_active_orders_v1_';
export const MAX_TRACKED_ORDER_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_ACTIVE_ORDERS_PER_STORE = 10;

export interface StoredTrackedOrder {
  trackingToken: string;
  storeSlug: string;
  orderNumber: number;
  orderCode: string;
  status: OnlineOrderStatus;
  fulfillmentType: OnlineOrderFulfillment;
  totalAmount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

const VALID_TRACKING_STATUSES: ReadonlySet<string> = new Set(
  Object.keys(ORDER_STATUS_LABELS),
);

function resolveStorage(explicit?: Storage | null): Storage | null {
  if (explicit !== undefined) return explicit;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function buildActiveOrdersStorageKey(storeSlug: string): string {
  const normalizedSlug = sanitizeMenuSlug(storeSlug || '', 'default');
  return `${TRACKING_RECOVERY_STORAGE_PREFIX}${normalizedSlug}`;
}

function normalizeStoreSlugKey(slug: string): string {
  return sanitizeMenuSlug(slug || '', 'default');
}

export function parseStoredTrackedOrders(
  raw: string | null,
  expectedStoreSlug: string,
  nowMs = Date.now(),
): StoredTrackedOrder[] {
  if (!raw) return [];
  const targetSlug = normalizeStoreSlugKey(expectedStoreSlug);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seenTokens = new Set<string>();
    const valid: StoredTrackedOrder[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const trackingToken =
        typeof obj.trackingToken === 'string' ? obj.trackingToken.trim() : '';
      const rawSlug =
        typeof obj.storeSlug === 'string' ? obj.storeSlug.trim() : '';
      const storeSlug = normalizeStoreSlugKey(rawSlug);
      const status =
        typeof obj.status === 'string' && VALID_TRACKING_STATUSES.has(obj.status)
          ? (obj.status as OnlineOrderStatus)
          : null;
      const fulfillmentType: OnlineOrderFulfillment =
        obj.fulfillmentType === 'pickup' ? 'pickup' : 'delivery';
      const orderNumber = Math.max(1, Math.trunc(Number(obj.orderNumber) || 1));
      const orderCode =
        typeof obj.orderCode === 'string' && obj.orderCode.trim()
          ? obj.orderCode.trim()
          : `#${String(orderNumber).padStart(4, '0')}`;
      const totalAmount = Math.max(0, Number(obj.totalAmount) || 0);
      const createdAtMs = Number(obj.createdAtMs) || 0;
      const updatedAtMs = Number(obj.updatedAtMs) || createdAtMs;

      if (!trackingToken || trackingToken.length < 8) continue;
      if (storeSlug !== targetSlug) continue;
      if (!status || isTerminalOrderStatus(status)) continue;
      if (createdAtMs <= 0 || nowMs - createdAtMs > MAX_TRACKED_ORDER_AGE_MS) continue;
      if (seenTokens.has(trackingToken)) continue;

      seenTokens.add(trackingToken);
      valid.push({
        trackingToken,
        storeSlug: rawSlug || targetSlug,
        orderNumber,
        orderCode,
        status,
        fulfillmentType,
        totalAmount,
        createdAtMs,
        updatedAtMs,
      });
    }

    return valid
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, MAX_ACTIVE_ORDERS_PER_STORE);
  } catch {
    return [];
  }
}

export function serializeStoredTrackedOrders(orders: StoredTrackedOrder[]): string {
  return JSON.stringify(
    orders
      .filter((entry) => entry.trackingToken && !isTerminalOrderStatus(entry.status))
      .slice(0, MAX_ACTIVE_ORDERS_PER_STORE),
  );
}

export function readActiveTrackedOrders(
  storeSlug: string,
  storageOverride?: Storage | null,
  nowMs = Date.now(),
): StoredTrackedOrder[] {
  const storage = resolveStorage(storageOverride);
  if (!storage || !storeSlug.trim()) return [];
  const key = buildActiveOrdersStorageKey(storeSlug);
  try {
    const raw = storage.getItem(key);
    const parsed = parseStoredTrackedOrders(raw, storeSlug, nowMs);
    if (raw && parsed.length === 0) {
      storage.removeItem(key);
    }
    return parsed;
  } catch {
    return [];
  }
}

function writeActiveTrackedOrders(
  storeSlug: string,
  orders: StoredTrackedOrder[],
  storage: Storage,
): StoredTrackedOrder[] {
  const key = buildActiveOrdersStorageKey(storeSlug);
  try {
    if (orders.length === 0) {
      storage.removeItem(key);
      return [];
    }
    storage.setItem(key, serializeStoredTrackedOrders(orders));
  } catch {
    // Ignore quota / blocked storage cleanly
  }
  return orders;
}

export function upsertTrackedOrder(
  storeSlug: string,
  entry: StoredTrackedOrder,
  storageOverride?: Storage | null,
  nowMs = Date.now(),
): StoredTrackedOrder[] {
  const storage = resolveStorage(storageOverride);
  const cleanToken = entry.trackingToken.trim();
  const cleanSlug = storeSlug.trim() || entry.storeSlug.trim();
  if (!cleanToken || !cleanSlug) return [];

  const existing = storage
    ? readActiveTrackedOrders(cleanSlug, storage, nowMs)
    : [];

  if (isTerminalOrderStatus(entry.status)) {
    const remaining = existing.filter((o) => o.trackingToken !== cleanToken);
    return storage ? writeActiveTrackedOrders(cleanSlug, remaining, storage) : remaining;
  }

  const normalizedEntry: StoredTrackedOrder = {
    ...entry,
    trackingToken: cleanToken,
    storeSlug: cleanSlug,
    orderNumber: Math.max(1, Math.trunc(entry.orderNumber || 1)),
    orderCode:
      entry.orderCode.trim() ||
      `#${String(Math.max(1, Math.trunc(entry.orderNumber || 1))).padStart(4, '0')}`,
    createdAtMs: entry.createdAtMs > 0 ? entry.createdAtMs : nowMs,
    updatedAtMs: entry.updatedAtMs > 0 ? entry.updatedAtMs : nowMs,
  };

  const next = [
    normalizedEntry,
    ...existing.filter((o) => o.trackingToken !== cleanToken),
  ]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, MAX_ACTIVE_ORDERS_PER_STORE);

  return storage ? writeActiveTrackedOrders(cleanSlug, next, storage) : next;
}

export function removeTrackedOrder(
  storeSlug: string,
  trackingToken: string,
  storageOverride?: Storage | null,
  nowMs = Date.now(),
): StoredTrackedOrder[] {
  const storage = resolveStorage(storageOverride);
  if (!storage || !storeSlug.trim() || !trackingToken.trim()) return [];
  const existing = readActiveTrackedOrders(storeSlug, storage, nowMs);
  const remaining = existing.filter((o) => o.trackingToken !== trackingToken.trim());
  return writeActiveTrackedOrders(storeSlug, remaining, storage);
}

export async function reconcileActiveTrackedOrders(
  storeSlug: string,
  fetchOrderByToken: (token: string) => Promise<PublicOrderTrackingRecord | null>,
  storageOverride?: Storage | null,
  nowMs = Date.now(),
): Promise<StoredTrackedOrder[]> {
  const storage = resolveStorage(storageOverride);
  const stored = readActiveTrackedOrders(storeSlug, storage, nowMs);
  if (stored.length === 0) return [];

  const targetSlug = normalizeStoreSlugKey(storeSlug);
  const results = await Promise.allSettled(
    stored.map(async (entry) => ({
      entry,
      live: await fetchOrderByToken(entry.trackingToken),
    })),
  );

  const nextActive: StoredTrackedOrder[] = [];

  for (let i = 0; i < stored.length; i += 1) {
    const res = results[i];
    const fallbackEntry = stored[i];

    if (res.status === 'rejected') {
      // Transient network failure: preserve cached non-terminal reference safely
      nextActive.push(fallbackEntry);
      continue;
    }

    const { live } = res.value;
    if (!live) {
      // Token invalid or order not found anymore
      continue;
    }

    if (normalizeStoreSlugKey(live.storeSlug) !== targetSlug) {
      // Strict multi-tenant isolation: never expose another establishment's order
      continue;
    }

    if (isTerminalOrderStatus(live.status)) {
      // Order completed, rejected, or cancelled while customer was away -> no longer active
      continue;
    }

    nextActive.push({
      trackingToken: fallbackEntry.trackingToken,
      storeSlug: live.storeSlug || fallbackEntry.storeSlug,
      orderNumber: live.orderNumber,
      orderCode: live.orderCode,
      status: live.status,
      fulfillmentType: live.fulfillmentType,
      totalAmount: live.totalAmount,
      createdAtMs: live.createdAtMs || fallbackEntry.createdAtMs,
      updatedAtMs: live.updatedAtMs || nowMs,
    });
  }

  const sorted = nextActive
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, MAX_ACTIVE_ORDERS_PER_STORE);

  return storage ? writeActiveTrackedOrders(storeSlug, sorted, storage) : sorted;
}

export function extractStepTimestamps(
  order: Pick<PublicOrderTrackingRecord, 'createdAtMs' | 'statusHistory'>,
): Partial<Record<OnlineOrderStatus, number>> {
  const map: Partial<Record<OnlineOrderStatus, number>> = {};
  if (order.createdAtMs > 0) {
    map.received = order.createdAtMs;
  }
  for (const ev of order.statusHistory) {
    if (ev.createdAtMs > 0 && !map[ev.toStatus]) {
      map[ev.toStatus] = ev.createdAtMs;
    }
  }
  return map;
}
