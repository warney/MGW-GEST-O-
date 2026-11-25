import test from 'node:test';
import assert from 'node:assert/strict';
import { isPaymentActionDisabled, shouldPollBillingReturn } from './subscriptionPaymentState';

test('only polls checkout confirmation after explicit Mercado Pago return', () => {
  assert.equal(shouldPollBillingReturn(''), false);
  assert.equal(shouldPollBillingReturn('?tab=billing'), false);
  assert.equal(shouldPollBillingReturn('?billing=pending'), false);
  assert.equal(shouldPollBillingReturn('?billing=return'), true);
});

test('payment actions stay available during background checks', () => {
  assert.equal(isPaymentActionDisabled(false, false), false);
  assert.equal(isPaymentActionDisabled(true, false), true);
  assert.equal(isPaymentActionDisabled(false, true), true);
});
