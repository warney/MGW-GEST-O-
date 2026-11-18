import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCartStorageKey,
  computeCashChangeAmount,
  computeMenuCategoryCounts,
  formatComboComposition,
  getStoreMonogram,
  parseStoredCart,
  parseStoredCustomerProfile,
  serializeStoredCart,
  serializeStoredCustomerProfile,
  shouldShowComboComposition,
} from './menuPresentation';

test('getStoreMonogram extracts dynamic initial with safe fallback', () => {
  assert.equal(getStoreMonogram('MGW Burger'), 'M');
  assert.equal(getStoreMonogram('  lanchonete Central'), 'L');
  assert.equal(getStoreMonogram(''), 'M');
});

test('shouldShowComboComposition suppresses redundant description matching items including plural s', () => {
  const combo5Items = [
    { quantity: 1, productName: 'X-Salada' },
    { quantity: 1, productName: 'Refrigerante Tuchaua 1,5 litro' },
  ];
  assert.equal(
    shouldShowComboComposition(
      '1 X-Salada + 1 Refrigerante Tuchaua 1,5 litro',
      combo5Items,
    ),
    false,
  );

  const combo3Items = [
    { quantity: 3, productName: 'X-Salada' },
    { quantity: 1, productName: 'Refrigerante Tuchaua 1 litro' },
  ];
  assert.equal(
    shouldShowComboComposition(
      '3 X-Saladas + 1 Refrigerante Tuchaua 1 litro',
      combo3Items,
    ),
    false,
  );

  assert.equal(
    shouldShowComboComposition('Ideal para dividir com a galera!', combo3Items),
    true,
  );
  assert.equal(shouldShowComboComposition('', combo3Items), true);
  assert.equal(
    formatComboComposition(combo3Items),
    '3x X-Salada + 1x Refrigerante Tuchaua 1 litro',
  );
});

test('cart localStorage serialization filters invalid entries and preserves quantities/notes', () => {
  assert.equal(buildCartStorageKey('MGW_Burger'), 'mgw_menu_cart_mgw_burger');

  const raw = serializeStoredCart([
    { kind: 'combo', id: 'c1', quantity: 2, note: 'sem cebola' },
    { kind: 'product', id: 'p1', quantity: 150, note: '' },
    { kind: 'product', id: '', quantity: 1, note: '' },
  ]);

  const parsed = parseStoredCart(raw);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], {
    kind: 'combo',
    id: 'c1',
    quantity: 2,
    note: 'sem cebola',
  });
  assert.equal(parsed[1].quantity, 99);
  assert.deepEqual(parseStoredCart('invalid-json'), []);
});

test('customer profile serialization validates fields and tolerates malformed storage', () => {
  const serialized = serializeStoredCustomerProfile({
    customerName: '  Ana Clara ',
    customerPhone: '92999112233',
    fulfillmentType: 'delivery',
    deliveryAddress: 'Av. Brasil, 100',
    deliveryReference: 'Portão azul',
    paymentMethod: 'Pix',
  });

  const restored = parseStoredCustomerProfile(serialized);
  assert.deepEqual(restored, {
    customerName: 'Ana Clara',
    customerPhone: '92999112233',
    fulfillmentType: 'delivery',
    deliveryAddress: 'Av. Brasil, 100',
    deliveryReference: 'Portão azul',
    paymentMethod: 'Pix',
  });

  assert.equal(parseStoredCustomerProfile('{"invalid":'), null);
  assert.equal(parseStoredCustomerProfile(null), null);
});

test('computeMenuCategoryCounts computes totals across categories and combos', () => {
  const counts = computeMenuCategoryCounts(
    [
      { category: 'Lanche' },
      { category: 'Lanche' },
      { category: 'Bebida' },
      { category: 'Adicional' },
      { category: 'Outro' },
    ],
    4,
  );
  assert.deepEqual(counts, {
    all: 9,
    combos: 4,
    Lanche: 2,
    Bebida: 1,
    Adicional: 1,
    Outro: 1,
  });
});

test('computeCashChangeAmount returns positive change only when payment exceeds total', () => {
  assert.equal(computeCashChangeAmount(50, 34.5), 15.5);
  assert.equal(computeCashChangeAmount(34.5, 34.5), null);
  assert.equal(computeCashChangeAmount(20, 34.5), null);
  assert.equal(computeCashChangeAmount(null, 34.5), null);
});

