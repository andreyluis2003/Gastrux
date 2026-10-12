/**
 * Mercado Pago failed or refused a call made for this request. 424 (Failed Dependency), never 502:
 * the Easypanel proxy replaces any 502 the app sends with its own HTML error page, so the customer
 * or the owner lost the message that says what happened.
 */
export const MP_FAILED_STATUS = 424;
