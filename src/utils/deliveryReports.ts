import type { DeliveryCourierRecord, DeliveryDispatchRecord, DeliveryRegionRecord, OnlineOrderRecord } from '../types/finance';

export type DeliveryReportPeriod = '7d' | '30d' | '90d' | 'all';
export interface DeliveryReportMetrics {
  orders: OnlineOrderRecord[];
  totalOrders: number;
  completed: number;
  cancelled: number;
  active: number;
  revenue: number;
  deliveryFees: number;
  averageTicket: number;
  completionRate: number;
  cancellationRate: number;
  averageDeliveryMinutes: number | null;
  repeatCustomers: number;
  uniqueCustomers: number;
  topCustomers: Array<{ key: string; name: string; phone: string; orders: number; spent: number; lastOrderAtMs: number }>;
  couriers: Array<{ id: string; name: string; deliveries: number; completed: number; cancelled: number; completionRate: number; averageMinutes: number | null }>;
  regions: Array<{ name: string; orders: number; completed: number; revenue: number; averageTicket: number }>;
  daily: Array<{ label: string; orders: number; revenue: number }>;
  registeredCustomers: number;
  activeCouriers: number;
  configuredRegions: number;
}

const DAY = 24 * 60 * 60 * 1000;
const isCancelled = (status: string) => status === 'cancelled' || status === 'rejected';
const isFinishedDispatch = (status: string) => status === 'delivered' || status === 'delivery_rejected' || status === 'delivery_cancelled';

export function getDeliveryReportStart(period: DeliveryReportPeriod, now = Date.now()): number {
  if (period === 'all') return 0;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  return now - days * DAY;
}

export function computeDeliveryReportMetrics(
  allOrders: OnlineOrderRecord[],
  dispatches: DeliveryDispatchRecord[],
  customers: Array<{ id: string; name: string; phone: string }> = [],
  couriers: DeliveryCourierRecord[] = [],
  regions: DeliveryRegionRecord[] = [],
  period: DeliveryReportPeriod = '30d',
  now = Date.now(),
): DeliveryReportMetrics {
  const start = getDeliveryReportStart(period, now);
  const orders = allOrders.filter(o => o.fulfillmentType === 'delivery' && o.createdAtMs >= start && o.createdAtMs <= now);
  const orderById = new Map(orders.map(o => [o.id, o]));
  const finished = orders.filter(o => o.status === 'completed');
  const cancelled = orders.filter(o => isCancelled(o.status));
  const active = orders.filter(o => !['completed', 'cancelled', 'rejected'].includes(o.status));
  const validOrders = orders.filter(o => !isCancelled(o.status));
  const revenue = validOrders.reduce((sum, o) => sum + Math.max(0, Number(o.totalAmount) || 0), 0);
  const deliveryFees = orders.reduce((sum, o) => sum + Math.max(0, Number(o.deliveryFee) || 0), 0);
  const deliveryTimes = dispatches
    .filter(d => orderById.has(d.orderId) && d.dispatchStatus === 'delivered' && d.dispatchedAtMs && d.deliveredAtMs && d.deliveredAtMs >= d.dispatchedAtMs)
    .map(d => (d.deliveredAtMs! - d.dispatchedAtMs!) / 60000)
    .filter(v => Number.isFinite(v) && v >= 0 && v <= 24 * 60);
  const averageDeliveryMinutes = deliveryTimes.length ? deliveryTimes.reduce((a,b) => a+b, 0) / deliveryTimes.length : null;

  const customerMap = new Map<string, { key: string; name: string; phone: string; orders: number; spent: number; lastOrderAtMs: number }>();
  for (const order of orders) {
    const phone = (order.customerPhone || '').replace(/\D/g, '');
    const key = order.customerId || phone || `guest:${order.customerName.toLowerCase().trim()}`;
    const existing = customerMap.get(key) || { key, name: order.customerName || 'Cliente', phone: order.customerPhone || '', orders: 0, spent: 0, lastOrderAtMs: 0 };
    existing.orders += 1;
    if (!isCancelled(order.status)) existing.spent += Math.max(0, Number(order.totalAmount) || 0);
    existing.lastOrderAtMs = Math.max(existing.lastOrderAtMs, order.createdAtMs);
    customerMap.set(key, existing);
  }
  const customerRows = [...customerMap.values()].sort((a,b) => b.orders-a.orders || b.spent-a.spent);
  const repeatCustomers = customerRows.filter(c => c.orders >= 2).length;

  const courierMap = new Map<string, { id: string; name: string; deliveries: number; completed: number; cancelled: number; minutes: number[] }>();
  for (const dispatch of dispatches) {
    if (!orderById.has(dispatch.orderId)) continue;
    const id = dispatch.courierId || 'unassigned';
    const row = courierMap.get(id) || { id, name: dispatch.courierNameSnapshot || 'Entregador não identificado', deliveries: 0, completed: 0, cancelled: 0, minutes: [] };
    row.deliveries += 1;
    if (dispatch.dispatchStatus === 'delivered') row.completed += 1;
    if (dispatch.dispatchStatus === 'delivery_cancelled' || dispatch.dispatchStatus === 'delivery_rejected') row.cancelled += 1;
    if (dispatch.dispatchStatus === 'delivered' && dispatch.dispatchedAtMs && dispatch.deliveredAtMs && dispatch.deliveredAtMs >= dispatch.dispatchedAtMs) {
      const minutes = (dispatch.deliveredAtMs - dispatch.dispatchedAtMs) / 60000;
      if (minutes >= 0 && minutes <= 24 * 60) row.minutes.push(minutes);
    }
    courierMap.set(id, row);
  }
  const courierRows = [...courierMap.values()].map(c => ({
    id: c.id, name: c.name, deliveries: c.deliveries, completed: c.completed, cancelled: c.cancelled,
    completionRate: c.deliveries ? c.completed / c.deliveries * 100 : 0,
    averageMinutes: c.minutes.length ? c.minutes.reduce((a,b)=>a+b,0)/c.minutes.length : null,
  })).sort((a,b)=>b.deliveries-a.deliveries);

  const regionMap = new Map<string, { name: string; orders: number; completed: number; revenue: number }>();
  for (const order of orders) {
    const name = (order.deliveryRegionName || order.deliveryNeighborhood || order.deliveryCity || 'Região não informada').trim();
    const row = regionMap.get(name) || { name, orders: 0, completed: 0, revenue: 0 };
    row.orders += 1;
    if (order.status === 'completed') row.completed += 1;
    if (!isCancelled(order.status)) row.revenue += Math.max(0, Number(order.totalAmount) || 0);
    regionMap.set(name, row);
  }
  const regionRows = [...regionMap.values()].map(r=>({...r, averageTicket:r.orders ? r.revenue/r.orders : 0})).sort((a,b)=>b.orders-a.orders);

  const buckets = new Map<string, { label: string; orders: number; revenue: number }>();
  const days = period === '7d' ? 7 : period === '90d' ? 14 : 30;
  const bucketSize = period === '7d' ? DAY : period === '90d' ? 7*DAY : DAY;
  for (let i=days-1;i>=0;i--) {
    const date = new Date(now - i*bucketSize);
    const key = period === '90d'
      ? `${date.getFullYear()}-${date.getMonth()}-${Math.floor(date.getDate()/7)}`
      : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const label = period === '90d' ? date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
    if (!buckets.has(key)) buckets.set(key,{label,orders:0,revenue:0});
  }
  for (const order of orders) {
    const date = new Date(order.createdAtMs);
    const bucketDate = new Date(Math.floor(date.getTime()/bucketSize)*bucketSize);
    const key = period === '90d'
      ? `${bucketDate.getFullYear()}-${bucketDate.getMonth()}-${Math.floor(bucketDate.getDate()/7)}`
      : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const row = buckets.get(key);
    if (row) { row.orders += 1; if (!isCancelled(order.status)) row.revenue += Math.max(0,Number(order.totalAmount)||0); }
  }

  return {
    orders, totalOrders:orders.length, completed:finished.length, cancelled:cancelled.length, active:active.length,
    revenue, deliveryFees, averageTicket:validOrders.length ? revenue/validOrders.length : 0,
    completionRate:orders.length ? finished.length/orders.length*100 : 0,
    cancellationRate:orders.length ? cancelled.length/orders.length*100 : 0,
    averageDeliveryMinutes,
    repeatCustomers, uniqueCustomers:customerRows.length, topCustomers:customerRows.slice(0,8),
    couriers:courierRows, regions:regionRows,
    daily:[...buckets.values()], registeredCustomers:customers.length,
    activeCouriers:couriers.filter(c=>c.status==='active').length, configuredRegions:regions.filter(r=>r.status==='active'&&!r.isTemporarilySuspended).length,
  };
}
