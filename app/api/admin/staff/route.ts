// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';

/** Which roles each role may give (market practice: nobody self-promotes, a manager hires below manager). */
const ASSIGNABLE_ROLES: Record<string, string[]> = {
  OWNER: ['MANAGER', 'CASHIER', 'COOK'],
  MANAGER: ['CASHIER', 'COOK'],
};

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

  const userId = (session.user as any).id;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  const restaurantId = u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId;
  if (!restaurantId) return NextResponse.json({ members: [] });

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
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Sem permiss\u00e3o');
  if (!auth.ok) return auth.response;
  const { member } = auth;
  const restaurantId = member.restaurantId;

  const body = await req.json();
  const { name, email, phone, cpf, baseSalary, commissionType, commissionValue, defaultStartTime, defaultEndTime } = body;
  const staffRole = body.staffRole || 'COOK';

  if (!name || !email) {
    return NextResponse.json({ error: 'Nome e email s\u00e3o obrigat\u00f3rios' }, { status: 400 });
  }

  // Nobody becomes OWNER or a platform ADMIN through this route; a manager hires below manager
  if (!ASSIGNABLE_ROLES[member.role]?.includes(staffRole)) {
    return NextResponse.json(
      { error: 'Voc\u00ea n\u00e3o pode atribuir este papel', allowed: ASSIGNABLE_ROLES[member.role] ?? [] },
      { status: 403 }
    );
  }

  // Check/create user. A new user gets a RANDOM temporary password, shown once to whoever hired
  // them (every staff user used to get the fixed password "temp123")
  let staffUser = await prisma.user.findUnique({ where: { email } });
  let temporaryPassword: string | null = null;
  if (!staffUser) {
    const bcrypt = await import('bcryptjs');
    temporaryPassword = crypto.randomBytes(9).toString('base64url');
    staffUser = await prisma.user.create({
      data: {
        email, name, password: await bcrypt.hash(temporaryPassword, 10),
        role: staffRole, active: true, currentRestaurantId: restaurantId,
      },
    });
  }

  // A person can only be a StaffMember at one restaurant at a time (userId is
  // globally unique on StaffMember). If this email already belongs to staff
  // at a different restaurant, refuse instead of silently overwriting their
  // role/salary/commission there.
  const existingMember = await prisma.staffMember.findUnique({
    where: { userId: staffUser.id },
    select: { restaurantId: true },
  });
  if (existingMember && existingMember.restaurantId !== restaurantId) {
    return NextResponse.json(
      { error: 'Este email já está cadastrado como funcionário em outro restaurante' },
      { status: 409 }
    );
  }

  // Someone already here with a role the caller may not give (a manager, the owner) cannot be
  // re-assigned by them: a manager must not demote another manager through this route
  const currentMembership = await prisma.restaurantUser.findUnique({
    where: { restaurantId_userId: { restaurantId, userId: staffUser.id } },
    select: { role: true },
  });
  const ownsRestaurant = await prisma.restaurant.findFirst({ where: { id: restaurantId, ownerId: staffUser.id }, select: { id: true } });
  if (ownsRestaurant || (currentMembership && !ASSIGNABLE_ROLES[member.role].includes(currentMembership.role))) {
    return NextResponse.json({ error: 'Você não pode alterar o papel desta pessoa' }, { status: 403 });
  }

  // Link to restaurant
  await prisma.restaurantUser.upsert({
    where: { restaurantId_userId: { restaurantId, userId: staffUser.id } },
    update: { role: staffRole, isActive: true },
    create: { restaurantId, userId: staffUser.id, role: staffRole, permissions: [], acceptedAt: new Date() },
  });

  // Create staff member
  const staffMember = await prisma.staffMember.upsert({
    where: { userId: staffUser.id },
    update: {
      phone, cpf, role: staffRole, status: 'ACTIVE',
      basesalary: baseSalary || null,
      commissionType: commissionType || 'PERCENTAGE',
      commissionValue: commissionValue || null,
      defaultStartTime: defaultStartTime || '08:00',
      defaultEndTime: defaultEndTime || '18:00',
    },
    create: {
      restaurantId, userId: staffUser.id, phone, cpf,
      role: staffRole, status: 'ACTIVE',
      basesalary: baseSalary || null,
      commissionType: commissionType || 'PERCENTAGE',
      commissionValue: commissionValue || null,
      defaultStartTime: defaultStartTime || '08:00',
      defaultEndTime: defaultEndTime || '18:00',
    },
  });

  await recordAudit(member, {
    action: 'CREATE',
    entityType: 'StaffMember',
    entityId: staffMember.id,
    changes: { email, role: staffRole, newUser: temporaryPassword !== null },
  });

  return NextResponse.json({ member: staffMember, temporaryPassword }, { status: 201 });
}
