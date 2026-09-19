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
 * Refunds an APPROVED payment. Payment.cancel (used by the platform helper in
 * lib/mercado-pago.ts) only works for payments that are not yet approved.
 *
 * Only an omitted amount means a full refund. A zero, negative or non-finite
 * amount is rejected: it must never fall through to refunding the whole payment
 * from the restaurant's account.
 */
export async function refundConnectPayment(client: MercadoPagoConfig, mpPaymentId: string, amount?: number) {
  const refunds = new PaymentRefund(client);
  if (amount === undefined) {
    return refunds.total({ payment_id: mpPaymentId });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor de reembolso inválido');
  }
  return refunds.create({ payment_id: mpPaymentId, body: { amount } });
}

export function isUnauthorizedError(error: unknown): boolean {
  const e = error as any;
  return e?.status === 401 || e?.statusCode === 401;
}
