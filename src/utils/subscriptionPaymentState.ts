/** True only when Mercado Pago explicitly redirected back to billing. */
export function shouldPollBillingReturn(search: string): boolean {
  return new URLSearchParams(search).get('billing') === 'return';
}

/** Background polling must never disable payment actions. */
export function isPaymentActionDisabled(submitting: boolean, pixSubmitting: boolean): boolean {
  return submitting || pixSubmitting;
}
