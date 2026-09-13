// FASE 50: Generate/regenerate QR code token for a table
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

function generateToken(): string {
  // 16 bytes -> 32 char hex token (sufficient entropy, URL-safe)
  return randomBytes(16).toString('hex');
}

// POST /api/admin/tables/[id]/qrcode - Generate or regenerate QR token
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if ((session.user as any)?.role === 'COOK') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 400 });
    }

    const { enforceFeature } = await import('@/lib/api/tier-middleware');
    const tierBlock = await enforceFeature(restaurantId, 'qrMenu');
    if (tierBlock) return tierBlock;

    // Scoped by restaurantId - without this, any authenticated user could
    // regenerate/hijack another restaurant's table QR token by guessing an id.
    const table = await prisma.table.findFirst({ where: { id: params.id, restaurantId } });
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Generate unique token with collision protection
    let token = generateToken();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.table.findUnique({ where: { qrToken: token } });
      if (!existing) break;
      token = generateToken();
      attempts++;
    }

    const updated = await prisma.table.update({
      where: { id: params.id },
      data: { qrToken: token },
    });

    return NextResponse.json({ success: true, qrToken: updated.qrToken });
  } catch (error) {
    console.error('Error generating QR token:', error);
    return NextResponse.json({ error: 'Failed to generate QR token' }, { status: 500 });
  }
}
