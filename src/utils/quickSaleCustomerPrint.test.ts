import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SaleOrderDraftItem, SaleRecord } from '../types/finance';
import {
  buildSaleInputFromOrder,
  formatSaleCustomerAddressLine,
  hasSaleCustomerDetails,
  isLikelyDuplicateSale,
} from './finance';
import {
  buildPrintableOrderDocument,
  fromSaleRecord,
  getPrintPageCss,
} from './orderPrint';
import {
  buildSalePayloadForSupabase,
  mapSaleRow,
  type SupabaseSaleRow,
} from '../services/supabaseMappers';
import { SalesView } from '../components/SalesView';

const SAMPLE_ITEMS: SaleOrderDraftItem[] = [
  {
    kind: 'combo',
    refId: 'combo-1',
    name: 'Combo 1',
    quantity: 2,
    unitPrice: 25,
    estimatedUnitCost: 12,
    components: [
      {
        productId: 'p-xsalada',
        productName: 'X-Salada',
        quantityPerUnit: 1,
        countsAsXSalada: true,
      },
      {
        productId: 'p-refri',
        productName: 'Refrigerante 250 ml',
        quantityPerUnit: 1,
        countsAsXSalada: false,
      },
    ],
  },
  {
    kind: 'product',
    refId: 'p-batata',
    name: 'Batata Média',
    quantity: 1,
    unitPrice: 14,
    estimatedUnitCost: 5,
    components: [
      {
        productId: 'p-batata',
        productName: 'Batata Média',
        quantityPerUnit: 1,
        countsAsXSalada: false,
      },
    ],
  },
];

test('quick sale without customer data builds valid input, Supabase payload, and receipt', () => {
  const input = buildSaleInputFromOrder(
    SAMPLE_ITEMS,
    '2026-11-26',
    'Pix',
    'Balcão',
  );

  assert.equal(input.customerId, null);
  assert.equal(input.customerName, '');
  assert.equal(input.customerAddress, '');
  assert.equal(input.customerNumber, '');
  assert.equal(input.customerNeighborhood, '');
  assert.equal(input.customerComplement, '');

  const payload = buildSalePayloadForSupabase(input);
  assert.equal(payload.customer_id, null);
  assert.equal(payload.customer_name, '');
  assert.equal(payload.customer_address, '');
  assert.equal(payload.total_amount, 64);

  const mapped = mapSaleRow({
    id: 'sale-no-cust',
    tenant_id: 'tenant-1',
    owner_email: 'owner@mgw.com',
    ...payload,
    created_at: '2026-11-26T15:30:00.000Z',
    updated_at: '2026-11-26T15:30:00.000Z',
  } as SupabaseSaleRow);

  assert.equal(hasSaleCustomerDetails(mapped), false);

  const source = fromSaleRecord(mapped, {
    storeName: 'MGW Burger',
    storePhone: '(92) 99999-0000',
    storeAddress: 'Av. Djalma Batista, 100',
  });
  const doc = buildPrintableOrderDocument(source);

  assert.equal(doc.documentKind, 'quick_sale');
  assert.equal(doc.modeLabel, 'COMPROVANTE DE VENDA');
  assert.equal(doc.storeName, 'MGW Burger');
  assert.equal(doc.storePhone, '(92) 99999-0000');
  assert.equal(doc.storeAddress, 'Av. Djalma Batista, 100');
  assert.equal(doc.customerName, '');
  assert.equal(doc.customerAddress, '');
  assert.equal(doc.paymentMethod, 'Pix');
  assert.equal(doc.saleDateFormatted, '26/11/2026');
  assert.ok(doc.totalFormatted.includes('64,00'));
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].name, 'Combo 1');
  assert.equal(doc.lines[0].quantity, 2);
  assert.ok(doc.lines[0].unitPriceFormatted.includes('25,00'));
  assert.ok(doc.lines[0].lineTotalFormatted.includes('50,00'));
});

test('quick sale with full customer details and Delivery customer link round-trips through Supabase mappers and receipt', () => {
  const input = buildSaleInputFromOrder(
    SAMPLE_ITEMS,
    '2026-11-26',
    'Cartão de débito',
    'Entregar rápido',
    {
      customerId: 'cust-123',
      customerName: '  Maria Fernanda  ',
      customerAddress: ' Rua das Flores ',
      customerNumber: ' 450 ',
      customerNeighborhood: ' Centro ',
      customerComplement: ' Apto 202 ',
    },
  );

  assert.equal(input.customerId, 'cust-123');
  assert.equal(input.customerName, 'Maria Fernanda');
  assert.equal(input.customerAddress, 'Rua das Flores');
  assert.equal(input.customerNumber, '450');
  assert.equal(input.customerNeighborhood, 'Centro');
  assert.equal(input.customerComplement, 'Apto 202');

  const payload = buildSalePayloadForSupabase(input);
  assert.equal(payload.customer_id, 'cust-123');
  assert.equal(payload.customer_name, 'Maria Fernanda');
  assert.equal(payload.customer_address, 'Rua das Flores');
  assert.equal(payload.customer_number, '450');
  assert.equal(payload.customer_neighborhood, 'Centro');
  assert.equal(payload.customer_complement, 'Apto 202');

  const recovered = mapSaleRow({
    id: 'sale-with-cust',
    tenant_id: 'tenant-1',
    owner_email: 'owner@mgw.com',
    ...payload,
    created_at: '2026-11-26T18:10:00.000Z',
    updated_at: '2026-11-26T18:10:00.000Z',
  } as SupabaseSaleRow);

  assert.equal(recovered.customerId, 'cust-123');
  assert.equal(recovered.customerName, 'Maria Fernanda');
  assert.equal(
    formatSaleCustomerAddressLine(recovered),
    'Rua das Flores, nº 450 · Centro · Apto 202',
  );
  assert.equal(hasSaleCustomerDetails(recovered), true);

  const doc = buildPrintableOrderDocument(
    fromSaleRecord(recovered, { storeName: 'MGW Lanches' }),
  );
  assert.equal(doc.customerName, 'Maria Fernanda');
  assert.equal(doc.customerAddress, 'Rua das Flores');
  assert.equal(doc.customerNumber, '450');
  assert.equal(doc.customerNeighborhood, 'Centro');
  assert.equal(doc.customerComplement, 'Apto 202');
  assert.equal(doc.paymentMethod, 'Cartão de débito');
  assert.equal(doc.customerNote, 'Entregar rápido');
});

test('thermal 58mm and 80mm CSS and legacy sales without items or customer columns remain compatible', () => {
  const css58 = getPrintPageCss('58mm');
  const css80 = getPrintPageCss('80mm');
  assert.ok(css58.includes('@page { size: 58mm auto;'));
  assert.ok(css58.includes('54mm'));
  assert.ok(css80.includes('@page { size: 80mm auto;'));
  assert.ok(css80.includes('74mm'));

  // Legacy row without customer columns and without items snapshot
  const legacySale = mapSaleRow({
    id: 'legacy-1',
    tenant_id: 'tenant-old',
    date: '2026-10-05',
    quantity: 3,
    unit_price: 22,
    total_amount: 66,
    payment_method: 'Dinheiro',
    note: 'Venda antiga',
    created_at: '2026-10-05T19:00:00.000Z',
    updated_at: '2026-10-05T19:00:00.000Z',
  });

  assert.equal(legacySale.customerId, null);
  assert.equal(legacySale.customerName, '');
  assert.equal(hasSaleCustomerDetails(legacySale), false);

  const legacyDoc = buildPrintableOrderDocument(
    fromSaleRecord(legacySale, { storeName: 'MGW Lanches' }),
  );
  assert.equal(legacyDoc.lines.length, 1);
  assert.equal(legacyDoc.lines[0].quantity, 3);
  assert.ok(legacyDoc.lines[0].unitPriceFormatted.includes('22,00'));
  assert.ok(legacyDoc.totalFormatted.includes('66,00'));
  assert.equal(legacyDoc.saleDateFormatted, '05/10/2026');
});

test('duplicate sale detection blocks identical rapid retries but allows consecutive sales to different customers', () => {
  const now = 1_795_000_000_000;
  const firstInput = buildSaleInputFromOrder(
    SAMPLE_ITEMS,
    '2026-11-26',
    'Pix',
    '',
    { customerName: 'João' },
  );
  const existing: SaleRecord[] = [
    {
      id: 's1',
      ownerId: 'owner1',
      ...firstInput,
      totalAmount: 64,
      createdAtMs: now - 3000,
      updatedAtMs: now - 3000,
    },
  ];

  // Identical retry within 15s is blocked
  assert.equal(isLikelyDuplicateSale(existing, firstInput, now), true);

  // Different customer buying the same combo within 15s is allowed
  const secondCustomerInput = buildSaleInputFromOrder(
    SAMPLE_ITEMS,
    '2026-11-26',
    'Pix',
    '',
    { customerName: 'Ana' },
  );
  assert.equal(isLikelyDuplicateSale(existing, secondCustomerInput, now), false);
});

test('SalesView renders customer name and reprint action in history without altering existing controls', () => {
  const saleWithCustomer: SaleRecord = {
    id: 'sale-hist-1',
    ownerId: 'owner1',
    date: '2026-11-26',
    quantity: 2,
    unitPrice: 25,
    totalAmount: 50,
    paymentMethod: 'Pix',
    note: 'Sem cebola',
    customerName: 'Carlos Eduardo',
    customerAddress: 'Rua A',
    customerNumber: '12',
    customerNeighborhood: 'Parque 10',
    customerComplement: 'Casa B',
    createdAtMs: 1_795_000_000_000,
    updatedAtMs: 1_795_000_000_000,
  };

  const html = renderToStaticMarkup(
    createElement(SalesView, {
      sales: [saleWithCustomer],
      establishmentName: 'MGW Burger',
      onOpenNewSale: () => {},
      onEditSale: () => {},
      onDeleteSale: async () => {},
    }),
  );

  assert.match(html, /Cliente: Carlos Eduardo/);
  assert.match(html, /Imprimir nota da venda/);
});

test('Supabase migration 20261126000000_sales_customer_details enforces non-destructive columns and tenant isolation', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261126000000_sales_customer_details.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public\.delivery_customers\(id\) ON DELETE SET NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT ''/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS customer_address text NOT NULL DEFAULT ''/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS customer_number text NOT NULL DEFAULT ''/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS customer_neighborhood text NOT NULL DEFAULT ''/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS customer_complement text NOT NULL DEFAULT ''/);
  assert.match(sql, /validate_sale_customer_tenant/);
  assert.match(sql, /dc\.tenant_id = NEW\.tenant_id/);
  assert.doesNotMatch(sql, /\bDROP TABLE\b|\bDELETE FROM\b|\bTRUNCATE\b/i);
});
