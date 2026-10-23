// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { balanceCents, customerPurchases90d } from '@/lib/cashback/service';
import { cashbackStatement as cashbackStatementOf } from '@/lib/cashback/crm';
import { formatPhone, normalizePhone, segmentOf } from '@/lib/cashback/rules';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Owner-and-manager data: the cook and the cashier are refused (prod audit 2026-10-17)
  const gate = await requireRestaurantRole(MANAGER_ROLES);
  if (!gate.ok) return gate.response;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const customer = await prisma.customer.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        interactions: {
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }

    // Cashback and segment (spec 2026-10-23 §9, §10): the old loyalty account card is gone
    const [cashbackBalanceCents, purchases90d, cashbackStatement] = await Promise.all([
      balanceCents(prisma, restaurantId, customer.id),
      customerPurchases90d(restaurantId, customer.id),
      cashbackStatementOf(restaurantId, customer.id),
    ]);
    return NextResponse.json({ ...customer, segment: segmentOf(purchases90d), purchases90d, cashbackBalanceCents, cashbackStatement });
  } catch (error) {
    console.error('Error fetching customer:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customer' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Owner-and-manager data: the cook and the cashier are refused (prod audit 2026-10-17)
  const gate = await requireRestaurantRole(MANAGER_ROLES);
  if (!gate.ok) return gate.response;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const existingCustomer = await prisma.customer.findFirst({
      where: { id: params.id, restaurantId },
    });
    if (!existingCustomer) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { name, email, address, city, state, zipCode, status } = body;
    // The phone is how the cashier finds the customer (unique in the restaurant); the segment is computed (2026-10-23)
    let phoneData = {};
    if (body.phone !== undefined) {
      const phoneDigits = body.phone ? normalizePhone(body.phone) : null;
      if (body.phone && !phoneDigits) return NextResponse.json({ error: 'Celular inválido: use DDD e número' }, { status: 400 });
      if (phoneDigits) {
        const other = await prisma.customer.findUnique({ where: { restaurantId_phoneDigits: { restaurantId, phoneDigits } }, select: { id: true } });
        if (other && other.id !== params.id) return NextResponse.json({ error: 'Já existe um cliente com este celular' }, { status: 409 });
      }
      phoneData = { phoneDigits, phone: phoneDigits ? formatPhone(phoneDigits) : null };
    }

    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: {
        name,
        email: email === '' ? null : email,
        ...phoneData,
        address,
        city,
        state,
        zipCode,
        status,
      },
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    );
  }
}
