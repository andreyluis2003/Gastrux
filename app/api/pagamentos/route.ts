// @ts-nocheck
/**
 * /api/pagamentos
 *
 * GET    - List payments with advanced filter support (feeding & reconciliation)
 * POST   - Create a new payment record
 *
 * Supported GET query filters:
 *   - startDate, endDate   (ISO timestamps or YYYY-MM-DD)
 *   - gateway              (MERCADO_PAGO | STRIPE | STRIPE_CONNECT | MANUAL | all)
 *   - status               (PENDING | APPROVED | DECLINED | REFUNDED | PARTIALLY_REFUNDED | CANCELLED | CHARGEBACK | SETTLED | PROCESSING | all)
 *   - method               (CASH | CARD | PIX | MERCADO_PAGO | STRIPE | BANK_TRANSFER | OTHER | all)
 *   - settlementStatus     (pending | settled | failed | all)
 *   - minAmount, maxAmount (numbers)
 *   - search               (id, description, customerEmail, customerName, gatewayPaymentId)
 *   - orderId / reservationId / subscriptionId / transactionId / restaurantId
 *   - limit, page          (pagination; limit <= 500, default 50)
 *   - sortBy               (createdAt | amount | status | gateway) — default createdAt
 *   - sortOrder            (asc | desc) — default desc
 *   - withSummary=1        (returns aggregated totals alongside the page)
 *
 * @swagger
 * /api/pagamentos:
 *   get:
 *     tags: [Pagamentos]
 *     summary: Lista pagamentos com filtros avançados para conciliação
 *     security: [{ sessionAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: gateway
 *         schema: { type: string, enum: [MERCADO_PAGO, STRIPE, STRIPE_CONNECT, MANUAL, all] }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: method
 *         schema: { type: string }
 *       - in: query
 *         name: minAmount
 *         schema: { type: number }
 *       - in: query
 *         name: maxAmount
 *         schema: { type: number }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, maximum: 500, default: 50 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: withSummary
 *         schema: { type: string, enum: ['0', '1'] }
 *     responses:
 *       200:
 *         description: Lista paginada de pagamentos + summary (opcional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const VALID_GATEWAYS = ['MERCADO_PAGO', 'STRIPE', 'STRIPE_CONNECT', 'MANUAL'] as const;
const VALID_STATUSES = [
  'PENDING',
  'PROCESSING',
  'APPROVED',
  'DECLINED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'CANCELLED',
  'CHARGEBACK',
  'SETTLED',
] as const;
const VALID_METHODS = [
  'CASH',
  'CARD',
  'PIX',
  'MERCADO_PAGO',
  'STRIPE',
  'BANK_TRANSFER',
  'OTHER',
] as const;
const VALID_SORT_FIELDS = ['createdAt', 'amount', 'status', 'gateway', 'processedAt'] as const;

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

function parseNumber(value: string | null): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!isFinite(n)) return undefined;
  return n;
}

function toSafeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return isFinite(n) ? n : 0;
  }
  // Prisma Decimal / BigInt
  // @ts-ignore
  if (typeof value?.toNumber === 'function') {
    // @ts-ignore
    const n = value.toNumber();
    return isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Serialize Prisma Payment rows to JSON-safe objects (Decimal -> number).
 */
function serializePayment(p: any) {
  return {
    ...p,
    amount: toSafeNumber(p.amount),
    amountRefunded: toSafeNumber(p.amountRefunded),
    platformFee: p.platformFee != null ? toSafeNumber(p.platformFee) : null,
    gatewayFee: p.gatewayFee != null ? toSafeNumber(p.gatewayFee) : null,
    netAmount: p.netAmount != null ? toSafeNumber(p.netAmount) : null,
  };
}

// =============================================================
// GET /api/pagamentos
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const q = url.searchParams;

    // --- Parsing ---
    const startDate = parseDate(q.get('startDate'));
    const endDate = parseDate(q.get('endDate'));
    const gateway = q.get('gateway') || 'all';
    const status = q.get('status') || 'all';
    const method = q.get('method') || 'all';
    const settlementStatus = q.get('settlementStatus') || 'all';
    const minAmount = parseNumber(q.get('minAmount'));
    const maxAmount = parseNumber(q.get('maxAmount'));
    const search = (q.get('search') || '').trim();
    const orderId = q.get('orderId') || undefined;
    const reservationId = q.get('reservationId') || undefined;
    const subscriptionId = q.get('subscriptionId') || undefined;
    const transactionId = q.get('transactionId') || undefined;
    const restaurantId = q.get('restaurantId') || undefined;
    const withSummary = q.get('withSummary') === '1' || q.get('withSummary') === 'true';

    const page = Math.max(1, parseNumber(q.get('page')) || 1);
    const limit = Math.min(500, Math.max(1, parseNumber(q.get('limit')) || 50));
    const skip = (page - 1) * limit;

    const sortByRaw = q.get('sortBy') || 'createdAt';
    const sortBy = (VALID_SORT_FIELDS as readonly string[]).includes(sortByRaw)
      ? sortByRaw
      : 'createdAt';
    const sortOrder = q.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    // --- Build Prisma where clause ---
    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) {
        // If only YYYY-MM-DD, include the full day
        const end = new Date(endDate);
        if ((q.get('endDate') || '').length === 10) {
          end.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    if (gateway !== 'all' && VALID_GATEWAYS.includes(gateway as any)) {
      where.gateway = gateway;
    }
    if (status !== 'all' && VALID_STATUSES.includes(status as any)) {
      where.status = status;
    }
    if (method !== 'all' && VALID_METHODS.includes(method as any)) {
      where.method = method;
    }
    if (settlementStatus !== 'all') {
      where.settlementStatus = settlementStatus;
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};
      if (minAmount !== undefined) where.amount.gte = minAmount;
      if (maxAmount !== undefined) where.amount.lte = maxAmount;
    }

    if (orderId) where.orderId = orderId;
    if (reservationId) where.reservationId = reservationId;
    if (subscriptionId) where.subscriptionId = subscriptionId;
    if (transactionId) where.transactionId = transactionId;
    if (restaurantId) where.restaurantId = restaurantId;

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { gatewayPaymentId: { contains: search, mode: 'insensitive' } },
      ];
    }

    // --- Fetch data (paginated) ---
    const [rawPayments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          mercadoPagoData: true,
          stripeData: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    const payments = rawPayments.map(serializePayment);

    // --- Build response ---
    const response: any = {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + payments.length < total,
        hasPrev: page > 1,
      },
      filters: {
        startDate: q.get('startDate') || null,
        endDate: q.get('endDate') || null,
        gateway,
        status,
        method,
        settlementStatus,
        minAmount: minAmount ?? null,
        maxAmount: maxAmount ?? null,
        search: search || null,
        sortBy,
        sortOrder,
      },
    };

    // --- Optional aggregated summary for reconciliation dashboards ---
    if (withSummary) {
      // Aggregate across ALL matching rows (not just page)
      const aggregate = await prisma.payment.aggregate({
        where,
        _sum: {
          amount: true,
          amountRefunded: true,
          platformFee: true,
          gatewayFee: true,
          netAmount: true,
        },
        _count: { _all: true },
      });

      // Per-gateway and per-status breakdown
      const [byGateway, byStatus] = await Promise.all([
        prisma.payment.groupBy({
          by: ['gateway'],
          where,
          _sum: { amount: true, netAmount: true, platformFee: true, gatewayFee: true },
          _count: { _all: true },
        }),
        prisma.payment.groupBy({
          by: ['status'],
          where,
          _sum: { amount: true, netAmount: true },
          _count: { _all: true },
        }),
      ]);

      response.summary = {
        totalCount: aggregate._count?._all ?? 0,
        totalAmount: toSafeNumber(aggregate._sum?.amount),
        totalRefunded: toSafeNumber(aggregate._sum?.amountRefunded),
        totalPlatformFee: toSafeNumber(aggregate._sum?.platformFee),
        totalGatewayFee: toSafeNumber(aggregate._sum?.gatewayFee),
        totalNetAmount: toSafeNumber(aggregate._sum?.netAmount),
        byGateway: byGateway.map((row) => ({
          gateway: row.gateway,
          count: row._count?._all ?? 0,
          amount: toSafeNumber(row._sum?.amount),
          netAmount: toSafeNumber(row._sum?.netAmount),
          platformFee: toSafeNumber(row._sum?.platformFee),
          gatewayFee: toSafeNumber(row._sum?.gatewayFee),
        })),
        byStatus: byStatus.map((row) => ({
          status: row.status,
          count: row._count?._all ?? 0,
          amount: toSafeNumber(row._sum?.amount),
          netAmount: toSafeNumber(row._sum?.netAmount),
        })),
      };
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('[GET /api/pagamentos] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error?.message },
      { status: 500 }
    );
  }
}

// =============================================================
// POST /api/pagamentos
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      orderId,
      reservationId,
      subscriptionId,
      transactionId,
      restaurantId,
      amount,
      method,
      gateway,
      currency,
      customerEmail,
      customerName,
      customerPhone,
      customerDocument,
      description,
      metadata,
    } = body || {};

    if (amount === undefined || amount === null || !method) {
      return NextResponse.json(
        { error: 'Missing required fields: amount, method' },
        { status: 400 }
      );
    }

    const parsedAmount = Number(amount);
    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    if (!VALID_METHODS.includes(method)) {
      return NextResponse.json(
        { error: `Invalid method. Allowed: ${VALID_METHODS.join(', ')}` },
        { status: 400 }
      );
    }

    if (gateway && !VALID_GATEWAYS.includes(gateway)) {
      return NextResponse.json(
        { error: `Invalid gateway. Allowed: ${VALID_GATEWAYS.join(', ')}` },
        { status: 400 }
      );
    }

    const payment = await prisma.payment.create({
      data: {
        orderId: orderId || null,
        reservationId: reservationId || null,
        subscriptionId: subscriptionId || null,
        transactionId: transactionId || null,
        restaurantId: restaurantId || null,
        amount: parsedAmount,
        method,
        gateway: gateway || 'MANUAL',
        currency: currency || 'BRL',
        customerEmail: customerEmail || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        customerDocument: customerDocument || null,
        description: description || null,
        metadata: metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null,
      },
      include: {
        mercadoPagoData: true,
        stripeData: true,
      },
    });

    return NextResponse.json(serializePayment(payment), { status: 201 });
  } catch (error: any) {
    console.error('[POST /api/pagamentos] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error?.message },
      { status: 500 }
    );
  }
}
