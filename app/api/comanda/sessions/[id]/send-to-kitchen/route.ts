// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { idempotent } from '@/lib/api/idempotency';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { sendSessionToKitchen } from '@/lib/kds/send-session';
import { resolveMergedSession } from '@/lib/comanda/transfer';

export const dynamic = 'force-dynamic';

/** POST /api/comanda/sessions/[id]/send-to-kitchen - rules in lib/kds/send-session.ts */
async function handlePOST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    // Sending to the kitchen is never blocked by the plan: sales are counted when the bill closes
    // and going over the month only warns (lib/plans/monthly-sales.ts, owner decision 2026-10-09)
    // Queued offline on another phone for a comanda merged meanwhile: the lines are on the other one now
    return await sendSessionToKitchen(restaurantId, await resolveMergedSession(prisma, restaurantId, params.id));
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// Replayable by the offline queue: the same Idempotency-Key never runs twice (lib/api/idempotency.ts)
export const POST = idempotent(handlePOST);
