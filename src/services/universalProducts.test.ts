import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductsCombosManager } from '../components/ProductsCombosManager';
import {
  buildProductPayloadForSupabase,
  mapProductRow,
  mapPublicDigitalMenuRpcResponse,
} from './supabaseMappers';
import { filterProductsForCatalog, computeCatalogStats, buildCatalogCategories } from '../utils/catalogSummary';
import {
  buildProductInputFromRecord,
  calculateProductFinancials,
  collectTenantBrands,
  findProductByBarcode,
  formatProductPackagingLabel,
  formatProductVolumeLabel,
  isValidBarcodeFormat,
  normalizeBarcodeInput,
  validateUniversalProductInput,
} from '../utils/universalProducts';
import type { ComboRecord, ProductInput, ProductRecord } from '../types/finance';

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20261127140000_etapa3_universal_products.sql',
);
const CATALOG_MODALS_PATH = path.resolve(
  process.cwd(),
  'src/components/CatalogModals.tsx',
);
const DATA_SERVICE_PATH = path.resolve(
  process.cwd(),
  'src/services/dataService.ts',
);

const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
const activeMigrationSql = migrationSql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');
const catalogModalsSource = fs.readFileSync(CATALOG_MODALS_PATH, 'utf8');
const dataServiceSource = fs.readFileSync(DATA_SERVICE_PATH, 'utf8');

function makeManagerBaseProps(
  overrides: Partial<Parameters<typeof ProductsCombosManager>[0]> = {},
) {
  return {
    workspaceId: '',
    products: [] as ProductRecord[],
    combos: [] as ComboRecord[],
    defaultXSaladaPrice: 22,
    onCreateProduct: async () => 'new-prod',
    onUpdateProduct: async () => {},
    onCreateCombo: async () => 'new-combo',
    onUpdateCombo: async () => {},
    onSeedCatalog: async () => {},
    ...overrides,
  };
}

function makeAdegaProduct(
  id: string,
  overrides: Partial<ProductRecord> = {},
): ProductRecord {
  return {
    id,
    ownerId: 'adega-tenant',
    name: 'Cerveja Heineken Long Neck',
    category: 'Cervejas',
    unitPrice: 9.0,
    countsAsXSalada: false,
    active: true,
    description: 'Cerveja pilsen premium gelada',
    internalCode: 'ADG-001',
    costPrice: 4.5,
    brand: 'Heineken',
    notes: 'Manter refrigerada',
    barcode: '7891991010856',
    volumeValue: 330,
    volumeUnit: 'ml',
    saleUnit: 'garrafa',
    packageType: 'fardo',
    unitsPerPackage: 6,
    createdAtMs: 1000,
    updatedAtMs: 1000,
    ...overrides,
  };
}

// ============================================================================
// CENÁRIO A — LANCHONETES EXISTENTES
// ============================================================================

test('Cenário A: Lanchonete legada preserva mapeamento, payload mínimo e interface atual sem alterações', () => {
  // 1. Linha antiga vinda de banco sem colunas universais preenchidas
  const legacyRow = {
    id: 'prod-legacy-1',
    tenant_id: 'tenant-lanchonete',
    owner_email: 'lanche@mgw.com.br',
    name: 'X-Salada Especial',
    category: 'Lanche',
    unit_price: '24.50',
    counts_as_x_salada: true,
    active: true,
    image_url: 'https://cdn.example.com/xsalada.jpg',
    image_path: 'products/xsalada.jpg',
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-01T12:00:00.000Z',
  };

  const mapped = mapProductRow(legacyRow);
  assert.equal(mapped.id, 'prod-legacy-1');
  assert.equal(mapped.name, 'X-Salada Especial');
  assert.equal(mapped.category, 'Lanche');
  assert.equal(mapped.unitPrice, 24.5);
  assert.equal(mapped.countsAsXSalada, true);
  assert.equal(mapped.active, true);
  assert.equal(mapped.barcode, undefined);
  assert.equal(mapped.costPrice, undefined);

  // 2. Payload de lanchonete não envia colunas universais desnecessárias
  const legacyInput: ProductInput = {
    name: ' X-Bacon ',
    category: 'Lanche',
    unitPrice: 28,
    countsAsXSalada: true,
    active: true,
    imageUrl: '',
    imagePath: '',
  };
  const payload = buildProductPayloadForSupabase(legacyInput);
  assert.deepEqual(Object.keys(payload).sort(), [
    'active',
    'category',
    'counts_as_x_salada',
    'image_path',
    'image_url',
    'name',
    'unit_price',
  ]);

  // 3. Interface visual da Lanchonete permanece 100% preservada
  const lanchoneteHtml = renderToStaticMarkup(
    createElement(
      ProductsCombosManager,
      makeManagerBaseProps({
        businessSegment: 'lanchonete',
        products: [mapped],
      }),
    ),
  );
  assert.match(lanchoneteHtml, /Buscar produtos\.\.\./);
  assert.doesNotMatch(lanchoneteHtml, /Buscar por nome, marca ou código de barras/);
  assert.doesNotMatch(lanchoneteHtml, /Segmento: Adega/);
  assert.doesNotMatch(lanchoneteHtml, /EAN /);

  const lanchoneteEmptyHtml = renderToStaticMarkup(
    createElement(
      ProductsCombosManager,
      makeManagerBaseProps({
        businessSegment: 'lanchonete',
      }),
    ),
  );
  assert.match(lanchoneteEmptyHtml, /Catálogo inicial de exemplo/);
  assert.match(lanchoneteEmptyHtml, /Cadastre seus lanches, pastéis e bebidas/);

  // 4. Migration estritamente aditiva sem alterar RLS ou registros existentes
  assert.doesNotMatch(activeMigrationSql, /\bDROP\s+POLICY\b/i);
  assert.doesNotMatch(activeMigrationSql, /\bALTER\s+POLICY\b/i);
  assert.doesNotMatch(activeMigrationSql, /\bDROP\s+COLUMN\b/i);
  assert.doesNotMatch(activeMigrationSql, /\bUPDATE\s+public\.products\b/i);
  assert.doesNotMatch(activeMigrationSql, /\bINSERT\s+INTO\s+public\.(products|product_categories)\b/i);
});

// ============================================================================
// CENÁRIO B — CADASTRO DE PRODUTOS PARA ADEGAS
// ============================================================================

test('Cenário B: Cadastro universal de produtos de Adega, cálculo de margem sem divisão por zero e preservação ao editar/inativar', () => {
  // 1. Validação e criação completa de item de Adega
  const validInput = validateUniversalProductInput(
    {
      name: '  Whisky Jack Daniel\'s Old No. 7  ',
      category: 'Destilados',
      unitPriceRaw: '149,90',
      costPriceRaw: '105,00',
      description: 'Garrafa vidro 1 litro',
      internalCode: 'WD-001',
      brand: 'Jack Daniel\'s',
      notes: 'Item alto giro fim de semana',
      barcode: '5099873041017',
      volumeValueRaw: '1',
      volumeUnit: 'l',
      saleUnit: 'garrafa',
      packageType: 'caixa',
      unitsPerPackageRaw: '12',
      active: true,
      imageUrl: 'https://cdn.example.com/jack.jpg',
      imagePath: 'products/jack.jpg',
    },
    [],
    { segment: 'adega' },
  );

  assert.equal(validInput.name, 'Whisky Jack Daniel\'s Old No. 7');
  assert.equal(validInput.category, 'Destilados');
  assert.equal(validInput.unitPrice, 149.9);
  assert.equal(validInput.costPrice, 105);
  assert.equal(validInput.brand, 'Jack Daniel\'s');
  assert.equal(validInput.barcode, '5099873041017');
  assert.equal(validInput.volumeValue, 1);
  assert.equal(validInput.volumeUnit, 'l');
  assert.equal(validInput.saleUnit, 'garrafa');
  assert.equal(validInput.packageType, 'caixa');
  assert.equal(validInput.unitsPerPackage, 12);
  assert.equal(validInput.countsAsXSalada, false);

  // 2. Payload Supabase completo e roundtrip mapProductRow
  const supaPayload = buildProductPayloadForSupabase(validInput);
  assert.equal(supaPayload.cost_price, 105);
  assert.equal(supaPayload.brand, 'Jack Daniel\'s');
  assert.equal(supaPayload.barcode, '5099873041017');
  assert.equal(supaPayload.volume_value, 1);
  assert.equal(supaPayload.volume_unit, 'l');
  assert.equal(supaPayload.sale_unit, 'garrafa');
  assert.equal(supaPayload.package_type, 'caixa');
  assert.equal(supaPayload.units_per_package, 12);

  const hydrated = mapProductRow({
    id: 'adega-p1',
    tenant_id: 'tenant-adega-1',
    name: supaPayload.name,
    category: supaPayload.category,
    unit_price: supaPayload.unit_price,
    counts_as_x_salada: supaPayload.counts_as_x_salada,
    active: supaPayload.active,
    image_url: supaPayload.image_url,
    image_path: supaPayload.image_path,
    description: supaPayload.description,
    internal_code: supaPayload.internal_code,
    cost_price: supaPayload.cost_price,
    brand: supaPayload.brand,
    notes: supaPayload.notes,
    barcode: supaPayload.barcode,
    volume_value: supaPayload.volume_value,
    volume_unit: supaPayload.volume_unit,
    sale_unit: supaPayload.sale_unit,
    package_type: supaPayload.package_type,
    units_per_package: supaPayload.units_per_package,
    created_at: '2026-11-27T12:00:00.000Z',
    updated_at: '2026-11-27T12:00:00.000Z',
  });
  assert.equal(hydrated.brand, 'Jack Daniel\'s');
  assert.equal(hydrated.unitsPerPackage, 12);
  assert.equal(formatProductVolumeLabel(hydrated.volumeValue, hydrated.volumeUnit), '1 L');
  assert.equal(formatProductPackagingLabel(hydrated), 'Caixa c/ 12 un');

  // 3. Preservação total dos campos universais ao desativar ou renomear categoria
  const toggledPayload = buildProductInputFromRecord(hydrated, { active: false });
  assert.equal(toggledPayload.active, false);
  assert.equal(toggledPayload.brand, 'Jack Daniel\'s');
  assert.equal(toggledPayload.barcode, '5099873041017');
  assert.equal(toggledPayload.costPrice, 105);
  assert.equal(toggledPayload.volumeValue, 1);
  assert.equal(toggledPayload.volumeUnit, 'l');
  assert.equal(toggledPayload.unitsPerPackage, 12);
  assert.equal(toggledPayload.imageUrl, 'https://cdn.example.com/jack.jpg');

  // 4. Cálculo de margem e lucro bruto unitário sem divisão por zero
  const normalMargin = calculateProductFinancials({ unitPrice: 10, costPrice: 6 });
  assert.equal(normalMargin.hasValidCost, true);
  assert.equal(normalMargin.grossProfitPerUnit, 4);
  assert.equal(normalMargin.marginPercent, 40);

  const negativeMargin = calculateProductFinancials({ unitPrice: 8, costPrice: 10 });
  assert.equal(negativeMargin.hasValidCost, true);
  assert.equal(negativeMargin.grossProfitPerUnit, -2);
  assert.equal(negativeMargin.marginPercent, -25);

  const zeroCost = calculateProductFinancials({ unitPrice: 10, costPrice: 0 });
  assert.equal(zeroCost.hasValidCost, false);
  assert.equal(zeroCost.grossProfitPerUnit, null);
  assert.equal(zeroCost.marginPercent, null);

  const zeroPrice = calculateProductFinancials({ unitPrice: 0, costPrice: 5 });
  assert.equal(zeroPrice.hasValidCost, true);
  assert.equal(zeroPrice.grossProfitPerUnit, -5);
  assert.equal(zeroPrice.marginPercent, null); // Sem divisão por zero!

  // 5. Rejeição de valores inválidos / negativos / incompletos
  assert.throws(
    () =>
      validateUniversalProductInput(
        { name: 'Gin', category: 'Destilados', unitPriceRaw: '-5' },
        [],
        { segment: 'adega' },
      ),
    /preço de venda válido/i,
  );
  assert.throws(
    () =>
      validateUniversalProductInput(
        { name: 'Gin', category: 'Destilados', unitPriceRaw: '50', costPriceRaw: '-1' },
        [],
        { segment: 'adega' },
      ),
    /custo de aquisição válido/i,
  );
  assert.throws(
    () =>
      validateUniversalProductInput(
        { name: 'Cerveja', category: 'Cervejas', unitPriceRaw: '10', volumeValueRaw: '350', volumeUnit: '' },
        [],
        { segment: 'adega' },
      ),
    /volume\/quantidade junto com a unidade/i,
  );
  assert.throws(
    () =>
      validateUniversalProductInput(
        { name: 'Cerveja', category: 'Cervejas', unitPriceRaw: '10', unitsPerPackageRaw: '0' },
        [],
        { segment: 'adega' },
      ),
    /Unidades por embalagem/i,
  );

  // 6. Sugestões dinâmicas de marca sem dependência fixa
  const brands = collectTenantBrands([
    makeAdegaProduct('a1', { brand: 'Heineken' }),
    makeAdegaProduct('a2', { brand: 'Red Bull' }),
    makeAdegaProduct('a3', { brand: 'heineken' }),
  ]);
  assert.deepEqual(brands, ['Heineken', 'Red Bull']);

  // 7. Renderização visual da Adega (esconde seed X-Salada e exibe badges da Adega)
  const adegaHtml = renderToStaticMarkup(
    createElement(
      ProductsCombosManager,
      makeManagerBaseProps({
        businessSegment: 'adega',
        products: [makeAdegaProduct('a1')],
      }),
    ),
  );
  assert.match(adegaHtml, /Buscar por nome, marca ou código de barras/);
  assert.match(adegaHtml, /Heineken/);
  assert.match(adegaHtml, /330 ml/);
  assert.match(adegaHtml, /Fardo c\/ 6 un/);
  assert.match(adegaHtml, /50,0%/);
  assert.match(adegaHtml, /EAN 7891991010856/);
  assert.doesNotMatch(adegaHtml, /Catálogo inicial de exemplo/);

  // Garante que CatalogModals protege Enter em leitor de código de barras e isola segmento
  assert.match(catalogModalsSource, /e\.key === 'Enter'/);
  assert.match(catalogModalsSource, /Segmento: Adega/);
});

// ============================================================================
// CENÁRIO C — CÓDIGO DE BARRAS
// ============================================================================

test('Cenário C: Validação de formato, leitura por código, unicidade por tenant e repetição permitida entre tenants distintos', () => {
  assert.equal(normalizeBarcodeInput(' 789 1991 010856 '), '7891991010856');
  assert.equal(normalizeBarcodeInput('   '), null);
  assert.equal(isValidBarcodeFormat('7891991010856'), true);
  assert.equal(isValidBarcodeFormat('12345678'), true);
  assert.equal(isValidBarcodeFormat('1234567'), false);
  assert.equal(isValidBarcodeFormat('789199101085A'), false);

  const adegaAProducts = [
    makeAdegaProduct('a1', { name: 'Heineken 330ml', barcode: '7891991010856' }),
    makeAdegaProduct('a2', { name: 'Gelo Saborizado', barcode: null }),
  ];

  // Duplicidade bloqueada dentro do mesmo estabelecimento
  assert.throws(
    () =>
      validateUniversalProductInput(
        {
          name: 'Outra Cerveja',
          category: 'Cervejas',
          unitPriceRaw: '8',
          barcode: '7891991010856',
        },
        adegaAProducts,
        { segment: 'adega' },
      ),
    /já está cadastrado em "Heineken 330ml"/,
  );

  // Editar o mesmo produto mantendo seu próprio código de barras é permitido
  const selfEdit = validateUniversalProductInput(
    {
      name: 'Heineken 330ml Gelada',
      category: 'Cervejas',
      unitPriceRaw: '9.50',
      barcode: '7891991010856',
    },
    adegaAProducts,
    { editingProductId: 'a1', segment: 'adega' },
  );
  assert.equal(selfEdit.barcode, '7891991010856');

  // Múltiplos produtos sem código de barras no mesmo tenant são permitidos
  const noBarcodeProd = validateUniversalProductInput(
    {
      name: 'Carvão 3kg',
      category: 'Conveniência',
      unitPriceRaw: '18',
      barcode: '',
    },
    adegaAProducts,
    { segment: 'adega' },
  );
  assert.equal(noBarcodeProd.barcode, null);

  // Estabelecimento B diferente pode cadastrar o mesmo código de barras normalmente
  const adegaBProducts: ProductRecord[] = [];
  const crossTenantSameBarcode = validateUniversalProductInput(
    {
      name: 'Heineken Long Neck',
      category: 'Cervejas',
      unitPriceRaw: '10',
      barcode: '7891991010856',
    },
    adegaBProducts,
    { segment: 'adega' },
  );
  assert.equal(crossTenantSameBarcode.barcode, '7891991010856');

  // Busca por código de barras localizando produto rapidamente
  const found = findProductByBarcode(adegaAProducts, '7891991010856');
  assert.equal(found?.id, 'a1');
  const searchHits = filterProductsForCatalog(adegaAProducts, {
    search: '7891991010856',
    category: 'all',
    status: 'all',
  });
  assert.equal(searchHits.length, 1);
  assert.equal(searchHits[0].id, 'a1');

  // Banco: índice parcial único por (tenant_id, barcode) e tratamento amigável no dataService
  assert.match(
    migrationSql,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_barcode\s+ON public\.products \(tenant_id, barcode\)\s+WHERE barcode IS NOT NULL AND btrim\(barcode\) <> ''/i,
  );
  assert.match(dataServiceSource, /uq_products_tenant_barcode/);
});

// ============================================================================
// CENÁRIO D — ISOLAMENTO E ESCOPO ESTRITO DA ETAPA 3
// ============================================================================

test('Cenário D: Isolamento multi-tenant, ausência de categorias falsas e respeito ao limite de escopo (sem estoque)', () => {
  // Índice de marca e validações são escopados por tenant_id
  assert.match(
    migrationSql,
    /CREATE INDEX IF NOT EXISTS idx_products_tenant_brand\s+ON public\.products \(tenant_id, lower\(brand\)\)/i,
  );
  assert.match(
    migrationSql,
    /CREATE TRIGGER trg_products_validate_universal_fields\s+BEFORE INSERT OR UPDATE ON public\.products/i,
  );

  // Categorias personalizadas funcionam igualmente sem criação automática artificial
  const adegaEmptyCategories = buildCatalogCategories([], []);
  assert.ok(adegaEmptyCategories.length > 0);
  // Nenhuma tabela de estoque, movimentação ou dedução em vendas criada na Etapa 3
  assert.doesNotMatch(migrationSql, /CREATE TABLE IF NOT EXISTS public\.(stock|inventory)/i);
  assert.doesNotMatch(migrationSql, /stock_movements|stock_balance/i);
});

// ============================================================================
// CENÁRIO E — COMPATIBILIDADE COM VENDAS, COMBOS E CARDÁPIO DIGITAL
// ============================================================================

test('Cenário E: Compatibilidade mantida com estatísticas de catálogo, combos e RPC do cardápio digital', () => {
  const adegaProduct = makeAdegaProduct('a1');
  const adegaCombo: ComboRecord = {
    id: 'c1',
    ownerId: 'adega-tenant',
    name: 'Combo Gin + Energético',
    description: '1 Gin + 2 Energéticos + 1 Gelo Saborizado',
    items: [
      {
        productId: adegaProduct.id,
        productName: adegaProduct.name,
        quantity: 2,
        countsAsXSalada: false,
      },
    ],
    salePrice: 120,
    estimatedCost: 70,
    active: true,
    createdAtMs: 1000,
    updatedAtMs: 1000,
  };

  const stats = computeCatalogStats([adegaProduct], [adegaCombo], [], []);
  assert.equal(stats.totalProductsCount, 1);
  assert.equal(stats.totalCombosCount, 1);

  // Cardápio digital público continua funcionando com produtos públicos sem vazar custo/margem/notas
  const publicMenu = mapPublicDigitalMenuRpcResponse({
    found: true,
    store: {
      slug: 'adega-central',
      isActive: true,
      isOpen: true,
      storeName: 'Adega Central',
      businessSegment: 'adega',
    },
    products: [
      {
        id: 'a1',
        name: adegaProduct.name,
        category: adegaProduct.category,
        unitPrice: adegaProduct.unitPrice,
        countsAsXSalada: false,
        imageUrl: '',
      },
    ],
    combos: [],
  });
  assert.equal(publicMenu.found, true);
  assert.equal(publicMenu.store?.businessSegment, 'adega');
  assert.equal(publicMenu.products.length, 1);
  assert.equal('costPrice' in publicMenu.products[0], false);
  assert.equal('notes' in publicMenu.products[0], false);
});
