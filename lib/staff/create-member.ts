import crypto from 'crypto';
import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { checkTierLimit } from '@/lib/tier-guard';

/** Which roles each role may give (market practice: nobody self-promotes, a manager hires below manager). */
export const ASSIGNABLE_ROLES: Record<string, string[]> = {
  OWNER: ['MANAGER', 'CASHIER', 'COOK'],
  MANAGER: ['CASHIER', 'COOK'],
};

export interface NewStaffInput {
  name: string;
  email: string;
  staffRole?: string;
  phone?: string | null;
  cpf?: string | null;
  baseSalary?: number | null;
  commissionType?: string | null;
  commissionValue?: number | null;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
}

export type NewStaffResult =
  | { ok: true; staffMember: any; temporaryPassword: string | null }
  | { ok: false; status: 400 | 403 | 409; error: string; allowed?: string[]; tierLimit?: boolean };

/**
 * Hires a person into THIS restaurant (the Equipe screen and the AI onboarding drafts, spec 2026-10-17
 * ia-implantacao §4.5). A new user gets a RANDOM temporary password, returned once to whoever hired them
 * and never stored anywhere else.
 */
export async function createStaffMember(member: RestaurantMember, input: NewStaffInput): Promise<NewStaffResult> {
  const restaurantId = member.restaurantId;
  const { name, phone, cpf, baseSalary, commissionType, commissionValue, defaultStartTime, defaultEndTime } = input;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const staffRole = (input.staffRole || 'COOK') as UserRole;

  if (!name || !email) {
    return { ok: false, status: 400, error: 'Nome e email são obrigatórios' };
  }

  // Nobody becomes OWNER or a platform ADMIN through this route; a manager hires below manager
  if (!ASSIGNABLE_ROLES[member.role]?.includes(staffRole)) {
    return { ok: false, status: 403, error: 'Você não pode atribuir este papel', allowed: ASSIGNABLE_ROLES[member.role] ?? [] };
  }

  // Check/create user. A new user gets a RANDOM temporary password, shown once to whoever hired
  // them (every staff user used to get the fixed password "temp123")
  let staffUser = await prisma.user.findUnique({ where: { email } });
  let temporaryPassword: string | null = null;

  // A person can only be a StaffMember at one restaurant at a time (userId is
  // globally unique on StaffMember). If this email already belongs to staff
  // at a different restaurant, refuse instead of silently overwriting their
  // role/salary/commission there.
  const existingMember = staffUser
    ? await prisma.staffMember.findUnique({ where: { userId: staffUser.id }, select: { restaurantId: true } })
    : null;
  if (existingMember && existingMember.restaurantId !== restaurantId) {
    return { ok: false, status: 409, error: 'Este email já está cadastrado como funcionário em outro restaurante' };
  }

  if (staffUser) {
    // Someone already here with a role the caller may not give (a manager, the owner) cannot be
    // re-assigned by them: a manager must not demote another manager through this route
    const currentMembership = await prisma.restaurantUser.findUnique({
      where: { restaurantId_userId: { restaurantId, userId: staffUser.id } },
      select: { role: true },
    });
    const ownsRestaurant = await prisma.restaurant.findFirst({ where: { id: restaurantId, ownerId: staffUser.id }, select: { id: true } });
    if (ownsRestaurant || (currentMembership && !ASSIGNABLE_ROLES[member.role].includes(currentMembership.role))) {
      return { ok: false, status: 403, error: 'Você não pode alterar o papel desta pessoa' };
    }
  }

  // Only a genuinely new hire counts against the plan's user limit - editing
  // an existing staff member's info must never be blocked by it.
  if (!existingMember) {
    const tier = await checkTierLimit(restaurantId, 'users');
    if (!tier.allowed) return { ok: false, status: 403, error: 'Limite de usuários do plano atingido', tierLimit: true };
  }

  if (!staffUser) {
    const bcrypt = await import('bcryptjs');
    temporaryPassword = crypto.randomBytes(9).toString('base64url');
    staffUser = await prisma.user.create({
      data: {
        email, name, password: await bcrypt.hash(temporaryPassword, 10),
        // The hire changes it at the first access (middleware.ts)
        mustChangePassword: true,
        role: staffRole, active: true, currentRestaurantId: restaurantId,
      },
    });
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
  } as any);

  await recordAudit(member, {
    action: 'CREATE',
    entityType: 'StaffMember',
    entityId: staffMember.id,
    changes: { email, role: staffRole, newUser: temporaryPassword !== null },
  });

  return { ok: true, staffMember, temporaryPassword };
}
