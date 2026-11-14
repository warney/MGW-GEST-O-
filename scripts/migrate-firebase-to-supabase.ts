import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

export interface LegacyProductDoc {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  unitPrice: number;
  countsAsXSalada: boolean;
  active: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface LegacyComboItem {
  productId: string;
  productName: string;
  quantity: number;
  countsAsXSalada: boolean;
}

export interface LegacyComboDoc {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  items: LegacyComboItem[];
  salePrice: number;
  estimatedCost: number;
  active: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface LegacySaleComponent {
  productId: string;
  productName: string;
  quantityPerUnit: number;
  totalQuantity: number;
  countsAsXSalada: boolean;
}

export interface LegacySaleItem {
  kind: 'product' | 'combo';
  refId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  estimatedUnitCost: number;
  xSaladasPerUnit: number;
  components: LegacySaleComponent[];
}

export interface LegacySaleDoc {
  id: string;
  ownerId: string;
  date: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: string;
  note: string;
  saleMode: 'individual' | 'combo' | 'mixed' | null;
  xSaladaCount: number | null;
  combosCount: number | null;
  items: LegacySaleItem[] | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface LegacyExpenseDoc {
  id: string;
  ownerId: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  paymentMethod: string;
  note: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface LegacySettingsDoc {
  ownerId: string;
  establishmentName: string;
  xSaladaPrice: number;
  dailyGoal: number;
  monthlyGoal: number;
  startDate: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface TenantParitySummary {
  productsCount: number;
  combosCount: number;
  salesCount: number;
  expensesCount: number;
  salesTotalAmount: number;
  expensesTotalAmount: number;
  totalXSaladas: number;
  totalCombosSold: number;
  paymentBreakdown: Record<string, number>;
  snapshotsCount: number;
  minSaleDate: string | null;
  maxSaleDate: string | null;
}

export function normalizeLegacyDateOnly(raw: unknown, fieldLabel = 'data'): string {
  let value = raw;
  if (value instanceof Timestamp) value = value.toDate();
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error(`Campo ${fieldLabel} contém uma data inválida.`);
    return value.toISOString().slice(0, 10);
  }
  const s = typeof value === 'string' ? value.trim() : '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : '';
  if (!dateOnly) throw new Error(`Campo ${fieldLabel} ausente ou inválido; migração interrompida para evitar inventar datas.`);
  const parsed = new Date(`${dateOnly}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateOnly) {
    throw new Error(`Campo ${fieldLabel} contém uma data inexistente: ${dateOnly}.`);
  }
  return dateOnly;
}

export function timestampValueToIso(raw: unknown, fieldLabel = 'timestamp'): string {
  let value = raw;
  if (value instanceof Timestamp) value = value.toDate();
  if (value && typeof value === 'object' && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    value = (value as { toDate: () => Date }).toDate();
  }
  const parsed = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!parsed || !Number.isFinite(parsed.getTime())) {
    throw new Error(`Campo ${fieldLabel} ausente ou inválido; migração interrompida para não criar timestamps artificiais.`);
  }
  return parsed.toISOString();
}

function requireMappedId(map: Map<string, string>, legacyId: string, context: string): string {
  const mapped = map.get(legacyId);
  if (!mapped) throw new Error(`Referência legada sem UUID no Supabase (${context}: ${legacyId}). Corrija o registro dependente antes de continuar.`);
  return mapped;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function transformComboForSupabase(
  tenantId: string,
  combo: LegacyComboDoc,
  productIdMap: Map<string, string>,
) {
  const mappedItems = combo.items.map((item) => ({
    productId: requireMappedId(productIdMap, item.productId, `combo ${combo.id} / produto`),
    productName: item.productName,
    quantity: item.quantity,
    countsAsXSalada: item.countsAsXSalada,
  }));

  return {
    tenant_id: tenantId,
    legacy_id: combo.id,
    owner_email: combo.ownerId || null,
    name: combo.name,
    description: combo.description,
    items: mappedItems,
    sale_price: round2(combo.salePrice),
    estimated_cost: round2(combo.estimatedCost),
    active: combo.active,
    created_at: combo.createdAtIso,
    updated_at: combo.updatedAtIso,
  };
}

export function transformSaleForSupabase(
  tenantId: string,
  sale: LegacySaleDoc,
  productIdMap: Map<string, string>,
  comboIdMap: Map<string, string>,
) {
  const mappedItems = sale.items
    ? sale.items.map((line) => ({
        kind: line.kind,
        refId: line.kind === 'combo'
          ? requireMappedId(comboIdMap, line.refId, `venda ${sale.id} / combo`)
          : requireMappedId(productIdMap, line.refId, `venda ${sale.id} / produto`),
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        estimatedUnitCost: line.estimatedUnitCost,
        xSaladasPerUnit: line.xSaladasPerUnit,
        components: line.components.map((comp) => ({
          productId: requireMappedId(productIdMap, comp.productId, `venda ${sale.id} / componente`),
          productName: comp.productName,
          quantityPerUnit: comp.quantityPerUnit,
          totalQuantity: comp.totalQuantity,
          countsAsXSalada: comp.countsAsXSalada,
        })),
      }))
    : null;

  return {
    tenant_id: tenantId,
    legacy_id: sale.id,
    owner_email: sale.ownerId || null,
    date: normalizeLegacyDateOnly(sale.date),
    quantity: Math.max(0, Math.trunc(sale.quantity)),
    unit_price: round2(sale.unitPrice),
    total_amount: round2(sale.totalAmount),
    payment_method: sale.paymentMethod,
    note: sale.note,
    sale_mode: sale.saleMode,
    x_salada_count: sale.xSaladaCount,
    combos_count: sale.combosCount,
    items: mappedItems,
    created_at: sale.createdAtIso,
    updated_at: sale.updatedAtIso,
  };
}

export function normalizeParityPayment(raw: string): string {
  if (raw === 'Crédito' || raw === 'Cartão de crédito') return 'Cartão de crédito';
  return raw || 'Dinheiro';
}

export function computeDatasetParitySummary(input: {
  productsCount: number;
  combosCount: number;
  sales: Array<{
    date: string;
    quantity: number;
    totalAmount: number;
    paymentMethod: string;
    xSaladaCount: number | null;
    combosCount: number | null;
    items: LegacySaleItem[] | null;
  }>;
  expenses: Array<{ amount: number }>;
}): TenantParitySummary {
  const paymentBreakdown: Record<string, number> = {};
  let salesTotalAmount = 0;
  let totalXSaladas = 0;
  let totalCombosSold = 0;
  let snapshotsCount = 0;
  let minSaleDate: string | null = null;
  let maxSaleDate: string | null = null;

  for (const s of input.sales) {
    salesTotalAmount += Number(s.totalAmount) || 0;
    const xCount =
      typeof s.xSaladaCount === 'number'
        ? s.xSaladaCount
        : s.items && s.items.length > 0
          ? s.items.reduce((acc, i) => acc + i.xSaladasPerUnit * i.quantity, 0)
          : s.quantity;
    totalXSaladas += xCount;

    const cCount =
      typeof s.combosCount === 'number'
        ? s.combosCount
        : s.items && s.items.length > 0
          ? s.items
              .filter((i) => i.kind === 'combo')
              .reduce((acc, i) => acc + i.quantity, 0)
          : 0;
    totalCombosSold += cCount;

    if (s.items && s.items.length > 0) snapshotsCount += 1;

    const pay = normalizeParityPayment(s.paymentMethod);
    paymentBreakdown[pay] = round2((paymentBreakdown[pay] ?? 0) + (Number(s.totalAmount) || 0));

    if (!minSaleDate || s.date < minSaleDate) minSaleDate = s.date;
    if (!maxSaleDate || s.date > maxSaleDate) maxSaleDate = s.date;
  }

  let expensesTotalAmount = 0;
  for (const e of input.expenses) {
    expensesTotalAmount += Number(e.amount) || 0;
  }

  return {
    productsCount: input.productsCount,
    combosCount: input.combosCount,
    salesCount: input.sales.length,
    expensesCount: input.expenses.length,
    salesTotalAmount: round2(salesTotalAmount),
    expensesTotalAmount: round2(expensesTotalAmount),
    totalXSaladas,
    totalCombosSold,
    paymentBreakdown,
    snapshotsCount,
    minSaleDate,
    maxSaleDate,
  };
}

export function compareParitySummaries(
  source: TenantParitySummary,
  target: TenantParitySummary,
): { equal: boolean; diffs: string[] } {
  const diffs: string[] = [];
  const check = (label: string, a: unknown, b: unknown) => {
    if (a !== b) diffs.push(`${label}: Firebase=${String(a)} vs Supabase=${String(b)}`);
  };

  check('productsCount', source.productsCount, target.productsCount);
  check('combosCount', source.combosCount, target.combosCount);
  check('salesCount', source.salesCount, target.salesCount);
  check('expensesCount', source.expensesCount, target.expensesCount);
  check('salesTotalAmount', source.salesTotalAmount, target.salesTotalAmount);
  check('expensesTotalAmount', source.expensesTotalAmount, target.expensesTotalAmount);
  check('totalXSaladas', source.totalXSaladas, target.totalXSaladas);
  check('totalCombosSold', source.totalCombosSold, target.totalCombosSold);
  check('snapshotsCount', source.snapshotsCount, target.snapshotsCount);
  check('minSaleDate', source.minSaleDate, target.minSaleDate);
  check('maxSaleDate', source.maxSaleDate, target.maxSaleDate);

  const allPays = new Set([
    ...Object.keys(source.paymentBreakdown),
    ...Object.keys(target.paymentBreakdown),
  ]);
  for (const pay of allPays) {
    check(
      `payment[${pay}]`,
      source.paymentBreakdown[pay] ?? 0,
      target.paymentBreakdown[pay] ?? 0,
    );
  }

  return { equal: diffs.length === 0, diffs };
}

// ==================== EXECUCAO ADMINISTRATIVA (CLI) ====================

interface TenantSpec {
  slug: 'mgw_lanches' | 'gf_lanches';
  name: string;
  members: Array<{ email: string; role: 'owner' | 'admin' }>;
  collectionPrefix: string | null;
}

const TENANT_SPECS: TenantSpec[] = [
  {
    slug: 'mgw_lanches',
    name: 'MGW Lanches',
    members: [
      { email: 'warney.fernandes22@gmail.com', role: 'owner' },
      { email: 'fernandes38mk@gmail.com', role: 'admin' },
    ],
    collectionPrefix: null,
  },
  {
    slug: 'gf_lanches',
    name: 'Outro Lanche (Conta Separada)',
    members: [{ email: 'gf3163666@gmail.com', role: 'owner' }],
    collectionPrefix: 'workspaces/gf_lanches',
  },
];

function loadFirebaseServiceAccount(): ServiceAccount {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inlineJson && inlineJson.trim()) {
    return JSON.parse(inlineJson) as ServiceAccount;
  }

  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath && filePath.trim()) {
    return JSON.parse(readFileSync(resolve(filePath), 'utf-8')) as ServiceAccount;
  }

  throw new Error(
    'Credencial Firebase Admin ausente. Configure GOOGLE_APPLICATION_CREDENTIALS ou FIREBASE_SERVICE_ACCOUNT antes de executar a migracao.',
  );
}

function getFirestoreDatabaseId(): string {
  if (process.env.FIREBASE_DATABASE_ID) {
    return process.env.FIREBASE_DATABASE_ID;
  }
  try {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), 'firebase-applet-config.json'), 'utf-8'),
    ) as { firestoreDatabaseId?: string };
    if (raw.firestoreDatabaseId) return raw.firestoreDatabaseId;
  } catch {
    // fallback default
  }
  return '(default)';
}

function createAdminClients() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Credenciais Supabase Admin ausentes. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY exclusivamente no ambiente de execucao do script.',
    );
  }

  const sa = loadFirebaseServiceAccount();
  const app =
    getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(sa) });
  const db = getFirestore(app, getFirestoreDatabaseId());
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { db, supabase };
}

async function readFirestoreTenantData(
  db: FirebaseFirestore.Firestore,
  spec: TenantSpec,
) {
  const basePath = spec.collectionPrefix ? `${spec.collectionPrefix}/` : '';

  let settings: LegacySettingsDoc | null = null;
  if (spec.slug === 'gf_lanches') {
    const snap = await db.doc('workspaces/gf_lanches/settings/main').get();
    if (snap.exists) {
      const d = snap.data()!;
      settings = {
        ownerId: String(d.ownerId || ''),
        establishmentName: String(d.establishmentName || spec.name),
        xSaladaPrice: Number(d.xSaladaPrice) || 22,
        dailyGoal: Number(d.dailyGoal) || 800,
        monthlyGoal: Number(d.monthlyGoal) || 18000,
        startDate: normalizeLegacyDateOnly(d.startDate),
        createdAtIso: timestampValueToIso(d.createdAt),
        updatedAtIso: timestampValueToIso(d.updatedAt),
      };
    }
  } else {
    const snap = await db.doc('settings/mgw_lanches').get();
    if (snap.exists) {
      const d = snap.data()!;
      settings = {
        ownerId: String(d.ownerId || ''),
        establishmentName: String(d.establishmentName || spec.name),
        xSaladaPrice: Number(d.xSaladaPrice) || 22,
        dailyGoal: Number(d.dailyGoal) || 800,
        monthlyGoal: Number(d.monthlyGoal) || 18000,
        startDate: normalizeLegacyDateOnly(d.startDate),
        createdAtIso: timestampValueToIso(d.createdAt),
        updatedAtIso: timestampValueToIso(d.updatedAt),
      };
    }
  }

  const productsSnap = await db.collection(`${basePath}products`).get();
  const products: LegacyProductDoc[] = productsSnap.docs.map((docSnap) => {
    const d = docSnap.data();
    return {
      id: docSnap.id,
      ownerId: String(d.ownerId || ''),
      name: String(d.name || 'Produto'),
      category: String(d.category || 'Outro'),
      unitPrice: Number(d.unitPrice) || 0,
      countsAsXSalada: Boolean(d.countsAsXSalada),
      active: d.active !== false,
      createdAtIso: timestampValueToIso(d.createdAt),
      updatedAtIso: timestampValueToIso(d.updatedAt),
    };
  });

  const combosSnap = await db.collection(`${basePath}combos`).get();
  const combos: LegacyComboDoc[] = combosSnap.docs.map((docSnap) => {
    const d = docSnap.data();
    const items = Array.isArray(d.items)
      ? d.items.map((entry: Record<string, unknown>) => ({
          productId: String(entry.productId || ''),
          productName: String(entry.productName || 'Produto'),
          quantity: Math.max(1, Math.trunc(Number(entry.quantity) || 1)),
          countsAsXSalada: Boolean(entry.countsAsXSalada),
        }))
      : [];
    return {
      id: docSnap.id,
      ownerId: String(d.ownerId || ''),
      name: String(d.name || 'Combo'),
      description: String(d.description || ''),
      items,
      salePrice: Number(d.salePrice) || 0,
      estimatedCost: Number(d.estimatedCost) || 0,
      active: d.active !== false,
      createdAtIso: timestampValueToIso(d.createdAt),
      updatedAtIso: timestampValueToIso(d.updatedAt),
    };
  });

  const salesSnap = await db.collection(`${basePath}sales`).get();
  const sales: LegacySaleDoc[] = salesSnap.docs.map((docSnap) => {
    const d = docSnap.data();
    const items = Array.isArray(d.items)
      ? d.items.map((entry: Record<string, unknown>) => ({
          kind: (entry.kind === 'combo' ? 'combo' : 'product') as 'combo' | 'product',
          refId: String(entry.refId || ''),
          name: String(entry.name || 'Item'),
          quantity: Math.max(1, Math.trunc(Number(entry.quantity) || 1)),
          unitPrice: Number(entry.unitPrice) || 0,
          lineTotal: Number(entry.lineTotal) || 0,
          estimatedUnitCost: Number(entry.estimatedUnitCost) || 0,
          xSaladasPerUnit: Math.max(0, Math.trunc(Number(entry.xSaladasPerUnit) || 0)),
          components: Array.isArray(entry.components)
            ? entry.components.map((c: Record<string, unknown>) => ({
                productId: String(c.productId || ''),
                productName: String(c.productName || 'Produto'),
                quantityPerUnit: Math.max(1, Math.trunc(Number(c.quantityPerUnit) || 1)),
                totalQuantity: Math.max(1, Math.trunc(Number(c.totalQuantity) || 1)),
                countsAsXSalada: Boolean(c.countsAsXSalada),
              }))
            : [],
        }))
      : null;

    return {
      id: docSnap.id,
      ownerId: String(d.ownerId || ''),
      date: normalizeLegacyDateOnly(d.date),
      quantity: Math.max(0, Math.trunc(Number(d.quantity) || 0)),
      unitPrice: Number(d.unitPrice) || 0,
      totalAmount: Number(d.totalAmount) || 0,
      paymentMethod: String(d.paymentMethod || 'Dinheiro'),
      note: String(d.note || ''),
      saleMode:
        d.saleMode === 'combo' || d.saleMode === 'mixed' || d.saleMode === 'individual'
          ? d.saleMode
          : null,
      xSaladaCount: typeof d.xSaladaCount === 'number' ? d.xSaladaCount : null,
      combosCount: typeof d.combosCount === 'number' ? d.combosCount : null,
      items,
      createdAtIso: timestampValueToIso(d.createdAt),
      updatedAtIso: timestampValueToIso(d.updatedAt),
    };
  });

  const expensesSnap = await db.collection(`${basePath}expenses`).get();
  const expenses: LegacyExpenseDoc[] = expensesSnap.docs.map((docSnap) => {
    const d = docSnap.data();
    return {
      id: docSnap.id,
      ownerId: String(d.ownerId || ''),
      description: String(d.description || 'Despesa'),
      amount: Number(d.amount) || 0,
      category: String(d.category || 'Outros'),
      date: normalizeLegacyDateOnly(d.date),
      paymentMethod: String(d.paymentMethod || 'Dinheiro'),
      note: String(d.note || ''),
      createdAtIso: timestampValueToIso(d.createdAt),
      updatedAtIso: timestampValueToIso(d.updatedAt),
    };
  });

  return { settings, products, combos, sales, expenses };
}

async function ensureFoundingTenantInSupabase(
  supabase: SupabaseClient,
  spec: TenantSpec,
): Promise<string> {
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .upsert(
      {
        slug: spec.slug,
        name: spec.name,
        is_founder_account: true,
        billing_exempt: true,
        status: 'active',
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single();

  if (tenantErr || !tenantRow) {
    throw new Error(`Erro ao garantir tenant ${spec.slug}: ${tenantErr?.message}`);
  }

  const tenantId = String((tenantRow as { id: string }).id);

  const { error: subErr } = await supabase
    .from('subscriptions')
    .upsert({ tenant_id: tenantId, status: 'exempt' }, { onConflict: 'tenant_id' });
  if (subErr) {
    throw new Error(`Erro ao garantir isencao para ${spec.slug}: ${subErr.message}`);
  }

  for (const member of spec.members) {
    const { data: existingMember } = await supabase
      .from('tenant_members')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', member.email.toLowerCase())
      .maybeSingle();

    if (!existingMember) {
      const { error: memberErr } = await supabase.from('tenant_members').insert({
        tenant_id: tenantId,
        user_id: null,
        email: member.email.toLowerCase(),
        role: member.role,
        is_founder: true,
        active: true,
      });
      if (memberErr) {
        throw new Error(
          `Erro ao criar vinculo fundador ${member.email}: ${memberErr.message}`,
        );
      }
    }
  }

  return tenantId;
}

async function fetchAllTenantRows(
  supabase: SupabaseClient,
  table: 'sales' | 'expenses',
  columns: string,
  tenantId: string,
): Promise<Array<Record<string, unknown>>> {
  const pageSize = 1000;
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Falha ao verificar paridade em ${table}: ${error.message}`);
    const page = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function readSupabaseTenantParity(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantParitySummary> {
  const [productsResult, combosResult, sales, expenses] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('combos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    fetchAllTenantRows(supabase, 'sales', 'date, quantity, total_amount, payment_method, x_salada_count, combos_count, items', tenantId),
    fetchAllTenantRows(supabase, 'expenses', 'amount', tenantId),
  ]);
  if (productsResult.error) throw new Error(`Falha ao contar products: ${productsResult.error.message}`);
  if (combosResult.error) throw new Error(`Falha ao contar combos: ${combosResult.error.message}`);

  return computeDatasetParitySummary({
    productsCount: productsResult.count ?? 0,
    combosCount: combosResult.count ?? 0,
    sales: sales.map((s) => ({
      date: String(s.date).slice(0, 10),
      quantity: Number(s.quantity) || 0,
      totalAmount: Number(s.total_amount) || 0,
      paymentMethod: String(s.payment_method || 'Dinheiro'),
      xSaladaCount: typeof s.x_salada_count === 'number' ? s.x_salada_count : null,
      combosCount: typeof s.combos_count === 'number' ? s.combos_count : null,
      items: Array.isArray(s.items) ? (s.items as LegacySaleItem[]) : null,
    })),
    expenses: expenses.map((e) => ({ amount: Number(e.amount) || 0 })),
  });
}

async function runCli() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const verifyOnly = args.has('--verify-only');
  const errors: string[] = [];

  console.log(
    `[MGW MIGRACAO] Modo: ${
      verifyOnly ? 'VERIFY-ONLY' : dryRun ? 'DRY-RUN (sem escrita)' : 'EXECUCAO IDEMPOTENTE'
    }`,
  );

  const { db, supabase } = createAdminClients();

  for (const spec of TENANT_SPECS) {
    console.log(`\n--- Tenant: ${spec.slug} (${spec.name}) ---`);
    const sourceData = await readFirestoreTenantData(db, spec);
    const sourceParity = computeDatasetParitySummary({
      productsCount: sourceData.products.length,
      combosCount: sourceData.combos.length,
      sales: sourceData.sales,
      expenses: sourceData.expenses,
    });

    console.log('Resumo agregado Firebase (não é comparação registro a registro):', sourceParity);

    if (dryRun) {
      console.log('[DRY-RUN] Nenhuma alteracao aplicada no Supabase.');
      continue;
    }

    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', spec.slug)
      .maybeSingle();

    const tenantId = verifyOnly
      ? String((existingTenant as { id: string } | null)?.id || '')
      : await ensureFoundingTenantInSupabase(supabase, spec);

    if (!tenantId) {
      errors.push(`Tenant ${spec.slug} ainda nao existe no Supabase.`);
      continue;
    }

    if (!verifyOnly) {
      // 1. Settings (insere apenas se ainda nao existir para nao sobrescrever ajustes novos)
      if (sourceData.settings) {
        const { data: existingSettings } = await supabase
          .from('shop_settings')
          .select('tenant_id')
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (!existingSettings) {
          const { error: setErr } = await supabase.from('shop_settings').insert({
            tenant_id: tenantId,
            owner_email: sourceData.settings.ownerId || null,
            establishment_name: sourceData.settings.establishmentName,
            x_salada_price: round2(sourceData.settings.xSaladaPrice),
            daily_goal: round2(sourceData.settings.dailyGoal),
            monthly_goal: round2(sourceData.settings.monthlyGoal),
            start_date: sourceData.settings.startDate,
            created_at: sourceData.settings.createdAtIso,
            updated_at: sourceData.settings.updatedAtIso,
          });
          if (setErr) errors.push(`shop_settings(${spec.slug}): ${setErr.message}`);
        }
      }

      // 2. Products -> construir mapa legacy_product_id -> uuid
      const productIdMap = new Map<string, string>();
      for (const product of sourceData.products) {
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('legacy_id', product.id)
          .maybeSingle();

        if (existing) {
          productIdMap.set(product.id, String((existing as { id: string }).id));
          continue;
        }

        const { data: inserted, error: prodErr } = await supabase
          .from('products')
          .insert({
            tenant_id: tenantId,
            legacy_id: product.id,
            owner_email: product.ownerId || null,
            name: product.name,
            category: product.category,
            unit_price: round2(product.unitPrice),
            counts_as_x_salada: product.countsAsXSalada,
            active: product.active,
            created_at: product.createdAtIso,
            updated_at: product.updatedAtIso,
          })
          .select('id')
          .single();

        if (prodErr || !inserted) {
          errors.push(`product(${product.id}): ${prodErr?.message}`);
        } else {
          productIdMap.set(product.id, String((inserted as { id: string }).id));
        }
      }

      // 3. Combos -> reescreve items[].productId preservando demais dados
      const comboIdMap = new Map<string, string>();
      for (const combo of sourceData.combos) {
        const { data: existing } = await supabase
          .from('combos')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('legacy_id', combo.id)
          .maybeSingle();

        if (existing) {
          comboIdMap.set(combo.id, String((existing as { id: string }).id));
          continue;
        }

        const row = transformComboForSupabase(tenantId, combo, productIdMap);
        const { data: inserted, error: comboErr } = await supabase
          .from('combos')
          .insert(row)
          .select('id')
          .single();

        if (comboErr || !inserted) {
          errors.push(`combo(${combo.id}): ${comboErr?.message}`);
        } else {
          comboIdMap.set(combo.id, String((inserted as { id: string }).id));
        }
      }

      // 4. Sales -> idempotente via (tenant_id, legacy_id), preservando DATE e snapshots
      for (const sale of sourceData.sales) {
        const { data: existing } = await supabase
          .from('sales')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('legacy_id', sale.id)
          .maybeSingle();

        if (existing) continue;

        const row = transformSaleForSupabase(tenantId, sale, productIdMap, comboIdMap);
        const { error: saleErr } = await supabase.from('sales').insert(row);
        if (saleErr) errors.push(`sale(${sale.id}): ${saleErr.message}`);
      }

      // 5. Expenses -> idempotente via (tenant_id, legacy_id), preservando DATE
      for (const exp of sourceData.expenses) {
        const { data: existing } = await supabase
          .from('expenses')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('legacy_id', exp.id)
          .maybeSingle();

        if (existing) continue;

        const { error: expErr } = await supabase.from('expenses').insert({
          tenant_id: tenantId,
          legacy_id: exp.id,
          owner_email: exp.ownerId || null,
          description: exp.description,
          amount: round2(exp.amount),
          category: exp.category,
          date: exp.date,
          payment_method: exp.paymentMethod,
          note: exp.note,
          created_at: exp.createdAtIso,
          updated_at: exp.updatedAtIso,
        });
        if (expErr) errors.push(`expense(${exp.id}): ${expErr.message}`);
      }
    }

    const targetParity = await readSupabaseTenantParity(supabase, tenantId);
    const parityCheck = compareParitySummaries(sourceParity, targetParity);
    console.log('Resumo Supabase:', targetParity);
    console.log(
      parityCheck.equal
        ? `PARIDADE AGREGADA OK para ${spec.slug} (contagens e totais; não certifica igualdade de cada registro)`
        : `DIVERGENCIA DE PARIDADE AGREGADA em ${spec.slug}: ${parityCheck.diffs.join('; ')}`,
    );
    if (!parityCheck.equal) {
      errors.push(...parityCheck.diffs.map((d) => `${spec.slug}: ${d}`));
    }
  }

  if (errors.length > 0) {
    console.error('\nErros/divergencias encontrados:\n - ' + errors.join('\n - '));
    process.exitCode = 1;
  } else {
    console.log('\nMigracao/Auditoria concluida sem erros.');
  }
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  void runCli().catch((err) => {
    console.error('[MGW MIGRACAO] Falha:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
