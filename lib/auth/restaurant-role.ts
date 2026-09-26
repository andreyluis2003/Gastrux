import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { AuditAction } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

/**
 * The role that counts is the role a person has in the restaurant they are working in: the owner
 * of the restaurant, or their ACTIVE RestaurantUser membership. The session's User.role is global
 * (and frozen in the JWT until the next login): the owner of one restaurant who is a cashier in
 * another must act as a cashier there.
 */

export type RestaurantRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'COOK' | 'ADMIN';

/** Market practice: cancellations after the kitchen, bill cancellation, fiscal note cancellation,
 *  price changes, refunds and staff roles need a manager. */
export const MANAGER_ROLES: RestaurantRole[] = ['OWNER', 'MANAGER'];

export interface RestaurantMember {
  userId: string;
  restaurantId: string;
  role: RestaurantRole;
}

export async function getRestaurantMember(): Promise<RestaurantMember | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  // Already checks the membership is active (or the user owns the restaurant)
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return null;

  // The session carries the user id (lib/auth.ts); the email is only a fallback
  let userId: string | undefined = (session.user as any).id;
  if (!userId && session.user.email) {
    userId = (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id;
  }
  if (!userId) return null;

  return resolveMember(userId, restaurantId);
}

export async function resolveMember(userId: string, restaurantId: string): Promise<RestaurantMember | null> {
  const [owned, membership] = await Promise.all([
    prisma.restaurant.findFirst({ where: { id: restaurantId, ownerId: userId }, select: { id: true } }),
    prisma.restaurantUser.findFirst({
      where: { restaurantId, userId, isActive: true },
      select: { role: true },
    }),
  ]);
  if (owned) return { userId, restaurantId, role: 'OWNER' };
  if (membership) return { userId, restaurantId, role: membership.role as RestaurantRole };
  return null;
}

/**
 * Resolves the caller's membership and checks their role in this restaurant.
 * Returns the member, or the response to send (401 no session / membership, 403 role too low).
 */
export async function requireRestaurantRole(
  allowed: RestaurantRole[],
  deniedMessage = 'Esta ação exige um gerente do restaurante'
): Promise<{ ok: true; member: RestaurantMember } | { ok: false; response: NextResponse }> {
  const member = await getRestaurantMember();
  if (!member) {
    return { ok: false, response: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  }
  if (!allowed.includes(member.role)) {
    return { ok: false, response: NextResponse.json({ error: deniedMessage, requiredRoles: allowed }, { status: 403 }) };
  }
  return { ok: true, member };
}

export const isManager = (member: RestaurantMember) => MANAGER_ROLES.includes(member.role);

/** Records who did what, in this restaurant. Never throws: the action itself already happened. */
export async function recordAudit(
  member: RestaurantMember,
  entry: { action: AuditAction; entityType: string; entityId: string; changes: Record<string, unknown> }
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: member.userId,
        restaurantId: member.restaurantId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        changes: JSON.stringify({ role: member.role, ...entry.changes }),
      },
    });
  } catch (error) {
    console.error('Could not store the audit log:', error);
  }
}
