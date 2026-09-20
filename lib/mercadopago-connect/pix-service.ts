import { prisma } from '@/lib/prisma';
import { getMpClientForRestaurant, markNeedsReconnect } from './connection-service';
import { createConnectPix, extractPixData, isUnauthorizedError, type PixData } from './payments';
import type { ResolvedPixTarget } from './pix-target';

/** PIX expires in 30 minutes; reuse a pending one only while it is surely valid. */
const REUSE_WINDOW_MS = 25 * 60 * 1000;

/**
 * A PENDING row that still has no stored PIX data means another request is
 * creating the QR right now. After this long we assume that request died
 * (process restart, timeout) and let a new one be created.
 */
const IN_PROGRESS_TIMEOUT_MS = 2 * 60 * 1000;

export const ONLINE_PAYMENT_UNAVAILABLE = 'Este restaurante não aceita pagamento online no momento.';
export const PIX_IN_PROGRESS = 'PIX em geração. Tente novamente em instantes.';

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

/**
 * `code` tells the caller how to react:
 *  - `ONLINE_PAYMENT_UNAVAILABLE` (409): the restaurant has no usable Mercado
 *    Pago connection. Hide the PIX option; retrying will not help.
 *  - `PIX_IN_PROGRESS` (409): another request is creating the QR for the very
 *    same order or tab. RETRYABLE in a few seconds; a second live charge is
 *    deliberately not created (ruling R19).
 */
export type PixErrorCode = 'ONLINE_PAYMENT_UNAVAILABLE' | 'PIX_IN_PROGRESS';

export type CreatePixResult =
  | { ok: true; pix: PixPayload }
  | { ok: false; status: number; error: string; code?: PixErrorCode };

function parseMetadata(raw: string | null): Record<string, any> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * The lock key that serializes every PIX request for the same target. A manual
 * (staff-typed) PIX has no order and no tab, so there is nothing to serialize
 * against and it always creates a new charge.
 */
function lockKeyFor(target: ResolvedPixTarget): string | null {
  if (target.orderId) return `pix:${target.restaurantId}:order:${target.orderId}`;
  if (target.sessionId) return `pix:${target.restaurantId}:session:${target.sessionId}`;
  return null;
}

function scopeFor(target: ResolvedPixTarget) {
  return target.orderId
    ? { orderId: target.orderId }
    : { metadata: { contains: `"sessionId":"${target.sessionId}"` } };
}

function newPaymentData(target: ResolvedPixTarget, payer: { email: string; name?: string }) {
  return {
    restaurantId: target.restaurantId,
    orderId: target.orderId,
    amount: target.amount,
    currency: 'BRL',
    method: 'PIX' as const,
    gateway: 'MERCADO_PAGO_CONNECT' as const,
    status: 'PENDING' as const,
    description: target.description,
    customerEmail: payer.email,
    customerName: payer.name,
    metadata: JSON.stringify(target.metadata),
  };
}

type PixClaim =
  | { kind: 'reuse'; payment: any; pix: PixData }
  | { kind: 'in-progress' }
  | { kind: 'created'; payment: any };

export function isDefiniteRejection(error: unknown): boolean {
  const e = error as any;
  const status = Number(e?.status ?? e?.statusCode);
  return Number.isInteger(status) && status >= 400 && status < 500;
}

/**
 * Find-or-create the PENDING Payment row for this target, serialized per
 * target with a Postgres advisory lock (ruling R19).
 *
 * Without the lock two near-simultaneous requests (a double tap) both missed
 * the reuse window - it only matched rows that already had a gatewayPaymentId,
 * which is written AFTER the Mercado Pago call - and both created a live QR
 * for the same order or tab, so the customer could pay twice. The lock is
 * transaction-scoped, so it is released on commit; the Mercado Pago call
 * itself happens OUTSIDE the transaction.
 */
async function claimPixPayment(
  target: ResolvedPixTarget,
  payer: { email: string; name?: string }
): Promise<PixClaim> {
  const key = lockKeyFor(target);
  if (!key) {
    return { kind: 'created', payment: await prisma.payment.create({ data: newPaymentData(target, payer) }) };
  }

  return prisma.$transaction(async (tx) => {
    // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void, which
    // Prisma cannot deserialize as a query result.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

    // Matches rows WITH OR WITHOUT gatewayPaymentId: a row that is still being
    // created must block a second charge, not be invisible to it.
    const existing = await tx.payment.findFirst({
      where: {
        restaurantId: target.restaurantId,
        gateway: 'MERCADO_PAGO_CONNECT',
        status: 'PENDING',
        amount: target.amount,
        createdAt: { gte: new Date(Date.now() - REUSE_WINDOW_MS) },
        ...scopeFor(target),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const stored = parseMetadata(existing.metadata).pix;
      if (stored?.qrCode) {
        return { kind: 'reuse' as const, payment: existing, pix: stored as PixData };
      }
      if (Date.now() - new Date(existing.createdAt).getTime() < IN_PROGRESS_TIMEOUT_MS) {
        return { kind: 'in-progress' as const };
      }
      // Older than the in-progress window: the other request never finished.
    }

    return { kind: 'created' as const, payment: await tx.payment.create({ data: newPaymentData(target, payer) }) };
  }, {
    // Waiters queue on the advisory lock; Prisma's default 5 s interactive
    // timeout would turn a busy table into a 500 instead of a retryable 409.
    maxWait: 10_000,
    timeout: 10_000,
  });
}

function storePixData(paymentId: string, target: ResolvedPixTarget, mpPaymentId: string, pix: PixData) {
  return prisma.payment.update({
    where: { id: paymentId },
    data: {
      gatewayPaymentId: mpPaymentId,
      metadata: JSON.stringify({ ...target.metadata, pix }),
    },
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

  const claim = await claimPixPayment(target, payer);

  if (claim.kind === 'in-progress') {
    return { ok: false, status: 409, code: 'PIX_IN_PROGRESS', error: PIX_IN_PROGRESS };
  }

  if (claim.kind === 'reuse') {
    return {
      ok: true,
      pix: {
        paymentId: claim.payment.id,
        status: 'pending',
        qrCode: claim.pix.qrCode,
        qrCodeBase64: claim.pix.qrCodeBase64 ?? '',
        ticketUrl: claim.pix.ticketUrl ?? '',
        expirationDate: claim.pix.expirationDate ?? null,
        amount: target.amount,
        description: target.description,
      },
    };
  }

  const payment = claim.payment;

  let mpPayment: any;
  try {
    mpPayment = await createConnectPix(client, {
      paymentId: payment.id,
      restaurantId: target.restaurantId,
      amount: target.amount,
      description: target.description,
      payer,
    });
  } catch (error) {
    // Cancel only when Mercado Pago DEFINITELY rejected the request (a 4xx):
    // then no charge exists. A timeout, a socket error or a 5xx is ambiguous -
    // the charge may have been created server-side - and a CANCELLED row can no
    // longer transition to APPROVED, so a real payment would go unrecorded. In
    // that case the row stays PENDING and the webhook reconciles it (the sync
    // accepts a Payment whose gatewayPaymentId is still null).
    if (isDefiniteRejection(error)) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } }).catch(() => {});
    }

    if (isUnauthorizedError(error)) {
      await markNeedsReconnect(target.restaurantId, 'Mercado Pago rejeitou o token (401)');
      return { ok: false, status: 409, code: 'ONLINE_PAYMENT_UNAVAILABLE', error: ONLINE_PAYMENT_UNAVAILABLE };
    }

    console.error('[mp-connect] PIX creation failed:', error);
    return { ok: false, status: 502, error: 'Não foi possível gerar o PIX. Tente novamente.' };
  }

  // Mercado Pago accepted: a LIVE charge now exists carrying this Payment id as
  // external_reference. The row must NEVER be cancelled from here - a cancelled
  // Payment can no longer transition to APPROVED, so a real payment would be
  // received and never recorded. Retry the local write once and return the PIX
  // either way; the webhook (and the status reconciliation, which accepts a PIX
  // whose gatewayPaymentId is still null) will finish the job.
  const pix = extractPixData(mpPayment);
  try {
    await storePixData(payment.id, target, String(mpPayment.id), pix);
  } catch (first) {
    try {
      await storePixData(payment.id, target, String(mpPayment.id), pix);
    } catch (second) {
      console.error(
        `[mp-connect] PIX created at Mercado Pago but not stored locally for payment ${payment.id}; it stays PENDING for the webhook to reconcile:`,
        second
      );
    }
  }

  return {
    ok: true,
    pix: { paymentId: payment.id, status: 'pending', ...pix, amount: target.amount, description: target.description },
  };
}
