// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ customers: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const segment = searchParams.get('segment');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (segment) {
      where.segment = segment;
    }

    if (status) {
      where.status = status;
    }

    where.restaurantId = restaurantId;

    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        include: {
          loyaltyAccounts: {
            include: {
              program: true,
            },
          },
          interactions: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { lastOrderAt: 'desc' },
      }),
      prisma.customer.count({ where }),
    ]);

    return NextResponse.json({
      customers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 400 });
    }

    const body = await request.json();
    const { name, email, phone, address, city, state, zipCode } = body;

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { error: 'Nome e email são obrigatórios' },
        { status: 400 }
      );
    }

    // Check if customer already exists in this restaurant
    const existingCustomer = await prisma.customer.findFirst({
      where: { email, restaurantId },
    });

    if (existingCustomer) {
      return NextResponse.json(
        { error: 'Cliente com este email já existe' },
        { status: 409 }
      );
    }

    // Customer.email is globally unique in the schema, so a customer with
    // this email under a different restaurant would still collide here.
    const emailTakenElsewhere = await prisma.customer.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailTakenElsewhere) {
      return NextResponse.json(
        { error: 'Não foi possível cadastrar este email' },
        { status: 409 }
      );
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        restaurantId,
        status: 'ACTIVE',
        totalSpent: 0,
        totalOrders: 0,
        averageTicket: 0,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json(
      { error: 'Failed to create customer' },
      { status: 500 }
    );
  }
}
