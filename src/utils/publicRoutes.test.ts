import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasAuthCallbackParams,
  isAuthShellRoute,
  parsePublicUrlRoute,
} from './publicRoutes.ts';

test('parsePublicUrlRoute maps landing, auth, legal, admin, menu, and tracking routes', () => {
  assert.deepEqual(parsePublicUrlRoute('/'), { kind: 'landing' });
  assert.deepEqual(parsePublicUrlRoute('/mgw-gestao'), { kind: 'institutional', page: 'gestao' });
  assert.deepEqual(parsePublicUrlRoute('/cardapio-digital'), { kind: 'institutional', page: 'cardapio' });
  assert.deepEqual(parsePublicUrlRoute('/recursos'), { kind: 'institutional', page: 'recursos' });
  assert.deepEqual(parsePublicUrlRoute('/planos'), { kind: 'institutional', page: 'planos' });
  assert.deepEqual(parsePublicUrlRoute('/parceiros'), { kind: 'institutional', page: 'parceiros' });
  assert.deepEqual(parsePublicUrlRoute('/contato'), { kind: 'institutional', page: 'contato' });
  assert.deepEqual(parsePublicUrlRoute('/login'), { kind: 'login' });
  assert.deepEqual(parsePublicUrlRoute('/login/'), { kind: 'login' });
  assert.deepEqual(parsePublicUrlRoute('/cadastro'), { kind: 'register' });
  assert.deepEqual(parsePublicUrlRoute('/parceiros'), { kind: 'partnerLogin' });
  assert.deepEqual(parsePublicUrlRoute('/parceiros/login'), { kind: 'partnerLogin' });
  assert.deepEqual(parsePublicUrlRoute('/parceiros/cadastro'), { kind: 'partnerRegister' });
  assert.deepEqual(parsePublicUrlRoute('/parceiros/painel'), { kind: 'partnerPortal' });
  assert.deepEqual(parsePublicUrlRoute('/termos'), { kind: 'terms' });
  assert.deepEqual(parsePublicUrlRoute('/termos-de-uso'), { kind: 'terms' });
  assert.deepEqual(parsePublicUrlRoute('/privacidade'), { kind: 'privacy' });
  assert.deepEqual(parsePublicUrlRoute('/politica-de-privacidade'), {
    kind: 'privacy',
  });
  assert.deepEqual(parsePublicUrlRoute('/painel'), { kind: 'admin' });
  assert.deepEqual(parsePublicUrlRoute('/cardapio', 'mgw_lanches'), {
    kind: 'menu',
    slug: 'mgw_lanches',
  });
  assert.deepEqual(parsePublicUrlRoute('/cardapio/xburger'), {
    kind: 'menu',
    slug: 'xburger',
  });
  assert.deepEqual(parsePublicUrlRoute('/cardapio/avaliar/' + 'a'.repeat(64)), {
    kind: 'review',
    token: 'a'.repeat(64),
  });
  assert.deepEqual(parsePublicUrlRoute('/cardapio/pedido/tok-123'), {
    kind: 'tracking',
    token: 'tok-123',
  });
  assert.deepEqual(parsePublicUrlRoute('/pedido/tok-456'), {
    kind: 'tracking',
    token: 'tok-456',
  });
});

test('isAuthShellRoute identifies routes connected to Supabase auth session', () => {
  assert.equal(isAuthShellRoute({ kind: 'landing' }), true);
  assert.equal(isAuthShellRoute({ kind: 'institutional', page: 'gestao' }), true);
  assert.equal(isAuthShellRoute({ kind: 'login' }), true);
  assert.equal(isAuthShellRoute({ kind: 'register' }), true);
  assert.equal(isAuthShellRoute({ kind: 'admin' }), true);
  assert.equal(isAuthShellRoute({ kind: 'partnerLogin' }), true);
  assert.equal(isAuthShellRoute({ kind: 'partnerRegister' }), true);
  assert.equal(isAuthShellRoute({ kind: 'partnerPortal' }), true);
  assert.equal(isAuthShellRoute({ kind: 'terms' }), false);
  assert.equal(isAuthShellRoute({ kind: 'privacy' }), false);
  assert.equal(isAuthShellRoute({ kind: 'menu', slug: 'loja' }), false);
  assert.equal(isAuthShellRoute({ kind: 'tracking', token: 'abc' }), false);
  assert.equal(isAuthShellRoute({ kind: 'review', token: 'abc' }), false);
});

test('hasAuthCallbackParams detects OAuth and password recovery return parameters', () => {
  assert.equal(hasAuthCallbackParams('', ''), false);
  assert.equal(hasAuthCallbackParams('?demo=1', ''), false);
  assert.equal(hasAuthCallbackParams('?code=abc-123', ''), true);
  assert.equal(
    hasAuthCallbackParams('', '#access_token=xyz&type=bearer'),
    true,
  );
  assert.equal(hasAuthCallbackParams('', '#type=recovery'), true);
});
