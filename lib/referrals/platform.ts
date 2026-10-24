import { prisma } from '@/lib/prisma';
import { brtDayStart } from '@/lib/staff/commission-rules';
import { addMonths, currentMonth } from '@/lib/utility-bills/rules';

/** Plataforma Gastrux > Indicações (plan 2026-10-24 indicacao, Task 8) */
const CANCELLABLE = ['TRIAL', 'CONFIRMING', 'EARNED'] as const;

export class ReferralAdminError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}


export async function referralsForPlatform(now = new Date()) {
  const rows = await prisma.referral.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { referrer: { select: { name: true } }, referred: { select: { name: true } } },
  });
  const ym = currentMonth(now);
  const from = brtDayStart(`${ym}-01`);
  const to = brtDayStart(`${addMonths(ym, 1)}-01`);
  const earned = await prisma.referral.findMany({
    where: { status: { in: ['EARNED', 'APPLIED'] }, earnedAt: { gte: from, lt: to } },
    select: { amountCents: true },
  });
  return {
    month: { ym, earned: earned.length, estimatedCostCents: earned.reduce((s, r) => s + (r.amountCents ?? 0), 0) },
    referrals: rows.map((r) => ({
      id: r.id, status: r.status, referrerName: r.referrer.name, referredName: r.referred.name, gateway: r.gateway,
      createdAt: r.createdAt, firstChargeAt: r.firstChargeAt, earnedAt: r.earnedAt, appliedAt: r.appliedAt,
      amountCents: r.amountCents, cancelReason: r.cancelReason,
    })),
  };
}

export async function cancelReferralByStaff(staffUserId: string, id: string, reason: unknown) {
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (why.length < 3 || why.length > 200) throw new ReferralAdminError('Diga o motivo do cancelamento (de 3 a 200 letras)');
  const row = await prisma.referral.findUnique({ where: { id }, select: { id: true, status: true, referrerRestaurantId: true } });
  if (!row) throw new ReferralAdminError('Indicação não encontrada', 404);
  const moved = await prisma.referral.updateMany({ where: { id, status: { in: [...CANCELLABLE] } }, data: { status: 'CANCELLED', cancelReason: why } });
  if (!moved.count) throw new ReferralAdminError('Esta indicação já foi usada na fatura ou cancelada', 409);
  await prisma.auditLog.create({
    data: {
      userId: staffUserId, restaurantId: row.referrerRestaurantId, action: 'UPDATE', entityType: 'Referral', entityId: id,
      changes: JSON.stringify({ status: 'CANCELLED', previous: row.status, reason: why, by: 'plataforma' }),
    },
  }).catch((e) => console.error('[referral] audit failed:', e?.message ?? e));
}
