import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StoreOnboardingScreen } from '../components/StoreOnboardingScreen';

const noopComplete = async () => {};
const noopLogout = async () => {};

test('StoreOnboardingScreen renders MGW Gestão split welcome layout, orientation steps, and real form fields', () => {
  const html = renderToStaticMarkup(
    createElement(StoreOnboardingScreen, {
      accountEmail: 'lojista@mgwgestao.com.br',
      initialStoreName: 'Lanchonete Central',
      onComplete: noopComplete,
      onLogout: noopLogout,
    }),
  );

  assert.ok(html.includes('Bem-vindo ao MGW Gestão!'));
  assert.ok(html.includes('Vamos configurar seu sistema em poucos passos.'));
  assert.ok(html.includes('Informações do estabelecimento'));
  assert.ok(html.includes('Seu cardápio'));
  assert.ok(html.includes('Preferências e cardápio digital'));
  assert.ok(html.includes('lojista@mgwgestao.com.br'));
  assert.ok(html.includes('value="Lanchonete Central"'));
  assert.ok(html.includes('id="onboarding-store-name"'));
  assert.ok(html.includes('id="onboarding-owner-name"'));
  assert.ok(html.includes('Começar Agora'));
  assert.ok(html.includes('Sair'));
  assert.ok(html.includes('/assets/onboarding_owner_kitchen_1795445299150.jpg'));
  assert.ok(html.includes('bg-[#F5F6FA]'));
  assert.ok(html.includes('bg-[#F5B900]'));
});

test('StoreOnboardingScreen leaves placeholder store name empty when tenant uses generic fallback and preserves accessible contrast', () => {
  const html = renderToStaticMarkup(
    createElement(StoreOnboardingScreen, {
      accountEmail: 'novo@estabelecimento.com.br',
      initialStoreName: 'Meu Estabelecimento',
      onComplete: noopComplete,
      onLogout: noopLogout,
    }),
  );

  assert.ok(!html.includes('value="Meu Estabelecimento"'));
  assert.ok(!html.includes('#86EFAC'));
  assert.ok(!html.includes('#FCA5A5'));
  assert.ok(html.includes('text-[#15803D]'));
  assert.ok(html.includes('bg-[#ECFDF5]'));
});
