import { prisma } from '@/lib/prisma';
import { getMpClientForRestaurant, markNeedsReconnect } from './connection-service';
import { createConnectPix, extractPixData, isUnauthorizedError, type PixData } from './payments';
import type { ResolvedPixTarget } from './pix-target';

/** PIX expires in 30 minutes; reuse a pending one only while it is surely valid. */
const REUSE_WINDOW_MS = 25 * 60 * 1000;

export const ONLINE_PAYMENT_UNAVAILABLE = 'Este restaurante não aceita pagamento online no momento.';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Payer data typed by a customer or staff member: keep it short, fall back to safe defaults. */
export function normalizePayer(input: { payerEmail?: unknown; payerName?: unknown }): { email: string; name: string } {
  const email =
    typeof input.payerEmail === 'string' && EMAIL_RE.test(input.payerEmail) ? input.payerEmail : 'cliente@exemplo.com';
  const name =
    typeof input.payerName === 'string' && input.payerName.trim() ? input.payerName.trim().slice(0, 80) : 'Cliente';
  return { email, name };
}

export interface PixPayload extends PixData {
  paymentId: string;
  status: string;
  amount: number;
  description: string;
}

export type CreatePixResult =
  | { ok: true; pix: PixPayload }
  | { ok: false; status: number; error: string; code?: string };

function parseMetadata(raw: string | null): Record<string, any> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// There is no generic rate limiter in this codebase; reusing the pending
// payment for the same target and amount stops repeated clicks (or abuse)
// from creating unbounded Mercado Pago payments.
async function findReusablePending(target: ResolvedPixTarget) {
  // A manual (staff-typed) PIX has no order or tab to match against: always create a new one.
  if (!target.orderId && !target.sessionId) return null;

  const scope = target.orderId
    ? { orderId: target.orderId }
    : { metadata: { contains: `"sessionId":"${target.sessionId}"` } };

  return prisma.payment.findFirst({
    where: {
      restaurantId: target.restaurantId,
      gateway: 'MERCADO_PAGO_CONNECT',
      status: 'PENDING',
      amount: target.amount,
      gatewayPaymentId: { not: null },
      createdAt: { gte: new Date(Date.now() - REUSE_WINDOW_MS) },
      ...scope,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createPixForTarget(
  target: ResolvedPixTarget,
  payer: { email: string; name?: string }
): Promise<CreatePixResult> {
  const client = await getMpClientForRestaurant(target.restaurantId);
  if (!client) {
    return { ok: false, status: 409, code: 'ONLINE_PAYMENT_UNAVAILABLE', error: ONLINE_PAYMENT_UNAVAILABLE };
  }

  const reusable = await findReusablePending(target);
  const stored = reusable ? parseMetadata(reusable.metadata).pix : null;
  if (reusable && stored?.qrCode) {
    return {
      ok: true,
      pix: {
        paymentId: reusable.id,
        status: 'pending',
        qrCode: stored.qrCode,
        qrCodeBase64: stored.qrCodeBase64 ?? '',
        ticketUrl: stored.ticketUrl ?? '',
        expirationDate: stored.expirationDate ?? null,
        amount: target.amount,
        description: target.description,
      },
    };
  }

  const payment = await prisma.payment.create({
    data: {
      restaurantId: target.restaurantId,
      orderId: target.orderId,
      amount: target.amount,
      currency: 'BRL',
      method: 'PIX',
      gateway: 'MERCADO_PAGO_CONNECT',
      status: 'PENDING',
      description: target.description,
      customerEmail: payer.email,
      customerName: payer.name,
      metadata: JSON.stringify(target.metadata),
    },
  });

  try {
    const mpPayment = await createConnectPix(client, {
      paymentId: payment.id,
      restaurantId: target.restaurantId,
      amount: target.amount,
      description: target.description,
      payer,
    });
    const pix = extractPixData(mpPayment);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayPaymentId: String(mpPayment.id),
        metadata: JSON.stringify({ ...target.metadata, pix }),
      },
    });

    return {
      ok: true,
      pix: { paymentId: payment.id, status: 'pending', ...pix, amount: target.amount, description: target.description },
    };
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } }).catch(() => {});

    if (isUnauthorizedError(error)) {
      await markNeedsReconnect(target.restaurantId, 'Mercado Pago rejeitou o token (401)');
      return { ok: false, status: 409, code: 'ONLINE_PAYMENT_UNAVAILABLE', error: ONLINE_PAYMENT_UNAVAILABLE };
    }

    console.error('[mp-connect] PIX creation failed:', error);
    return { ok: false, status: 502, error: 'Não foi possível gerar o PIX. Tente novamente.' };
  }
}
