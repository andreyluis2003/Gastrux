import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/customers/[id]/stop-messages - the client answered SAIR on WhatsApp (activation agent,
 * spec 2026-10-27). Until the official number reads replies by itself, the team records it here: the same
 * opt-out as the "Parar as dicas" link, and the drafts still in the queue are discarded.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { response, user } = await requirePlatformAdmin();
  if (response) return response;

  const restaurant = await prisma.restaurant.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!restaurant) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

  const decidedBy = String(user.email || user.id || 'equipe');
  const [, discarded] = await prisma.$transaction([
    prisma.user.update({ where: { id: restaurant.ownerId }, data: { onboardingEmailsOptOut: true } }),
    prisma.agentAction.updateMany({ where: { restaurantId: params.id, status: 'DRAFT' }, data: { status: 'DISCARDED', decidedBy } }),
  ]);
  return NextResponse.json({ stopped: true, discarded: discarded.count });
}
