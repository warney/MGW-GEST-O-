import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComboPayloadForSupabase,
  buildExpensePayloadForSupabase,
  buildProductPayloadForSupabase,
  buildSalePayloadForSupabase,
  buildSettingsPayloadForSupabase,
  buildTenantContextFromRows,
  hasActiveTenantBillingAccess,
  mapComboRow,
  mapExpenseRow,
  mapProductRow,
  mapSaleRow,
  mapShopSettingsRow,
  mapSupabaseAuthErrorMessage,
} from './supabaseMappers';

test('supabaseMappers preserve YYYY-MM-DD dates, legacy Crédito payment normalization, and historical snapshots', () => {
  const saleRow = {
    id: 'uuid-sale-1',
    tenant_id: 'uuid-tenant-mgw',
    legacy_id: 'fs-sale-1',
    owner_email: 'warney.fernandes22@gmail.com',
    date: '2026-11-14',
    quantity: 4,
    unit_price: '25.50',
    total_amount: '102.00',
    payment_method: 'Crédito',
    note: 'Pedido noturno apos 22h BRT',
    sale_mode: 'combo',
    x_salada_count: 4,
    combos_count: 2,
    items: [
      {
        kind: 'combo',
        refId: 'uuid-combo-1',
        name: 'COMBO 2',
        quantity: 2,
        unitPrice: 51,
        lineTotal: 102,
        estimatedUnitCost: 22,
        xSaladasPerUnit: 2,
        components: [
          {
            productId: 'uuid-prod-xsalada',
            productName: 'X-Salada',
            quantityPerUnit: 2,
            totalQuantity: 4,
            countsAsXSalada: true,
          },
        ],
      },
    ],
    created_at: '2026-11-15T01:30:00.000Z',
    updated_at: '2026-11-15T01:30:00.000Z',
  };

  const mapped = mapSaleRow(saleRow);
  assert.equal(mapped.date, '2026-11-14');
  assert.equal(mapped.paymentMethod, 'Cartão de crédito');
  assert.equal(mapped.totalAmount, 102);
  assert.equal(mapped.xSaladaCount, 4);
  assert.equal(mapped.combosCount, 2);
  assert.equal(mapped.items?.[0].name, 'COMBO 2');

  const payload = buildSalePayloadForSupabase({
    date: '2026-11-14',
    quantity: 2,
    unitPrice: 22,
    paymentMethod: 'Pix',
    note: 'Balcao',
  });
  assert.equal(payload.date, '2026-11-14');
  assert.equal(payload.total_amount, 44);
  assert.throws(() =>
    buildSalePayloadForSupabase({
      date: '14/11/2026',
      quantity: 1,
      unitPrice: 22,
      paymentMethod: 'Pix',
      note: '',
    }),
  );
});

test('supabaseMappers validate products, combos, expenses, and settings cleanly', () => {
  const prod = mapProductRow({
    id: 'p1',
    tenant_id: 't1',
    name: 'X-Salada',
    category: 'Lanche',
    unit_price: '22.00',
    counts_as_x_salada: true,
    active: true,
    created_at: '2026-11-14T10:00:00.000Z',
    updated_at: '2026-11-14T10:00:00.000Z',
  });
  assert.equal(prod.countsAsXSalada, true);
  assert.equal(prod.unitPrice, 22);

  const combo = mapComboRow({
    id: 'c1',
    tenant_id: 't1',
    name: 'COMBO 1',
    description: '1 X-Salada + Refri',
    items: [{ productId: 'p1', productName: 'X-Salada', quantity: 1, countsAsXSalada: true }],
    sale_price: '26.00',
    estimated_cost: '11.50',
    active: true,
    created_at: '2026-11-14T10:00:00.000Z',
    updated_at: '2026-11-14T10:00:00.000Z',
  });
  assert.equal(combo.salePrice, 26);
  assert.equal(combo.estimatedCost, 11.5);

  const exp = mapExpenseRow({
    id: 'e1',
    tenant_id: 't1',
    description: 'Carne',
    amount: '150.25',
    category: 'Carnes e hambúrgueres',
    date: '2026-11-14',
    payment_method: 'Dinheiro',
    note: '',
    created_at: '2026-11-14T10:00:00.000Z',
    updated_at: '2026-11-14T10:00:00.000Z',
  });
  assert.equal(exp.amount, 150.25);
  assert.equal(exp.date, '2026-11-14');

  const cfg = mapShopSettingsRow({
    tenant_id: 't1',
    owner_email: 'warney.fernandes22@gmail.com',
    establishment_name: 'MGW Lanches',
    x_salada_price: '22.00',
    daily_goal: '800.00',
    monthly_goal: '18000.00',
    start_date: '2026-01-01',
  });
  assert.equal(cfg.establishmentName, 'MGW Lanches');

  assert.equal(buildProductPayloadForSupabase({ name: ' Refri ', category: 'Bebida', unitPrice: 6, countsAsXSalada: false, active: true }).name, 'Refri');
  assert.equal(buildComboPayloadForSupabase({ name: 'C1', description: '', items: [{ productId: 'p1', productName: 'X-Salada', quantity: 1, countsAsXSalada: true }], salePrice: 25, estimatedCost: 0, active: true }).sale_price, 25);
  assert.equal(buildExpensePayloadForSupabase({ description: 'Gas', amount: 110, category: 'Gás', date: '2026-11-14', paymentMethod: 'Pix', note: '' }).amount, 110);
  assert.equal(buildSettingsPayloadForSupabase({ establishmentName: 'MGW', xSaladaPrice: 22, dailyGoal: 800, monthlyGoal: 18000, startDate: '2026-01-01' }).start_date, '2026-01-01');
});

test('hasActiveTenantBillingAccess and buildTenantContextFromRows enforce founder exemption and block cancelled/inactive tenants', () => {
  assert.equal(
    hasActiveTenantBillingAccess({ billing_exempt: true, status: 'active' }, null),
    true,
  );
  assert.equal(
    hasActiveTenantBillingAccess({ billing_exempt: false, status: 'active' }, { status: 'exempt', grace_until: null }),
    true,
  );
  assert.equal(
    hasActiveTenantBillingAccess({ billing_exempt: false, status: 'active' }, { status: 'authorized', grace_until: null }),
    true,
  );
  assert.equal(
    hasActiveTenantBillingAccess({ billing_exempt: false, status: 'active' }, { status: 'cancelled', grace_until: null }),
    false,
  );
  assert.equal(
    hasActiveTenantBillingAccess({ billing_exempt: true, status: 'suspended' }, { status: 'exempt', grace_until: null }),
    false,
  );

  const fixedNow = 1_800_000_000_000;
  assert.equal(
    hasActiveTenantBillingAccess(
      { billing_exempt: false, status: 'active' },
      { status: 'trialing', grace_until: null, trial_ends_at: new Date(fixedNow + 86_400_000).toISOString() },
      fixedNow,
    ),
    true,
  );
  assert.equal(
    hasActiveTenantBillingAccess(
      { billing_exempt: false, status: 'active' },
      { status: 'trialing', grace_until: null, trial_ends_at: new Date(fixedNow - 1).toISOString() },
      fixedNow,
    ),
    false,
  );
  assert.equal(
    hasActiveTenantBillingAccess(
      { billing_exempt: false, status: 'active' },
      { status: 'trialing', grace_until: null, trial_ends_at: null },
      fixedNow,
    ),
    false,
  );

  const ctx = buildTenantContextFromRows(
    {
      id: 'm1',
      tenant_id: 't-mgw',
      user_id: 'u1',
      email: 'warney.fernandes22@gmail.com',
      role: 'owner',
      is_founder: true,
      active: true,
      tenants: {
        id: 't-mgw',
        slug: 'mgw_lanches',
        name: 'MGW Lanches',
        is_founder_account: true,
        billing_exempt: true,
        status: 'active',
      },
    },
    { status: 'exempt', grace_until: null },
  );
  assert.equal(ctx?.slug, 'mgw_lanches');
  assert.equal(ctx?.billingExempt, true);
  assert.equal(ctx?.subscriptionStatus, 'exempt');

  assert.match(mapSupabaseAuthErrorMessage(new Error('Invalid login credentials')), /inválidos/i);
  assert.match(mapSupabaseAuthErrorMessage(new Error('JWT expired')), /expirou/i);
});

