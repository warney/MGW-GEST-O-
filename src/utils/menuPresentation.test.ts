import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicMenuView } from '../components/PublicMenuView';
import type { PublicDigitalMenuPayload } from '../types/finance';
import {
  buildCartStorageKey,
  computeCashChangeAmount,
  computeMenuCategoryCounts,
  formatCategorySectionTitle,
  formatCategoryTabLabel,
  formatComboComposition,
  getStoreMonogram,
  groupProductsByCategory,
  isBeverageCategory,
  parseStoredCart,
  parseStoredCustomerProfile,
  resolveComboPromoBadges,
  serializeStoredCart,
  serializeStoredCustomerProfile,
  shouldShowComboComposition,
  splitComboTitleHighlight,
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
    deliveryNeighborhood: '',
    deliveryCity: '',
    deliveryRegionId: '',
    paymentMethod: 'Pix',
  });

  const restored = parseStoredCustomerProfile(serialized);
  assert.deepEqual(restored, {
    customerName: 'Ana Clara',
    customerPhone: '92999112233',
    fulfillmentType: 'delivery',
    deliveryAddress: 'Av. Brasil, 100',
    deliveryReference: 'Portão azul',
    deliveryNeighborhood: '',
    deliveryCity: '',
    deliveryRegionId: '',
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

test('isBeverageCategory and groupProductsByCategory sort beverages and preserve custom categories', () => {
  assert.equal(isBeverageCategory('Bebidas'), true);
  assert.equal(isBeverageCategory('Sucos Naturais'), true);
  assert.equal(isBeverageCategory('Refrigerantes'), true);
  assert.equal(isBeverageCategory('Porções'), false);

  const grouped = groupProductsByCategory([
    { id: '1', category: 'Porções' },
    { id: '2', category: 'Bebidas Geladas' },
    { id: '3', category: 'Lanches' },
    { id: '4', category: 'Porções' },
  ]);

  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].category, 'Bebidas Geladas');
  assert.equal(grouped[0].isBeverage, true);
  assert.equal(grouped[1].category, 'Lanches');
  assert.equal(grouped[1].isBeverage, false);
  assert.equal(grouped[2].category, 'Porções');
  assert.equal(grouped[2].items.length, 2);
});

test('PublicMenuView preserves each establishment visual identity, dynamic catalog, dark-gold theme, and mobile cart bar', () => {
  const noop = () => {};

  const storeAPayload: PublicDigitalMenuPayload = {
    found: true,
    store: {
      slug: 'sabor-da-villa',
      isActive: true,
      isOpen: true,
      storeName: 'Sabor da Villa',
      description: 'Hambúrgueres na brasa desde 2021',
      phoneWhatsapp: '92991234567',
      address: 'Rua das Flores, 42',
      openingHours: 'Terça a Domingo 18h às 23h',
      pixKey: 'sabor@villa.com',
      deliveryFee: 7.5,
      minimumOrderAmount: 20,
      acceptsDelivery: true,
      acceptsPickup: true,
      logoUrl: 'https://cdn.example.com/villa-logo.png',
      bannerUrl: 'https://cdn.example.com/villa-banner.jpg',
    },
    combos: [
      {
        id: 'combo-villa-1',
        name: 'Combo Villa Duplo',
        description: '2 Villa Smash + 1 Guaraná Lata',
        salePrice: 42.9,
        imageUrl: 'https://cdn.example.com/villa-combo.jpg',
        items: [
          {
            productId: 'prod-smash',
            productName: 'Villa Smash',
            quantity: 2,
            countsAsXSalada: true,
          },
        ],
      },
    ],
    products: [
      {
        id: 'prod-coca',
        name: 'Coca-Cola 350ml',
        category: 'Bebida',
        unitPrice: 6.5,
        countsAsXSalada: false,
        imageUrl: 'https://cdn.example.com/coca.png',
      },
      {
        id: 'prod-smash',
        name: 'Villa Smash',
        category: 'Lanche',
        unitPrice: 21.0,
        countsAsXSalada: true,
        addonGroups: [
          {
            id: 'grp-molhos',
            name: 'Molho Extra',
            isRequired: false,
            minSelect: 0,
            maxSelect: 2,
            active: true,
            sortOrder: 1,
            options: [
              {
                id: 'opt-bacon',
                groupId: 'grp-molhos',
                name: 'Maionese Defumada',
                price: 3.0,
                active: true,
                sortOrder: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'prod-fritas',
        name: 'Batata Rústica',
        category: 'Porções',
        unitPrice: 18.0,
        countsAsXSalada: false,
      },
    ],
  };

  const htmlA = renderToStaticMarkup(
    createElement(PublicMenuView, {
      slug: 'sabor-da-villa',
      onOrderCreated: noop,
      initialPayload: storeAPayload,
    }),
  );

  // Store A own visual identity and operational data
  assert.ok(htmlA.includes('Sabor da Villa'));
  assert.ok(htmlA.includes('Hambúrgueres na brasa desde 2021'));
  assert.ok(htmlA.includes('https://cdn.example.com/villa-logo.png'));
  assert.ok(htmlA.includes('https://cdn.example.com/villa-banner.jpg'));
  assert.ok(htmlA.includes('Terça a Domingo 18h às 23h'));
  assert.ok(htmlA.includes('Rua das Flores, 42'));
  assert.ok(htmlA.includes('92991234567'));
  assert.ok(htmlA.includes('Aberto para pedidos'));
  assert.ok(htmlA.includes('Retirada disponível'));
  assert.ok(htmlA.includes('Compartilhar'));
  assert.ok(htmlA.includes('Falar no WhatsApp'));

  // Dynamic categories & sections & dark-gold tokens
  assert.ok(htmlA.includes('data-testid="menu-category-tabs"'));
  assert.ok(htmlA.includes('Combos Especiais'));
  assert.ok(htmlA.includes('Combo Villa Duplo'));
  assert.ok(htmlA.includes('Bebidas Geladas'));
  assert.ok(htmlA.includes('w-[44%] sm:w-[45%]'));
  assert.ok(htmlA.includes('Porções'));
  assert.ok(htmlA.includes('Batata Rústica'));
  assert.ok(htmlA.includes('Toque para escolher adicionais'));
  assert.ok(htmlA.includes('bg-[#0A0C10]'));
  assert.ok(htmlA.includes('bg-[#14171F]'));
  assert.ok(htmlA.includes('bg-[#F5B900]'));
  assert.ok(htmlA.includes('Meu Pedido'));
  assert.ok(htmlA.includes('Ver Carrinho'));

  // No fabricated promo badges when price savings / sharing / order counts are not grounded
  assert.ok(!htmlA.includes('MAIS'));
  assert.ok(!htmlA.includes('CUSTO-BENEFÍCIO'));
  assert.ok(!htmlA.includes('PARA COMPARTILHAR'));
  assert.ok(!htmlA.includes('MGW Burger'));

  // Store B: completely isolated second establishment
  const storeBPayload: PublicDigitalMenuPayload = {
    found: true,
    store: {
      slug: 'pizzaria-aurora',
      isActive: true,
      isOpen: false,
      storeName: 'Pizzaria Aurora',
      description: 'Forno a lenha artesanal',
      phoneWhatsapp: '11988887777',
      address: 'Av. Paulista, 900',
      openingHours: 'Todos os dias 19h às 00h',
      pixKey: '',
      deliveryFee: 0,
      minimumOrderAmount: 0,
      acceptsDelivery: true,
      acceptsPickup: false,
      logoUrl: 'https://cdn.example.com/aurora-logo.png',
      bannerUrl: 'https://cdn.example.com/aurora-banner.jpg',
    },
    combos: [],
    products: [
      {
        id: 'pizza-marguerita',
        name: 'Marguerita Clássica',
        category: 'Pizzas',
        unitPrice: 54.0,
        countsAsXSalada: false,
      },
    ],
  };

  const htmlB = renderToStaticMarkup(
    createElement(PublicMenuView, {
      slug: 'pizzaria-aurora',
      onOrderCreated: noop,
      initialPayload: storeBPayload,
    }),
  );

  assert.ok(htmlB.includes('Pizzaria Aurora'));
  assert.ok(htmlB.includes('Forno a lenha artesanal'));
  assert.ok(htmlB.includes('https://cdn.example.com/aurora-logo.png'));
  assert.ok(htmlB.includes('https://cdn.example.com/aurora-banner.jpg'));
  assert.ok(htmlB.includes('Fechado no momento'));
  assert.ok(htmlB.includes('Entrega grátis'));
  assert.ok(htmlB.includes('Marguerita Clássica'));
  assert.ok(!htmlB.includes('Retirada disponível'));
  assert.ok(!htmlB.includes('Sabor da Villa'));
  assert.ok(!htmlB.includes('villa-logo.png'));
  assert.ok(!htmlB.includes('MGW Burger'));

  // Store C: fallback monogram when logoUrl/bannerUrl are absent
  const storeCPayload: PublicDigitalMenuPayload = {
    found: true,
    store: {
      slug: 'toca-do-acai',
      isActive: true,
      isOpen: true,
      storeName: 'Toca do Açaí',
      description: '',
      phoneWhatsapp: '',
      address: '',
      openingHours: '',
      pixKey: '',
      deliveryFee: 4,
      minimumOrderAmount: 0,
      acceptsDelivery: false,
      acceptsPickup: true,
    },
    combos: [],
    products: [],
  };

  const htmlC = renderToStaticMarkup(
    createElement(PublicMenuView, {
      slug: 'toca-do-acai',
      onOrderCreated: noop,
      initialPayload: storeCPayload,
    }),
  );

  assert.ok(htmlC.includes('Toca do Açaí'));
  assert.ok(htmlC.includes('>T<'));
  assert.ok(htmlC.includes('Somente retirada'));
  assert.ok(!htmlC.includes('villa-logo.png'));
  assert.ok(!htmlC.includes('aurora-logo.png'));
});

test('splitComboTitleHighlight, category display helpers, and grounded promo badges behave accurately', () => {
  assert.deepEqual(splitComboTitleHighlight('COMBO 1'), {
    prefix: 'COMBO ',
    highlightNumber: '1',
    suffix: '',
  });
  assert.deepEqual(splitComboTitleHighlight('Combo 2 - Especial'), {
    prefix: 'Combo ',
    highlightNumber: '2',
    suffix: ' - Especial',
  });
  assert.deepEqual(splitComboTitleHighlight('Combo 500ml'), {
    prefix: 'Combo 500ml',
    highlightNumber: null,
    suffix: '',
  });
  assert.deepEqual(splitComboTitleHighlight('Combo Villa Duplo'), {
    prefix: 'Combo Villa Duplo',
    highlightNumber: null,
    suffix: '',
  });

  assert.equal(formatCategorySectionTitle('Bebida'), 'Bebidas Geladas');
  assert.equal(formatCategorySectionTitle('Porções'), 'Porções');
  assert.equal(formatCategoryTabLabel('Bebida'), 'Bebidas');
  assert.equal(formatCategoryTabLabel('Lanche'), 'Lanches');
  assert.equal(formatCategoryTabLabel('Porções'), 'Porções');

  const products = [
    { id: 'x-salada', unitPrice: 15.0 },
    { id: 'refri-1l', unitPrice: 8.0 },
  ];

  // Without real telemetry, MAIS PEDIDO is never invented; real savings & >=3 snacks earn grounded badges
  const badgesWithoutTelemetry = resolveComboPromoBadges(
    [
      {
        id: 'c1',
        name: 'COMBO 1',
        description: '1 X-Salada + 1 Refrigerante',
        salePrice: 18.0,
        items: [{ productId: 'x-salada', productName: 'X-Salada', quantity: 1, countsAsXSalada: true }],
      },
      {
        id: 'c2',
        name: 'COMBO 2',
        description: '2 X-Saladas + 1 Refrigerante 1L',
        salePrice: 24.0, // standalone: 2*15 + 8 = 38 (36.8% real savings)
        items: [
          { productId: 'x-salada', productName: 'X-Salada', quantity: 2, countsAsXSalada: true },
          { productId: 'refri-1l', productName: 'Refri 1L', quantity: 1, countsAsXSalada: false },
        ],
      },
      {
        id: 'c3',
        name: 'COMBO 3',
        description: '3 X-Saladas + 1 Refrigerante 1L',
        salePrice: 44.0, // standalone: 3*15 + 8 = 53 (~17% savings), 3 main snacks => shareable
        items: [
          { productId: 'x-salada', productName: 'X-Salada', quantity: 3, countsAsXSalada: true },
          { productId: 'refri-1l', productName: 'Refri 1L', quantity: 1, countsAsXSalada: false },
        ],
      },
    ],
    products,
  );

  assert.equal(badgesWithoutTelemetry.c1, undefined);
  assert.deepEqual(badgesWithoutTelemetry.c2, {
    kind: 'best_value',
    line1: 'MELHOR',
    line2: 'CUSTO-BENEFÍCIO',
  });
  assert.deepEqual(badgesWithoutTelemetry.c3, {
    kind: 'shareable',
    line1: 'IDEAL',
    line2: 'PARA COMPARTILHAR',
  });

  // When real orderCount is supplied, MAIS PEDIDO appears on the genuine top seller
  const badgesWithTelemetry = resolveComboPromoBadges(
    [
      {
        id: 'c1',
        name: 'COMBO 1',
        description: '',
        salePrice: 15.0,
        orderCount: 142,
        items: [{ productId: 'x-salada', productName: 'X-Salada', quantity: 1, countsAsXSalada: true }],
      },
    ],
    products,
  );
  assert.deepEqual(badgesWithTelemetry.c1, {
    kind: 'most_ordered',
    line1: 'MAIS',
    line2: 'PEDIDO',
  });

  // Render check with numbered combos and grounded badges in PublicMenuView
  const htmlGrounded = renderToStaticMarkup(
    createElement(PublicMenuView, {
      slug: 'sabor-teste',
      onOrderCreated: () => {},
      initialPayload: {
        found: true,
        store: {
          slug: 'sabor-teste',
          isActive: true,
          isOpen: true,
          storeName: 'Sabor Teste',
          description: 'Lanches na chapa',
          phoneWhatsapp: '92999990000',
          address: 'Rua Teste, 10',
          openingHours: '18h às 23h',
          pixKey: '',
          deliveryFee: 5,
          minimumOrderAmount: 0,
          acceptsDelivery: true,
          acceptsPickup: true,
        },
        combos: [
          {
            id: 'c2',
            name: 'COMBO 2',
            description: '2 X-Saladas + 1 Refri 1L',
            salePrice: 24.0,
            items: [
              { productId: 'x-salada', productName: 'X-Salada', quantity: 2, countsAsXSalada: true },
              { productId: 'refri-1l', productName: 'Refri 1L', quantity: 1, countsAsXSalada: false },
            ],
          },
          {
            id: 'c3',
            name: 'COMBO 3',
            description: '3 X-Saladas + 1 Refri 1L',
            salePrice: 44.0,
            items: [
              { productId: 'x-salada', productName: 'X-Salada', quantity: 3, countsAsXSalada: true },
              { productId: 'refri-1l', productName: 'Refri 1L', quantity: 1, countsAsXSalada: false },
            ],
          },
        ],
        products: [
          {
            id: 'x-salada',
            name: 'X-Salada',
            category: 'Lanche',
            unitPrice: 15.0,
            countsAsXSalada: true,
          },
          {
            id: 'refri-1l',
            name: 'Refri 1L',
            category: 'Bebida',
            unitPrice: 8.0,
            countsAsXSalada: false,
          },
        ],
      },
    }),
  );

  assert.ok(htmlGrounded.includes('CUSTO-BENEFÍCIO'));
  assert.ok(htmlGrounded.includes('PARA COMPARTILHAR'));
  assert.ok(htmlGrounded.includes('<span class="text-[#F5B900]">2</span>'));
  assert.ok(htmlGrounded.includes('<span class="text-[#F5B900]">3</span>'));
  assert.ok(!htmlGrounded.includes('MAIS PEDIDO'));
});


