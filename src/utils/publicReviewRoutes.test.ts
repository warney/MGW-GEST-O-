import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthShellRoute, parsePublicUrlRoute } from './publicRoutes.ts';

test('public review invitation route is isolated from the management auth shell', () => {
  const token = 'a'.repeat(64);
  assert.deepEqual(parsePublicUrlRoute(`/cardapio/avaliar/${token}`), {
    kind: 'review',
    token,
  });
  assert.equal(isAuthShellRoute({ kind: 'review', token }), false);
});

test('invalid review token remains on the public route and is validated by the invitation service', () => {
  assert.deepEqual(parsePublicUrlRoute('/cardapio/avaliar/not-a-token'), {
    kind: 'review',
    token: 'not-a-token',
  });
});
