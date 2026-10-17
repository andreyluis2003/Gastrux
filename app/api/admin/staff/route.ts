// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { createStaffMember } from '@/lib/staff/create-member';

export const dynamic = 'force-dynamic';

/**
 * The team with salaries and commissions: the owner and managers of THIS restaurant only. It used to
 * answer anyone signed in (a cashier saw everybody's salary), from the raw currentRestaurantId or the
 * user's first restaurant, without checking the membership.
 */
export async function GET() {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Sem permiss\u00e3o');
  if (!auth.ok) return auth.response;
  const restaurantId = auth.member.restaurantId;

  const members = await prisma.staffMember.findMany({
    where: { restaurantId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      shifts: { where: { shiftDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, orderBy: { shiftDate: 'desc' }, take: 7 },
      commissions: { orderBy: { period: 'desc' }, take: 3 },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ members });
}

export async function POST(req: NextRequest) {
  // A manager of THIS restaurant (the role checked used to be the global session role)
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Sem permissão');
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const body = await req.json();
  // Shared with the AI onboarding drafts (lib/staff/create-member.ts)
  const r = await createStaffMember(member, { ...body, staffRole: body.staffRole });
  if (!r.ok) {
    if (r.tierLimit) {
      const { enforceResourceLimit } = await import('@/lib/api/tier-middleware');
      const tierBlock = await enforceResourceLimit(member.restaurantId, 'users');
      if (tierBlock) return tierBlock;
    }
    return NextResponse.json({ error: r.error, ...(r.allowed ? { allowed: r.allowed } : {}) }, { status: r.status });
  }
  return NextResponse.json({ member: r.staffMember, temporaryPassword: r.temporaryPassword }, { status: 201 });
}
