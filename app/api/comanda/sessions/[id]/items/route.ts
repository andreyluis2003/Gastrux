// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { idempotent } from '@/lib/api/idempotency';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { addComandaItem, AddItemError } from '@/lib/comanda/add-item';

export const dynamic = 'force-dynamic';

// POST /api/comanda/sessions/[id]/items
// Body: { menuItemId?, recipeId?, quantity?, specialInstructions?, modifierIds? } - prices come
// from the menu and the modifier records (lib/comanda/add-item.ts)
async function handlePOST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });

    const body = await request.json();

    const orderSession = await prisma.orderSession.findFirst({
      where: { id: params.id, restaurantId },
    });

    if (!orderSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (orderSession.status === 'CLOSED' || orderSession.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Comanda fechada ou cancelada' }, { status: 409 });
    }

    const item = await addComandaItem(prisma, restaurantId, params.id, body);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof AddItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// Replayable by the offline queue: the same Idempotency-Key never runs twice (lib/api/idempotency.ts)
export const POST = idempotent(handlePOST);
