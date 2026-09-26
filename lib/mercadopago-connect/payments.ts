import { MercadoPagoConfig, Payment, PaymentRefund } from 'mercadopago';

/**
 * Mercado Pago calls made with a RESTAURANT's own client (built by
 * getMpClientForRestaurant). Nothing here reads the platform token.
 * No `marketplace_fee` is sent: the platform charges no fee for now.
 */

export interface CreateConnectPixInput {
  /** Our Payment.id: used as external_reference and as idempotency key. */
  paymentId: string;
  restaurantId: string;
  amount: number;
  description: string;
  payer: { email: string; name?: string };
  expiresInMinutes?: number;
}

export interface PixData {
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expirationDate: string | null;
}

/** Mercado Pago wants an offset date; Brazil has no DST, so -03:00 is fixed. */
export function toMpDate(date: Date): string {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().replace('Z', '-03:00');
}

export function notificationUrlFor(restaurantId: string): string {
  const base = (process.env.NEXTAUTH_URL || '').replace(/\/+$/, '');
  return `${base}/api/pagamentos/mp/webhook?rid=${encodeURIComponent(restaurantId)}`;
}

export async function createConnectPix(client: MercadoPagoConfig, input: CreateConnectPixInput) {
  const [firstName, ...rest] = (input.payer.name || 'Cliente').trim().split(/\s+/);
  const expiresAt = new Date(Date.now() + (input.expiresInMinutes ?? 30) * 60_000);

  return new Payment(client).create({
    body: {
      transaction_amount: input.amount,
      description: input.description,
      payment_method_id: 'pix',
      payer: {
        email: input.payer.email,
        first_name: firstName,
        last_name: rest.join(' ') || undefined,
      },
      external_reference: input.paymentId,
      notification_url: notificationUrlFor(input.restaurantId),
      date_of_expiration: toMpDate(expiresAt),
    },
    requestOptions: { idempotencyKey: input.paymentId },
  });
}

export function extractPixData(mpPayment: any): PixData {
  const data = mpPayment?.point_of_interaction?.transaction_data;
  return {
    qrCode: data?.qr_code ?? '',
    qrCodeBase64: data?.qr_code_base64 ?? '',
    ticketUrl: data?.ticket_url ?? '',
    expirationDate: mpPayment?.date_of_expiration ?? null,
  };
}

export function getConnectPayment(client: MercadoPagoConfig, mpPaymentId: string) {
  return new Payment(client).get({ id: mpPaymentId });
}

/**
 * Every Mercado Pago payment attempt that carries our Payment.id as its
 * external_reference (a card checkout can hold a rejected attempt and a later
 * approved one). Used by the sweep for payments whose id we never recorded.
 */
export async function searchConnectPaymentsByReference(client: MercadoPagoConfig, paymentId: string) {
  const res = await new Payment(client).search({
    options: { external_reference: paymentId, sort: 'date_created', criteria: 'asc', limit: 20 },
  });
  return (res?.results ?? []) as any[];
}

/**
 * Refunds an APPROVED payment. Payment.cancel (used by the platform helper in
 * lib/mercado-pago.ts) only works for payments that are not yet approved.
 *
 * Only an omitted amount means a full refund. A zero, negative or non-finite
 * amount is rejected: it must never fall through to refunding the whole payment
 * from the restaurant's account.
 *
 * `idempotencyKey` is optional (so existing callers keep working) but every
 * caller should pass one, derived from the payment and the amounts involved:
 * without it two clicks - or a client retry after a timeout - issue TWO refunds
 * from the restaurant's account.
 */
export async function refundConnectPayment(
  client: MercadoPagoConfig,
  mpPaymentId: string,
  amount?: number,
  idempotencyKey?: string
) {
  const refunds = new PaymentRefund(client);
  const options = idempotencyKey ? { requestOptions: { idempotencyKey } } : {};

  if (amount === undefined) {
    return refunds.total({ payment_id: mpPaymentId, ...options });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor de reembolso inválido');
  }
  return refunds.create({ payment_id: mpPaymentId, body: { amount }, ...options });
}

/**
 * Cancels a Mercado Pago payment that is still pending / in process (for example the PIX QR of an
 * order that was cancelled), so the customer can no longer pay it. Mercado Pago refuses this once the
 * payment is approved: that case is a refund, not a cancellation.
 */
export function cancelConnectPayment(client: MercadoPagoConfig, mpPaymentId: string) {
  return new Payment(client).cancel({ id: mpPaymentId });
}

export function isUnauthorizedError(error: unknown): boolean {
  const e = error as any;
  return e?.status === 401 || e?.statusCode === 401;
}
