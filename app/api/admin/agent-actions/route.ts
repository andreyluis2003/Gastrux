import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { clientProfiles } from '@/lib/admin/client-profile';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const STATUSES = ['DRAFT', 'SENT', 'DISCARDED', 'FAILED'] as const;
type Status = (typeof STATUSES)[number];

/**
 * GET /api/admin/agent-actions?status=DRAFT - the activation agent's approval queue (spec 2026-10-27),
 * newest first, with the account, the owner's contact and the funnel stage. Platform team only.
 */
export async function GET(req: NextRequest) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;

  const asked = new URL(req.url).searchParams.get('status') ?? 'DRAFT';
  const status: Status = (STATUSES as readonly string[]).includes(asked) ? (asked as Status) : 'DRAFT';
  const actions = await prisma.agentAction.findMany({
    where: { status, channel: { not: 'OWNER_ALERT' } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { restaurant: { select: { name: true } } },
  });
  const [owners, profiles] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(actions.map((x) => x.userId))] } }, select: { id: true, name: true, email: true, whatsapp: true } }),
    clientProfiles([...new Set(actions.map((x) => x.restaurantId))]),
  ]);
  const ownerBy = new Map(owners.map((o) => [o.id, o]));

  return NextResponse.json(
    {
      actions: actions.map(({ restaurant, ...x }) => {
        const owner = ownerBy.get(x.userId);
        return {
          ...x,
          restaurantName: restaurant.name,
          ownerName: owner?.name ?? null,
          whatsapp: owner?.whatsapp ?? null,
          email: owner?.email ?? null,
          stage: profiles.get(x.restaurantId)?.stage ?? 'SIGNED_UP',
        };
      }),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
