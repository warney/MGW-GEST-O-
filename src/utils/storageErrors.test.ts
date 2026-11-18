import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyStorageHttpProbe,
  formatStorageErrorMessage,
  formatSupabaseEdgeErrorMessage,
} from './storageErrors.ts';

test('formatStorageErrorMessage maps storage error codes clearly', () => {
  assert.match(
    formatStorageErrorMessage({ code: 'storage/unauthorized', message: 'Forbidden' }),
    /storage\/unauthorized/,
  );
  assert.match(
    formatStorageErrorMessage({ code: 'storage/bucket-not-found', message: 'Not Found' }),
    /mgw-cardapios|storage\/bucket-not-found/,
  );
  assert.match(
    formatStorageErrorMessage({ code: 'storage/project-not-found', message: 'No project' }),
    /storage\/project-not-found/,
  );
  assert.match(
    formatStorageErrorMessage({ code: 'storage/retry-limit-exceeded', message: 'Timeout' }),
    /storage\/retry-limit-exceeded/,
  );
  assert.match(
    formatStorageErrorMessage({ code: 'storage/unknown', message: 'Unknown' }),
    /storage\/unknown/,
  );
  assert.match(
    formatStorageErrorMessage({ code: 'storage/canceled', message: 'Canceled' }),
    /cancelado/i,
  );
  assert.match(
    formatStorageErrorMessage(new TypeError('Failed to fetch')),
    /Falha de rede/i,
  );
});

test('formatSupabaseEdgeErrorMessage maps Edge Function & signed upload HTTP statuses', () => {
  assert.match(
    formatSupabaseEdgeErrorMessage(401, 'token_expired'),
    /401|expirada/i,
  );
  assert.match(
    formatSupabaseEdgeErrorMessage(403, 'tenant_mismatch'),
    /403|Acesso negado/i,
  );
  assert.match(
    formatSupabaseEdgeErrorMessage(404, 'not_found', 'Function not found'),
    /menu-storage|mgw-cardapios/i,
  );
  assert.match(
    formatSupabaseEdgeErrorMessage(413, 'file_too_large'),
    /2 MB/i,
  );
  assert.match(
    formatSupabaseEdgeErrorMessage(500, 'internal', 'Falha interna'),
    /Falha interna/,
  );
});

test('classifyStorageHttpProbe distinguishes 404 unprovisioned bucket from 403 unauthorized', () => {
  assert.equal(
    classifyStorageHttpProbe(404, '{"error":{"code":404,"message":"Not Found."}}'),
    'bucket_not_found',
  );
  assert.equal(classifyStorageHttpProbe(403, ''), 'unauthorized');
  assert.equal(classifyStorageHttpProbe(401, ''), 'unauthorized');
  assert.equal(classifyStorageHttpProbe(200, '{}'), 'ok');
});

test('formatStorageErrorMessage uses probeHint when SDK wraps bucket 404 into retry-limit-exceeded', () => {
  const msg = formatStorageErrorMessage(
    { code: 'storage/retry-limit-exceeded', message: 'Max retry time exceeded' },
    'bucket_not_found',
  );
  assert.match(msg, /mgw-cardapios|não encontrado/i);
});
