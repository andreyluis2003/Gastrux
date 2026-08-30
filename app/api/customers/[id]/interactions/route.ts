// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const ownedCustomer = await prisma.customer.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!ownedCustomer) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const interactions = await prisma.customerInteraction.findMany({
      where: { customerId: params.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(interactions);
  } catch (error) {
    console.error('Error fetching interactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interactions' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, subject, notes, status, followUpDate } = body;

    // Verify customer exists and belongs to tenant
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const customer = await prisma.customer.findFirst({
      where: { id: params.id, restaurantId },
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }

    const interaction = await prisma.customerInteraction.create({
      data: {
        customerId: params.id,
        type,
        subject,
        notes,
        status: status || 'PENDING',
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        assignedToId: session.user?.id,
      },
    });

    return NextResponse.json(interaction, { status: 201 });
  } catch (error) {
    console.error('Error creating interaction:', error);
    return NextResponse.json(
      { error: 'Failed to create interaction' },
      { status: 500 }
    );
  }
}
