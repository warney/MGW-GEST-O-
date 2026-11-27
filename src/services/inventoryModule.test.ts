import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildInventoryOverviewSummary,
  buildProductConversionOptions,
  buildProductInventoryRows,
  calculatePurchaseOrderTotals,
  classifyStockStatus,
  computeRemainingPurchaseItemQuantities,
  computeWeightedAverageCost,
  convertPackagingQuantity,
  EMPTY_INVENTORY_BUNDLE,
  filterInventoryMovements,
  summarizeInventoryCountItems,
  validateMovementQuantityAndStockGuard,
} from '../utils/inventory';
import { hasTenantPermission } from './rbacPolicy';
import { resolveShellPageTitle } from '../utils/shellProfile';
import {
  buildInventoryPackagingConversionPayloadForSupabase,
  buildSupplierPayloadForSupabase,
  mapInventoryBalanceRow,
  mapInventoryCountRow,
  mapInventoryMovementRow,
  mapPurchaseOrderRow,
} from './supabaseMappers';
import {
  createInventoryPurchaseOrder,
  receiveInventoryPurchaseItems,
  recordInventoryMovement,
  saveInventorySupplier,
  startInventoryCount,
  type DataExecutionContext,
} from './dataService';
import { demoMutations } from './demoSandbox';
import type { InventoryDataBundle, ProductRecord } from '../types/finance';

let activeTestStore: Map<string, string> | null = null;

function getDemoSnapshot(): {
  products: ProductRecord[];
  inventory: InventoryDataBundle;
} {
  const raw = activeTestStore?.get('mgw_demo_sandbox_state_v1');
  if (!raw) {
    return { products: [], inventory: { ...EMPTY_INVENTORY_BUNDLE } };
  }
  const parsed = JSON.parse(raw) as {
    products?: ProductRecord[];
    inventory?: InventoryDataBundle;
  };
  return {
    products: parsed.products ?? [],
    inventory: { ...EMPTY_INVENTORY_BUNDLE, ...(parsed.inventory ?? {}) },
  };
}

function withDemoBrowserEnv<T>(fn: () => T): T {
  const prevWindow = (globalThis as Record<string, unknown>).window;
  const store = new Map<string, string>();
  activeTestStore = store;
  const mockWindow = {
    location: { search: '?demo=1', pathname: '/' },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, String(val));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  (globalThis as Record<string, unknown>).window = mockWindow;
  try {
    return fn();
  } finally {
    activeTestStore = null;
    if (prevWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = prevWindow;
    }
  }
}

function makeCtx(
  segment: 'lanchonete' | 'adega',
  role: 'owner' | 'admin' | 'manager' | 'staff' = 'owner',
): DataExecutionContext {
  return {
    user: {
      uid: 'u-1',
      email: 'gestor@mgw.test',
      emailVerified: true,
    },
    tenant: {
      tenantId: `tenant-${segment}`,
      slug: `loja-${segment}`,
      name: segment === 'adega' ? 'Adega Central' : 'Lanchonete Central',
      role,
      isFounderAccount: false,
      billingExempt: true,
      subscriptionStatus: 'active',
      graceUntil: null,
      accessAllowed: true,
      onboardingCompleted: true,
      businessSegment: segment,
    },
  };
}

// ==================== CENÁRIO A — PRESERVAÇÃO LANCHONETES & RBAC ====================

test('Cenário A: Lanchonete nunca acessa módulo de estoque e títulos/RBAC permanecem intactos', async () => {
  const lanchoneteOwnerCtx = makeCtx('lanchonete', 'owner');
  await assert.rejects(
    () =>
      recordInventoryMovement(lanchoneteOwnerCtx, {
        productId: 'p1',
        movementType: 'manual_entry',
        inputQuantity: 5,
        inputUnit: 'unidade',
        conversionFactor: 1,
      }),
    /exclusivo do segmento Adega/i,
  );
  await assert.rejects(
    () => saveInventorySupplier(lanchoneteOwnerCtx, { name: 'Fornecedor X' }),
    /exclusivo do segmento Adega/i,
  );
  await assert.rejects(
    () =>
      createInventoryPurchaseOrder(lanchoneteOwnerCtx, {
        supplierId: 's1',
        status: 'pending',
        items: [
          {
            productId: 'p1',
            unitLabel: 'unidade',
            conversionFactor: 1,
            orderedQty: 2,
            unitCost: 10,
          },
        ],
      }),
    /exclusivo do segmento Adega/i,
  );
  await assert.rejects(
    () =>
      receiveInventoryPurchaseItems(lanchoneteOwnerCtx, 'po1', [
        { purchaseOrderItemId: 'poi1', receivedQty: 1 },
      ]),
    /exclusivo do segmento Adega/i,
  );
  await assert.rejects(
    () => startInventoryCount(lanchoneteOwnerCtx, 'Contagem', null),
    /exclusivo do segmento Adega/i,
  );

  // Staff em adega também não acessa estoque
  assert.equal(hasTenantPermission('staff', 'inventory:read'), false);
  assert.equal(hasTenantPermission('staff', 'inventory:write'), false);
  assert.equal(hasTenantPermission('manager', 'inventory:read'), true);
  assert.equal(hasTenantPermission('manager', 'inventory:write'), true);
  assert.equal(hasTenantPermission('owner', 'inventory:write'), true);

  // Títulos preservados para Lanchonetes e novo título para Estoque
  assert.equal(resolveShellPageTitle('dashboard', 'shop'), 'Dashboard');
  assert.equal(resolveShellPageTitle('orders', 'shop'), 'Pedidos');
  assert.equal(resolveShellPageTitle('inventory', 'shop'), 'Estoque');

  // Garantias estáticas no AppShell, App e dataService de isolamento por segmento
  const appShellSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AppShell.tsx'),
    'utf8',
  );
  assert.match(
    appShellSrc,
    /if\s*\(\s*activeSegment\s*===\s*'adega'\s*&&\s*canReadInventory\s*\)/,
  );

  const appSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/App.tsx'),
    'utf8',
  );
  assert.match(
    appSrc,
    /canReadInventory\s*=\s*\n?\s*activeSegment\s*===\s*'adega'\s*&&\s*\n?\s*hasTenantPermission\(activeTenant\.role,\s*'inventory:read'\)/,
  );

  const dataServiceSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/dataService.ts'),
    'utf8',
  );
  assert.match(
    dataServiceSrc,
    /normalizeBusinessSegment\(ctx\.tenant\.businessSegment\)\s*===\s*'adega'/,
  );
});

// ==================== CENÁRIO B — SALDOS, CUSTO MÉDIO E ESTOQUE NEGATIVO ====================

test('Cenário B: cálculo de custo médio ponderado, status de estoque e bloqueio de saldo negativo', () => {
  const first = computeWeightedAverageCost({
    currentQty: 0,
    currentAvgCost: 0,
    entryBaseQty: 10,
    entryTotalCost: 50,
  });
  assert.equal(first.entryUnitCost, 5);
  assert.equal(first.newAverageUnitCost, 5);

  const second = computeWeightedAverageCost({
    currentQty: 10,
    currentAvgCost: 5,
    entryBaseQty: 10,
    entryTotalCost: 70,
  });
  assert.equal(second.entryUnitCost, 7);
  assert.equal(second.newAverageUnitCost, 6);

  assert.equal(classifyStockStatus(0, 5), 'out_of_stock');
  assert.equal(classifyStockStatus(4, 5), 'low');
  assert.equal(classifyStockStatus(6, 5), 'near_minimum');
  assert.equal(classifyStockStatus(12, 5), 'normal');

  const blocked = validateMovementQuantityAndStockGuard({
    direction: 'out',
    currentAvailableQty: 17,
    baseQuantity: 20,
    allowNegativeStock: false,
    allowNegativeOverride: false,
    productName: 'Gin Tanqueray 750ml',
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.message || '', /Estoque insuficiente/i);

  const blockedWithoutConfirmation = validateMovementQuantityAndStockGuard({
    direction: 'out',
    currentAvailableQty: 17,
    baseQuantity: 20,
    allowNegativeStock: true,
    allowNegativeOverride: false,
    productName: 'Gin Tanqueray 750ml',
  });
  assert.equal(blockedWithoutConfirmation.allowed, false);

  const allowedWithBoth = validateMovementQuantityAndStockGuard({
    direction: 'out',
    currentAvailableQty: 17,
    baseQuantity: 20,
    allowNegativeStock: true,
    allowNegativeOverride: true,
    productName: 'Gin Tanqueray 750ml',
  });
  assert.equal(allowedWithBoth.allowed, true);
  assert.equal(allowedWithBoth.nextBalance, -3);
});

test('Cenário B (fluxo sandbox): entradas, perdas, validade, consumo interno e estoque negativo', () => {
  withDemoBrowserEnv(() => {
    const productId = demoMutations.addProduct({
      name: 'Heineken Long Neck 330ml',
      category: 'Cervejas',
      unitPrice: 9.5,
      countsAsXSalada: false,
      active: true,
      saleUnit: 'garrafa',
      packageType: 'caixa',
      unitsPerPackage: 12,
      costPrice: 4.5,
    });

    const m1 = demoMutations.recordInventoryMovement(
      {
        productId,
        movementType: 'manual_entry',
        inputQuantity: 10,
        inputUnit: 'garrafa',
        conversionFactor: 1,
        totalCost: 50,
        reason: 'Estoque inicial',
      },
      'dono@adega.test',
    );
    assert.equal(m1.newBalance, 10);
    assert.equal(m1.newAvgCost, 5);

    const m2 = demoMutations.recordInventoryMovement(
      {
        productId,
        movementType: 'manual_entry',
        inputQuantity: 10,
        inputUnit: 'garrafa',
        conversionFactor: 1,
        totalCost: 70,
        reason: 'Reposição lote 2',
      },
      'dono@adega.test',
    );
    assert.equal(m2.newBalance, 20);
    assert.equal(m2.newAvgCost, 6);

    const mLoss = demoMutations.recordInventoryMovement(
      {
        productId,
        movementType: 'loss',
        inputQuantity: 2,
        inputUnit: 'garrafa',
        conversionFactor: 1,
        reason: 'Garrafa quebrada',
      },
      'dono@adega.test',
    );
    assert.equal(mLoss.newBalance, 18);
    assert.equal(mLoss.newAvgCost, 6);

    const mCons = demoMutations.recordInventoryMovement(
      {
        productId,
        movementType: 'internal_consumption',
        inputQuantity: 1,
        inputUnit: 'garrafa',
        conversionFactor: 1,
        reason: 'Degustação equipe',
      },
      'dono@adega.test',
    );
    assert.equal(mCons.newBalance, 17);

    // Saída acima do saldo bloqueada por padrão
    assert.throws(
      () =>
        demoMutations.recordInventoryMovement(
          {
            productId,
            movementType: 'manual_exit',
            inputQuantity: 20,
            inputUnit: 'garrafa',
            conversionFactor: 1,
            reason: 'Saída maior que saldo',
          },
          'dono@adega.test',
        ),
      /Estoque insuficiente/i,
    );

    // Habilita estoque negativo no produto e envia confirmação explícita
    demoMutations.upsertInventoryProductConfig(productId, 6, true);
    const mNeg = demoMutations.recordInventoryMovement(
      {
        productId,
        movementType: 'manual_exit',
        inputQuantity: 20,
        inputUnit: 'garrafa',
        conversionFactor: 1,
        reason: 'Acerto autorizado',
        allowNegativeOverride: true,
      },
      'dono@adega.test',
    );
    assert.equal(mNeg.newBalance, -3);
  });
});

// ==================== CENÁRIO C — CONVERSÃO DE EMBALAGENS & SNAPSHOT ====================

test('Cenário C: conversão de embalagens e preservação histórica após alteração do fator', () => {
  const convCalc = convertPackagingQuantity({
    inputQuantity: 3,
    conversionFactor: 12,
    inputUnitTotalCost: 144,
  });
  assert.equal(convCalc.baseQuantity, 36);
  assert.equal(convCalc.baseUnitCost, 4);

  withDemoBrowserEnv(() => {
    const productId = demoMutations.addProduct({
      name: 'Skol Lata 350ml',
      category: 'Cervejas',
      unitPrice: 5,
      countsAsXSalada: false,
      active: true,
      saleUnit: 'lata',
      packageType: 'caixa',
      unitsPerPackage: 12,
    });

    const convId = demoMutations.upsertInventoryPackagingConversion({
      productId,
      packageLabel: 'Caixa c/ 12',
      packageType: 'caixa',
      factorToBase: 12,
      isDefaultPurchase: true,
      active: true,
    });

    const options = buildProductConversionOptions(
      {
        id: productId,
        ownerId: 'demo',
        name: 'Skol Lata 350ml',
        category: 'Cervejas',
        unitPrice: 5,
        countsAsXSalada: false,
        active: true,
        saleUnit: 'lata',
        packageType: 'caixa',
        unitsPerPackage: 12,
        createdAtMs: 0,
        updatedAtMs: 0,
      },
      [
        {
          id: convId,
          tenantId: 'demo-tenant',
          productId,
          packageLabel: 'Caixa c/ 12',
          packageType: 'caixa',
          factorToBase: 12,
          isDefaultPurchase: true,
          active: true,
          createdAtMs: 0,
          updatedAtMs: 0,
        },
      ],
    );
    assert.equal(options[0].unitLabel, 'lata');
    assert.equal(options[1].factorToBase, 12);

    const m1 = demoMutations.recordInventoryMovement(
      {
        productId,
        movementType: 'manual_entry',
        inputQuantity: 2,
        inputUnit: 'Caixa c/ 12',
        conversionFactor: 12,
        packagingConversionId: convId,
        totalCost: 72,
        reason: 'Entrada em caixas',
      },
      'dono@adega.test',
    );
    assert.equal(m1.baseQuantity, 24);
    assert.equal(m1.conversionFactorUsed, 12);

    // Atualiza o fator da conversão para 24; o snapshot do movimento anterior deve permanecer 12 e 24 unidades
    demoMutations.upsertInventoryPackagingConversion(
      {
        productId,
        packageLabel: 'Caixa c/ 24',
        packageType: 'caixa',
        factorToBase: 24,
        isDefaultPurchase: true,
        active: true,
      },
      convId,
    );

    const stateAfter = getDemoSnapshot();
    const savedMov = stateAfter.inventory.movements.find((m) => m.id === m1.id);
    assert.ok(savedMov);
    assert.equal(savedMov.conversionFactorUsed, 12);
    assert.equal(savedMov.baseQuantity, 24);
    assert.equal(savedMov.inputUnit, 'Caixa c/ 12');
  });
});

// ==================== CENÁRIO D — FORNECEDORES, COMPRAS & RECEBIMENTOS PARCIAIS ====================

test('Cenário D: compras em rascunho/pendente não alteram estoque; recebimento parcial e cancelamento preservam histórico', () => {
  const poTotals = calculatePurchaseOrderTotals({
    items: [
      { orderedQty: 10, unitCost: 120 },
      { orderedQty: 5, unitCost: 40 },
    ],
    discountAmount: 50,
    additionalExpenses: 30,
  });
  assert.equal(poTotals.itemsSubtotal, 1400);
  assert.equal(poTotals.totalAmount, 1380);

  withDemoBrowserEnv(() => {
    const productId = demoMutations.addProduct({
      name: 'Red Bull 250ml',
      category: 'Energéticos',
      unitPrice: 12,
      countsAsXSalada: false,
      active: true,
      saleUnit: 'lata',
      packageType: 'fardo',
      unitsPerPackage: 6,
    });

    const supplierId = demoMutations.saveSupplier({
      name: 'Distribuidora Bebidas Sul Ltda',
      tradeName: 'Sul Bebidas',
      document: '12.345.678/0001-90',
      phone: '92991112222',
    });

    demoMutations.upsertProductSupplierLink({
      productId,
      supplierId,
      supplierSku: 'RB-250-FD6',
      lastUnitCost: 36,
      isPreferred: true,
    });

    const poId = demoMutations.createPurchaseOrder(
      {
        supplierId,
        status: 'pending',
        paymentTerms: '28 dias',
        discountAmount: 0,
        additionalExpenses: 0,
        items: [
          {
            productId,
            unitLabel: 'Fardo c/ 6',
            conversionFactor: 6,
            orderedQty: 10,
            unitCost: 36,
          },
        ],
      },
      'dono@adega.test',
    );

    // Compra pendente NÃO altera estoque nem custo médio
    let snap = getDemoSnapshot();
    assert.equal(
      snap.inventory.balances.find((b) => b.productId === productId),
      undefined,
    );

    const poItem = snap.inventory.purchaseOrderItems.find(
      (i) => i.purchaseOrderId === poId,
    )!;
    assert.equal(poItem.orderedBaseQty, 60);

    // Recebimento parcial: 6 fardos de 10 (= 36 latas)
    const rec1Id = demoMutations.receivePurchaseItems(
      poId,
      [{ purchaseOrderItemId: poItem.id, receivedQty: 6, unitCost: 36 }],
      'Primeira entrega parcial',
      'rec_parcial_1',
      'dono@adega.test',
    );
    assert.ok(rec1Id);

    snap = getDemoSnapshot();
    const poAfterRec1 = snap.inventory.purchaseOrders.find((p) => p.id === poId)!;
    assert.equal(poAfterRec1.status, 'partially_received');
    const balAfterRec1 = snap.inventory.balances.find(
      (b) => b.productId === productId,
    )!;
    assert.equal(balAfterRec1.availableQty, 36);
    assert.equal(balAfterRec1.averageUnitCost, 6);

    const rem = computeRemainingPurchaseItemQuantities(
      snap.inventory.purchaseOrderItems.find((i) => i.id === poItem.id)!,
    );
    assert.equal(rem.remainingBaseQty, 24);
    assert.equal(rem.remainingInputQty, 4);

    // Cancelamento após recebimento parcial preserva saldo e histórico já recebido
    demoMutations.updatePurchaseOrderStatus(
      poId,
      'cancelled',
      'Fornecedor não entregará o restante',
    );
    snap = getDemoSnapshot();
    assert.equal(
      snap.inventory.purchaseOrders.find((p) => p.id === poId)?.status,
      'cancelled',
    );
    assert.equal(
      snap.inventory.balances.find((b) => b.productId === productId)?.availableQty,
      36,
    );
    assert.equal(
      snap.inventory.movements.filter((m) => m.originId === rec1Id).length,
      1,
    );
  });
});

// ==================== CENÁRIO E — INVENTÁRIO FÍSICO & RESUMOS ====================

test('Cenário E: inventário físico calcula divergência e gera ajuste atômico apenas nos itens alterados', () => {
  withDemoBrowserEnv(() => {
    const prodA = demoMutations.addProduct({
      name: 'Absolut Vodka 1L',
      category: 'Destilados',
      unitPrice: 129.9,
      countsAsXSalada: false,
      active: true,
      saleUnit: 'garrafa',
    });
    const prodB = demoMutations.addProduct({
      name: 'Gelo de Coco 200g',
      category: 'Complementos',
      unitPrice: 6,
      countsAsXSalada: false,
      active: true,
      saleUnit: 'unidade',
    });

    demoMutations.recordInventoryMovement(
      {
        productId: prodA,
        movementType: 'manual_entry',
        inputQuantity: 50,
        inputUnit: 'garrafa',
        conversionFactor: 1,
        totalCost: 3500,
      },
      'dono@adega.test',
    );
    demoMutations.recordInventoryMovement(
      {
        productId: prodB,
        movementType: 'manual_entry',
        inputQuantity: 20,
        inputUnit: 'unidade',
        conversionFactor: 1,
        totalCost: 40,
      },
      'dono@adega.test',
    );

    const countId = demoMutations.startInventoryCount(
      'Auditoria Mensal Destilados e Gelo',
      [prodA, prodB],
      'Contagem geral',
      'cnt_test_1',
      'dono@adega.test',
    );

    let snap = getDemoSnapshot();
    const countItems = snap.inventory.inventoryCountItems.filter(
      (i) => i.countId === countId,
    );
    const itemA = countItems.find((i) => i.productId === prodA)!;
    const itemB = countItems.find((i) => i.productId === prodB)!;

    demoMutations.saveInventoryCountItems(countId, [
      { countItemId: itemA.id, countedQty: 46, notes: '4 garrafas faltando' },
      { countItemId: itemB.id, countedQty: 20, notes: 'Conferido OK' },
    ]);

    snap = getDemoSnapshot();
    const openCount = snap.inventory.inventoryCounts.find((c) => c.id === countId)!;
    const summary = summarizeInventoryCountItems(
      openCount,
      snap.inventory.inventoryCountItems,
    );
    assert.equal(summary.totalItems, 2);
    assert.equal(summary.countedItems, 2);
    assert.equal(summary.divergentItems, 1);
    assert.equal(summary.netDifferenceQty, -4);
    assert.equal(summary.netEstimatedDifferenceValue, -280);

    demoMutations.finalizeInventoryCount(countId, 'dono@adega.test');
    snap = getDemoSnapshot();
    assert.equal(
      snap.inventory.inventoryCounts.find((c) => c.id === countId)?.status,
      'finalized',
    );
    assert.equal(
      snap.inventory.balances.find((b) => b.productId === prodA)?.availableQty,
      46,
    );
    assert.equal(
      snap.inventory.balances.find((b) => b.productId === prodB)?.availableQty,
      20,
    );

    const adjMovs = snap.inventory.movements.filter(
      (m) => m.originType === 'inventory_count' && m.originId === countId,
    );
    assert.equal(adjMovs.length, 1);
    assert.equal(adjMovs[0].direction, 'out');
    assert.equal(adjMovs[0].baseQuantity, 4);

    // Conferir visão agregada e filtros
    const rows = buildProductInventoryRows(
      snap.products.filter((p) => p.id === prodA || p.id === prodB),
      snap.inventory.balances,
    );
    assert.equal(rows.length, 2);

    const overview = buildInventoryOverviewSummary(rows, snap.inventory);
    assert.ok(overview.totalEstimatedValue > 0);
    const filtered = filterInventoryMovements(
      snap.inventory.movements,
      snap.products,
      snap.inventory.suppliers,
      {
        productId: prodA,
        movementType: 'inventory_adjustment',
      },
    );
    assert.equal(filtered.length, 1);
  });
});

// ==================== CENÁRIO F — IDEMPOTÊNCIA, MAPPERS, SQL E NÃO-ANTECIPAÇÃO ====================

test('Cenário F: idempotência, mappers, SQL hardening e não-antecipação de baixa automática (Etapa 5/6)', () => {
  withDemoBrowserEnv(() => {
    const prodId = demoMutations.addProduct({
      name: 'Corona Extra 330ml',
      category: 'Cervejas',
      unitPrice: 9,
      countsAsXSalada: false,
      active: true,
    });

    const m1 = demoMutations.recordInventoryMovement(
      {
        productId: prodId,
        movementType: 'manual_entry',
        inputQuantity: 10,
        inputUnit: 'unidade',
        conversionFactor: 1,
        totalCost: 55,
        idempotencyKey: 'idem_fixed_key_001',
      },
      'dono@adega.test',
    );
    const m2 = demoMutations.recordInventoryMovement(
      {
        productId: prodId,
        movementType: 'manual_entry',
        inputQuantity: 10,
        inputUnit: 'unidade',
        conversionFactor: 1,
        totalCost: 55,
        idempotencyKey: 'idem_fixed_key_001',
      },
      'dono@adega.test',
    );
    assert.equal(m1.id, m2.id);

    // Registrar venda manual NÃO pode alterar estoque nesta Etapa 4
    demoMutations.addSale({
      date: '2026-11-27',
      quantity: 3,
      unitPrice: 9,
      paymentMethod: 'Pix',
      note: 'Venda balcão',
      items: [
        {
          kind: 'product',
          refId: prodId,
          name: 'Corona Extra 330ml',
          quantity: 3,
          unitPrice: 9,
          lineTotal: 27,
          estimatedUnitCost: 5.5,
          xSaladasPerUnit: 0,
          components: [],
        },
      ],
    });
    const snap = getDemoSnapshot();
    const bal = snap.inventory.balances.find((b) => b.productId === prodId)!;
    assert.equal(bal.availableQty, 10);
    assert.equal(bal.reservedQty, 0);
  });

  // Validação de mappers Supabase
  const mappedBal = mapInventoryBalanceRow({
    id: 'b1',
    tenant_id: 't1',
    product_id: 'p1',
    available_qty: '24.500',
    reserved_qty: '0',
    min_stock_qty: '6.000',
    average_unit_cost: '4.1250',
    last_cost_price: '4.2000',
    allow_negative_stock: false,
    created_at: '2026-11-27T10:00:00Z',
    updated_at: '2026-11-27T10:00:00Z',
  });
  assert.equal(mappedBal.availableQty, 24.5);
  assert.equal(mappedBal.reservedQty, 0);
  assert.equal(mappedBal.averageUnitCost, 4.125);

  const mappedMov = mapInventoryMovementRow({
    id: 'm1',
    tenant_id: 't1',
    product_id: 'p1',
    movement_type: 'purchase_receipt',
    direction: 'in',
    input_quantity: '2',
    input_unit: 'Caixa c/ 12',
    conversion_factor_used: '12',
    base_quantity: '24',
    previous_balance: '0',
    new_balance: '24',
    unit_cost: '4.0000',
    total_cost: '96.00',
    previous_avg_cost: '0',
    new_avg_cost: '4.0000',
    reason: 'Recebimento Compra #1',
    notes: '',
    origin_type: 'purchase_receipt',
    origin_id: 'rec1',
    supplier_id: 'sup1',
    packaging_conversion_id: null,
    idempotency_key: 'rec_1',
    actor_user_id: 'u1',
    actor_email: 'dono@adega.test',
    created_at: '2026-11-27T10:00:00Z',
  });
  assert.equal(mappedMov.baseQuantity, 24);
  assert.equal(mappedMov.conversionFactorUsed, 12);
  assert.equal(mappedMov.movementType, 'purchase_receipt');

  const mappedPo = mapPurchaseOrderRow({
    id: 'po1',
    tenant_id: 't1',
    order_number: 7,
    supplier_id: 'sup1',
    status: 'partially_received',
    payment_terms: '30d',
    expected_delivery_date: '2026-11-30',
    discount_amount: '10',
    additional_expenses: '5',
    items_subtotal: '200',
    total_amount: '195',
    notes: '',
    idempotency_key: 'po_7',
    cancelled_reason: '',
    cancelled_at: null,
    created_by_email: 'dono@adega.test',
    created_at: '2026-11-27T10:00:00Z',
    updated_at: '2026-11-27T10:00:00Z',
  });
  assert.equal(mappedPo.orderNumber, 7);
  assert.equal(mappedPo.totalAmount, 195);

  const mappedCount = mapInventoryCountRow({
    id: 'cnt1',
    tenant_id: 't1',
    count_number: 1,
    title: 'Contagem Cervejas',
    status: 'open',
    notes: '',
    started_by_email: 'dono@adega.test',
    finalized_by_email: '',
    finalized_at: null,
    idempotency_key: 'cnt_1',
    created_at: '2026-11-27T10:00:00Z',
    updated_at: '2026-11-27T10:00:00Z',
  });
  assert.equal(mappedCount.status, 'open');

  assert.equal(
    buildSupplierPayloadForSupabase({ name: '  Ambev  ' }).name,
    'Ambev',
  );
  assert.equal(
    buildInventoryPackagingConversionPayloadForSupabase({
      productId: 'p1',
      packageLabel: 'Caixa 12',
      packageType: 'caixa',
      factorToBase: 12,
    }).factor_to_base,
    12,
  );
  assert.equal(EMPTY_INVENTORY_BUNDLE.balances.length, 0);

  // Verificações estruturais da migration SQL da Etapa 4
  const sql = fs.readFileSync(
    path.resolve(
      process.cwd(),
      'supabase/migrations/20261127160000_etapa4_adega_inventory.sql',
    ),
    'utf8',
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_adega_tenant/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.guard_adega_inventory_segment/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.prevent_inventory_movement_mutation/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.inventory_balances FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.inventory_movements FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.purchase_orders FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.inventory_counts FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /-- ROLLBACK MANUAL/i);

  // Não modifica tabelas existentes nem altera políticas antigas
  assert.equal(/ALTER TABLE public\.(products|sales|combos|online_orders|expenses)/i.test(sql), false);
  assert.equal(/DROP POLICY IF EXISTS (products|sales|combos|online_orders|expenses)_/i.test(sql), false);
});
