// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const state = searchParams.get('state');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const where: any = { restaurantId };
  if (state) where.state = state;

  const [conversations, stats] = await Promise.all([
    prisma.whatsAppConversation.findMany({
      where: {},
        restaurantId,
    }),
  ]);

  const totals = {
    total: conversations.length,
    byState: stats.reduce((acc: any, s: any) => {
      acc[s.state] = s._count.state;
      return acc;
    }, {}),
  };

  return NextResponse.json({ conversations, stats: totals });
}
