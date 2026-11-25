import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatUserDisplayName,
  getUserInitials,
  resolveActiveShellNavId,
  resolveShellPageTitle,
} from './shellProfile.ts';

test('formatUserDisplayName converts email local-part into readable display name', () => {
  assert.equal(formatUserDisplayName('warney.fernandes22@gmail.com'), 'Warney Fernandes');
  assert.equal(formatUserDisplayName('maria_silva-gestao@empresa.com.br'), 'Maria Silva');
  assert.equal(formatUserDisplayName(''), 'Usuário MGW');
  assert.equal(formatUserDisplayName(null), 'Usuário MGW');
});

test('getUserInitials extracts up to two uppercase initials safely', () => {
  assert.equal(getUserInitials('Warney Fernandes', 'warney@mgw.com'), 'WF');
  assert.equal(getUserInitials('Lanchonete', 'loja@mgw.com'), 'LA');
  assert.equal(getUserInitials('', 'ab@mgw.com'), 'AB');
  assert.equal(getUserInitials('', ''), 'MG');
});

test('resolveShellPageTitle and resolveActiveShellNavId differentiate Produtos and Configurações', () => {
  assert.equal(resolveShellPageTitle('dashboard', 'shop'), 'Dashboard');
  assert.equal(resolveShellPageTitle('orders', 'shop'), 'Pedidos');
  assert.equal(resolveShellPageTitle('delivery', 'shop'), 'MGW Delivery');
  assert.equal(resolveShellPageTitle('delivery_dispatch', 'shop'), 'Central de Despacho · MGW Delivery');
  assert.equal(resolveShellPageTitle('delivery_customers', 'shop'), 'Clientes · MGW Delivery');
  assert.equal(resolveShellPageTitle('delivery_couriers', 'shop'), 'Entregadores · MGW Delivery');
  assert.equal(resolveShellPageTitle('delivery_regions', 'shop'), 'Regiões e Taxas · MGW Delivery');
  assert.equal(resolveShellPageTitle('settings', 'catalog'), 'Produtos e Combos');
  assert.equal(resolveShellPageTitle('settings', 'shop'), 'Configurações');
  assert.equal(resolveShellPageTitle('settings', 'digital_menu'), 'Cardápio Digital');

  assert.equal(resolveActiveShellNavId('delivery', 'shop'), 'delivery');
  assert.equal(resolveActiveShellNavId('delivery_dispatch', 'shop'), 'delivery_dispatch');
  assert.equal(resolveActiveShellNavId('delivery_customers', 'shop'), 'delivery_customers');
  assert.equal(resolveActiveShellNavId('delivery_couriers', 'shop'), 'delivery_couriers');
  assert.equal(resolveActiveShellNavId('delivery_regions', 'shop'), 'delivery_regions');
  assert.equal(resolveActiveShellNavId('settings', 'catalog'), 'products');
  assert.equal(resolveActiveShellNavId('settings', 'shop'), 'settings');
  assert.equal(resolveActiveShellNavId('dashboard', 'catalog'), 'dashboard');
});
