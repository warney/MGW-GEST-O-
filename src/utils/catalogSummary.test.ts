import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductsCombosManager } from '../components/ProductsCombosManager.tsx';
import type { ComboRecord, ProductRecord } from '../types/finance.ts';
import {
  buildCatalogCategories,
  buildSelectableCategoryNames,
  computeCatalogStats,
  filterAddonGroupsForCatalog,
  filterCombosForCatalog,
  filterProductsForCatalog,
  validateAddonGroupRules,
  type CatalogAddonGroup,
} from './catalogSummary.ts';

function makeProduct(
  id: string,
  name: string,
  category: string,
  unitPrice: number,
  overrides: Partial<ProductRecord> = {},
): ProductRecord {
  return {
    id,
    ownerId: 'user-1',
    name,
    category,
    unitPrice,
    countsAsXSalada: false,
    active: true,
    createdAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  };
}

function makeCombo(
  id: string,
  name: string,
  salePrice: number,
  overrides: Partial<ComboRecord> = {},
): ComboRecord {
  return {
    id,
    ownerId: 'user-1',
    name,
    description: '1 X-Salada + 1 Refri',
    items: [
      {
        productId: 'p1',
        productName: 'X-Salada',
        quantity: 1,
        countsAsXSalada: true,
      },
    ],
    salePrice,
    estimatedCost: 10,
    active: true,
    createdAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  };
}

test('buildCatalogCategories merges DB categories with product categories and computes product counts', () => {
  const products: ProductRecord[] = [
    makeProduct('p1', 'Hambúrguer Artesanal', 'Lanche', 24.9),
    makeProduct('p2', 'X-Salada', 'Lanche', 22.0, { countsAsXSalada: true, active: false }),
    makeProduct('p3', 'Pastel de Carne', 'Pastéis', 14.0),
  ];

  const categories = buildCatalogCategories(
    [
      { id: 'cat-1', name: 'Lanche', sort_order: 0, active: true },
      { id: 'cat-2', name: 'Bebida', sort_order: 1, active: true },
      { id: 'cat-3', name: 'Sobremesa', sort_order: 2, active: false },
    ],
    products,
  );

  assert.equal(categories.length, 4);
  const lanche = categories.find((c) => c.name === 'Lanche');
  assert.equal(lanche?.productCount, 2);
  assert.equal(lanche?.activeProductCount, 1);
  assert.equal(lanche?.isPersisted, true);

  const pasteis = categories.find((c) => c.name === 'Pastéis');
  assert.equal(pasteis?.productCount, 1);
  assert.equal(pasteis?.isPersisted, false);

  const selectable = buildSelectableCategoryNames(categories);
  assert.deepEqual(selectable, ['Lanche', 'Bebida', 'Pastéis']);
});

test('filterProductsForCatalog, filterCombosForCatalog and filterAddonGroupsForCatalog filter accurately', () => {
  const products: ProductRecord[] = [
    makeProduct('p1', 'Hambúrguer Artesanal', 'Lanche', 24.9),
    makeProduct('p2', 'Pizza Mussarela', 'Pizza', 39.9),
    makeProduct('p3', 'Água Mineral', 'Bebida', 4.0, { active: false }),
  ];

  assert.equal(
    filterProductsForCatalog(products, {
      search: 'pizza',
      category: 'all',
      status: 'all',
    }).length,
    1,
  );
  assert.equal(
    filterProductsForCatalog(products, {
      search: '',
      category: 'Bebida',
      status: 'inactive',
    }).length,
    1,
  );
  assert.equal(
    filterProductsForCatalog(products, {
      search: '',
      category: 'all',
      status: 'active',
    }).length,
    2,
  );

  const combos: ComboRecord[] = [
    makeCombo('c1', 'Combo Casal', 49.9),
    makeCombo('c2', 'Combo Kids', 29.9, { active: false }),
  ];
  assert.equal(
    filterCombosForCatalog(combos, { search: 'x-salada', status: 'active' }).length,
    1,
  );
  assert.equal(
    filterCombosForCatalog(combos, { search: '', status: 'inactive' }).length,
    1,
  );

  const groups: CatalogAddonGroup[] = [
    {
      id: 'g1',
      name: 'Sabores de Pastel',
      isRequired: true,
      minSelect: 1,
      maxSelect: 2,
      active: true,
      sortOrder: 0,
      linkedProductIds: ['p1'],
      options: [
        {
          id: 'o1',
          groupId: 'g1',
          name: 'Carne com Queijo',
          price: 0,
          active: true,
          sortOrder: 0,
        },
      ],
    },
  ];

  assert.equal(filterAddonGroupsForCatalog(groups, 'queijo').length, 1);
  assert.equal(filterAddonGroupsForCatalog(groups, 'bacon').length, 0);
});

test('validateAddonGroupRules enforces DB constraints and computeCatalogStats counts totals cleanly', () => {
  assert.equal(
    validateAddonGroupRules({ isRequired: false, minSelect: 0, maxSelect: 3 }),
    null,
  );
  assert.ok(
    validateAddonGroupRules({ isRequired: true, minSelect: 0, maxSelect: 2 }),
  );
  assert.ok(
    validateAddonGroupRules({ isRequired: false, minSelect: 3, maxSelect: 2 }),
  );
  assert.ok(
    validateAddonGroupRules({ isRequired: false, minSelect: 0, maxSelect: 31 }),
  );

  const stats = computeCatalogStats(
    [
      makeProduct('p1', 'X-Salada', 'Lanche', 22),
      makeProduct('p2', 'Refri', 'Bebida', 6, { active: false }),
    ],
    [makeCombo('c1', 'Combo 1', 26)],
    [
      {
        name: 'Lanche',
        sortOrder: 0,
        active: true,
        isPersisted: true,
        productCount: 1,
        activeProductCount: 1,
      },
    ],
    [
      {
        id: 'g1',
        name: 'Extras',
        isRequired: false,
        minSelect: 0,
        maxSelect: 3,
        active: true,
        sortOrder: 0,
        linkedProductIds: [],
        options: [
          { id: 'o1', groupId: 'g1', name: 'Bacon', price: 4, active: true, sortOrder: 0 },
          { id: 'o2', groupId: 'g1', name: 'Cheddar', price: 3.5, active: true, sortOrder: 1 },
        ],
      },
    ],
  );

  assert.equal(stats.totalProductsCount, 2);
  assert.equal(stats.activeProductsCount, 1);
  assert.equal(stats.totalCombosCount, 1);
  assert.equal(stats.totalCategoriesCount, 1);
  assert.equal(stats.totalAddonGroupsCount, 1);
  assert.equal(stats.totalAddonOptionsCount, 2);
});

test('ProductsCombosManager renders loading, empty, and populated Produtos reference UI with all 4 tabs', () => {
  const baseProps = {
    workspaceId: '',
    products: [] as ProductRecord[],
    combos: [] as ComboRecord[],
    defaultXSaladaPrice: 22,
    onCreateProduct: async () => 'new-prod',
    onUpdateProduct: async () => {},
    onCreateCombo: async () => 'new-combo',
    onUpdateCombo: async () => {},
    onSeedCatalog: async () => {},
  };

  const loadingHtml = renderToStaticMarkup(
    createElement(ProductsCombosManager, { ...baseProps, isLoading: true }),
  );
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /Carregando Produtos e Catálogo/);

  const emptyHtml = renderToStaticMarkup(
    createElement(ProductsCombosManager, baseProps),
  );
  assert.match(emptyHtml, /Produtos/);
  assert.match(emptyHtml, /Gerencie.*seu cardápio/);
  assert.match(emptyHtml, /Novo Produto/);
  assert.match(emptyHtml, /Catálogo inicial de exemplo/);
  assert.match(emptyHtml, /Nenhum produto cadastrado ainda\./);

  const populatedHtml = renderToStaticMarkup(
    createElement(ProductsCombosManager, {
      ...baseProps,
      products: [
        makeProduct('p1', 'Hambúrguer Artesanal', 'Lanche', 24.9),
        makeProduct('p2', 'Refrigerante Lata', 'Bebida', 6.0, { active: false }),
      ],
      combos: [makeCombo('c1', 'Combo 1', 28.0)],
    }),
  );

  assert.match(populatedHtml, /Buscar produtos\.\.\./);
  assert.match(populatedHtml, /Todas as categorias/);
  assert.match(populatedHtml, /Produtos[\s\S]*\(2\)/);
  assert.match(populatedHtml, /Combos[\s\S]*\(1\)/);
  assert.match(populatedHtml, /Categorias/);
  assert.match(populatedHtml, /Adicionais/);
  assert.match(populatedHtml, /Hambúrguer Artesanal/);
  assert.match(populatedHtml, /Disponível/);
  assert.match(populatedHtml, /Inativo/);
  assert.match(populatedHtml, /Editar produto Hambúrguer Artesanal/);
  assert.match(populatedHtml, /Desativar produto Hambúrguer Artesanal/);
  assert.match(populatedHtml, /Ativar produto Refrigerante Lata/);
});
