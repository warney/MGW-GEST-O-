import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ComboComponentInput,
  ComboRecord,
  InventoryPackagingConversionRecord,
  ProductRecord,
} from '../types/finance';
import {
  calculateComboCompositionMetrics,
  consolidateComboComponentInputs,
  evaluateComboStockAvailability,
} from './combosComposition';

const product: ProductRecord = {
  id: 'p1',
  ownerId: 'tenant-1',
  name: 'Gin 1L',
  category: 'Bebidas',
  unitPrice: 80,
  costPrice: 45,
  countsAsXSalada: false,
  active: true,
  createdAtMs: 1,
  updatedAtMs: 1,
};

const packageA: InventoryPackagingConversionRecord = {
  id: 'pkg-a',
  tenantId: 'tenant-1',
  productId: 'p1',
  packageLabel: 'Caixa com 6',
  packageType: 'caixa',
  factorToBase: 6,
  isDefaultPurchase: false,
  active: true,
  createdAtMs: 1,
  updatedAtMs: 1,
};

const packageB: InventoryPackagingConversionRecord = {
  ...packageA,
  id: 'pkg-b',
  packageLabel: 'Fardo com 12',
  factorToBase: 12,
};

const combo: ComboRecord = {
  id: 'combo-1',
  ownerId: 'tenant-1',
  name: 'Combo Gin',
  description: '',
  items: [],
  salePrice: 100,
  estimatedCost: 45,
  active: true,
  createdAtMs: 1,
  updatedAtMs: 1,
};

test('combos: consolida somente componentes com a mesma unidade e embalagem', () => {
  const merged = consolidateComboComponentInputs([
    { productId: 'p1', quantity: 2, unitLabel: 'Caixa', conversionFactor: 6, packagingConversionId: 'pkg-a' },
    { productId: 'p1', quantity: 3, unitLabel: 'Caixa', conversionFactor: 6, packagingConversionId: 'pkg-a' },
  ], { mergeSameProduct: true });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 5);
  assert.equal(merged[0].conversionFactor, 6);
});

test('combos: rejeita consolidação de embalagens diferentes do mesmo produto', () => {
  assert.throws(
    () => consolidateComboComponentInputs([
      { productId: 'p1', quantity: 1, unitLabel: 'Caixa 6', conversionFactor: 6, packagingConversionId: 'pkg-a' },
      { productId: 'p1', quantity: 1, unitLabel: 'Fardo 12', conversionFactor: 12, packagingConversionId: 'pkg-b' },
    ], { mergeSameProduct: true }),
    /embalagens ou unidades diferentes/i,
  );
});

test('combos: cálculo de custo falha quando um componente não existe', () => {
  const missing: ComboComponentInput = { productId: 'missing-product', quantity: 1 };
  assert.throws(
    () => calculateComboCompositionMetrics({
      components: [missing],
      products: [product],
      salePrice: 100,
    }),
    /não foi encontrado/i,
  );
});

test('combos: cálculo de custo rejeita conversão de embalagem inválida', () => {
  assert.throws(
    () => calculateComboCompositionMetrics({
      components: [{
        productId: 'p1',
        quantity: 1,
        packagingConversionId: 'pkg-belongs-to-another-product',
      }],
      products: [product],
      packagingConversions: [packageA],
      salePrice: 100,
    }),
    /embalagem de conversão inválida/i,
  );
});

test('combos: componente ausente torna disponibilidade indisponível e produção zero', () => {
  const result = evaluateComboStockAvailability({
    combo: {
      ...combo,
      components: [{
        id: 'component-1',
        tenantId: 'tenant-1',
        comboId: 'combo-1',
        productId: 'missing-product',
        quantity: 1,
        unitLabel: 'unidade',
        conversionFactor: 1,
        packagingConversionId: null,
        baseQuantity: 1,
        unitCostSnapshot: 0,
        totalCostSnapshot: 0,
        sortOrder: 0,
        createdAtMs: 1,
        updatedAtMs: 1,
      }],
    },
    products: [product],
    balances: [],
  });

  assert.equal(result.available, false);
  assert.equal(result.maxProducibleQty, 0);
  assert.equal(result.components[0].sufficient, false);
});

test('combos: disponibilidade considera fator de conversão e saldo de todos os componentes', () => {
  const result = evaluateComboStockAvailability({
    combo: {
      ...combo,
      components: [{
        id: 'component-1',
        tenantId: 'tenant-1',
        comboId: 'combo-1',
        productId: 'p1',
        quantity: 2,
        unitLabel: packageA.packageLabel,
        conversionFactor: packageA.factorToBase,
        packagingConversionId: packageA.id,
        baseQuantity: 12,
        unitCostSnapshot: 7.5,
        totalCostSnapshot: 90,
        sortOrder: 0,
        createdAtMs: 1,
        updatedAtMs: 1,
      }],
    },
    products: [product],
    balances: [{
      id: 'bal-1',
      tenantId: 'tenant-1',
      productId: 'p1',
      availableQty: 35,
      reservedQty: 0,
      minStockQty: 0,
      averageUnitCost: 7.5,
      lastCostPrice: 7.5,
      allowNegativeStock: false,
      createdAtMs: 1,
      updatedAtMs: 1,
    }],
  });

  assert.equal(result.available, true);
  assert.equal(result.maxProducibleQty, 2);
  assert.equal(result.components[0].requiredPerComboBase, 12);
});

test('Etapa 5 migration: preserva constraints alheias e exige idempotência segura', () => {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261127180000_etapa5_adega_combos.sql'),
    'utf8',
  );

  assert.match(sql, /DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check/i);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS inventory_movements_origin_type_check/i);
  assert.doesNotMatch(sql, /FOR v_conname IN\s+SELECT c\.conname[\s\S]{0,500}pg_get_constraintdef/i);
  assert.match(sql, /Chave de idempotencia obrigatoria/i);
  assert.match(sql, /Chave de idempotencia ja utilizada com dados diferentes/i);
  assert.match(sql, /AND pc\.active = true/i);
  assert.doesNotMatch(sql, /DROP POLICY IF EXISTS (products|combos|sales|online_orders)_/i);
});
