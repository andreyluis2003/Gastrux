import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { formatPhone, normalizePhone, type Segment } from '@/lib/cashback/rules';
import { purchaseCounts90d, segmentFor } from '@/lib/cashback/crm';

export const dynamic = 'force-dynamic';

const SEGMENTS: Segment[] = ['VIP', 'REGULAR', 'OCCASIONAL', 'INACTIVE'];

/**
 * GET ?search=&segment=&page=&limit= - Clientes (CRM). Search by name, e-mail or phone digits; the segment is
 * computed from the purchases of the last 90 days (spec 2026-10-23 §10), so the filter is applied after it.
 */
export async function GET(request: NextRequest) {
  // Owner-and-manager data: the cook and the cashier are refused (prod audit 2026-10-17)
  const gate = await requireRestaurantRole(MANAGER_ROLES);
  if (!gate.ok) return gate.response;
  const { restaurantId } = gate.member;
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') ?? '').trim();
    const segment = SEGMENTS.includes(searchParams.get('segment') as Segment) ? (searchParams.get('segment') as Segment) : null;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const digits = search.replace(/[^0-9]/g, '');
    const where: any = { restaurantId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ phoneDigits: { contains: digits } }] : []),
      ];
    }
    const counts = await purchaseCounts90d(restaurantId);
    const all = await prisma.customer.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, city: true, totalSpent: true, totalOrders: true, averageTicket: true, lastOrderAt: true, createdAt: true },
      orderBy: [{ lastOrderAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    const rows = all.map((c) => ({ ...c, segment: segmentFor(counts, c.id) })).filter((c) => !segment || c.segment === segment);
    return NextResponse.json({
      customers: rows.slice((page - 1) * limit, page * limit),
      total: rows.length,
      page,
      limit,
      totalPages: Math.ceil(rows.length / limit),
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Não foi possível carregar os clientes' }, { status: 500 });
  }
}

/** POST { name, phone?, email?, address?, city?, state?, zipCode? } - phone or e-mail, the e-mail is optional (2026-10-23) */
export async function POST(request: NextRequest) {
  const gate = await requireRestaurantRole(MANAGER_ROLES);
  if (!gate.ok) return gate.response;
  const { restaurantId } = gate.member;
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;
    const phoneDigits = body?.phone ? normalizePhone(body.phone) : null;
    if (!name || (!email && !phoneDigits)) {
      return NextResponse.json({ error: 'Informe o nome e o celular (ou o e-mail)' }, { status: 400 });
    }
    if (body?.phone && !phoneDigits) return NextResponse.json({ error: 'Celular inválido: use DDD e número' }, { status: 400 });
    if (phoneDigits && (await prisma.customer.findUnique({ where: { restaurantId_phoneDigits: { restaurantId, phoneDigits } } }))) {
      return NextResponse.json({ error: 'Já existe um cliente com este celular' }, { status: 409 });
    }
    // Customer.email is unique across restaurants: the message never says where it is taken
    if (email && (await prisma.customer.findUnique({ where: { email }, select: { id: true } }))) {
      return NextResponse.json({ error: 'Não foi possível cadastrar este e-mail' }, { status: 409 });
    }
    const customer = await prisma.customer.create({
      data: {
        restaurantId, name, email, phoneDigits, phone: phoneDigits ? formatPhone(phoneDigits) : null,
        address: body?.address || null, city: body?.city || null, state: body?.state || null, zipCode: body?.zipCode || null,
        status: 'ACTIVE',
      },
    });
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json({ error: 'Não foi possível cadastrar o cliente' }, { status: 500 });
  }
}
