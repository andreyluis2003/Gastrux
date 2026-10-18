import { prisma } from '@/lib/prisma';
import { cacheKey, invalidate } from '@/lib/cache';
import { logAdminAction } from '@/lib/admin-helpers';
import { planAccess } from '@/lib/billing/plan-access';

/**
 * Plataforma › Clientes (spec 2026-10-18 §8): the Gastrux team extends a client's trial or marks the
 * account internal, always with a reason, recorded in the admin log and on the client's notes.
 */
const DAY_MS = 86_400_000;
export class TrialInputError extends Error {}
export const EXTENSION_NOTE_PREFIX = 'Teste estendido';

type Actor = { id: string; email: string };
type Result = { ok: true; trialEndsAt?: Date; isInternal?: boolean } | { ok: false; status: number; error: string };

/** Extending never makes a client lose days: from the current end when it is still ahead, else from now */
export function extendedTrialEnd(current: Date | null, opts: { days?: number; until?: Date }, now = new Date()): Date {
  if (opts.until) {
    // The last millisecond of the chosen day in Brasília (UTC-3): midnight BRT of the next day is 03:00 UTC
    const brDay = new Date(opts.until.getTime() - 3 * 3_600_000);
    const close = new Date(Date.UTC(brDay.getUTCFullYear(), brDay.getUTCMonth(), brDay.getUTCDate() + 1, 3, 0, 0) - 1);
    if (close.getTime() <= now.getTime()) throw new TrialInputError('A data precisa ser depois de hoje');
    return close;
  }
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + (opts.days ?? 0) * DAY_MS);
}

function reasonOf(raw: unknown): string {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < 3) throw new TrialInputError('Informe o motivo');
  return reason.slice(0, 200);
}

const brDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

async function afterChange(restaurantId: string, actor: Actor, before: object, after: object, name: string, note: string) {
  await logAdminAction({ userId: actor.id, action: 'SYSTEM_CONFIG_CHANGE', entityType: 'Restaurant', entityId: restaurantId, entityName: name, changesBefore: before, changesAfter: after });
  await prisma.platformClientNote.create({ data: { restaurantId, authorEmail: actor.email, text: note } });
  try {
    await invalidate(cacheKey('customer', 'details', restaurantId));
    await invalidate(cacheKey('platform', 'metrics', 'v1'));
  } catch (error) {
    // The change is saved; a stale client file only lasts until its cache expires
    console.error('[admin/trial] could not clear the client cache', error);
  }
}

const SELECT = { name: true, isInternal: true, subscriptionTier: true, subscriptionStatus: true, trialEndsAt: true, billingCycleEnd: true, status: true } as const;

export async function extendTrial(
  input: { restaurantId: string; days?: unknown; until?: unknown; reason?: unknown; actor: Actor },
  now = new Date(),
): Promise<Result> {
  try {
    const reason = reasonOf(input.reason);
    const r = await prisma.restaurant.findUnique({ where: { id: input.restaurantId }, select: SELECT });
    if (!r) return { ok: false, status: 404, error: 'Cliente não encontrado' };
    if (planAccess(r, now).state === 'paid') return { ok: false, status: 409, error: 'Este cliente já tem um plano pago' };
    let opts: { days?: number; until?: Date };
    if (typeof input.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.until)) {
      opts = { until: new Date(`${input.until}T00:00:00-03:00`) };
    } else if (Number.isInteger(input.days) && (input.days as number) >= 1 && (input.days as number) <= 180) {
      opts = { days: input.days as number };
    } else {
      throw new TrialInputError('Escolha de 1 a 180 dias ou uma data');
    }
    const trialEndsAt = extendedTrialEnd(r.trialEndsAt, opts, now);
    const after = { trialEndsAt, subscriptionStatus: 'trialing', subscriptionTier: 'business', status: 'TRIAL' as const };
    await prisma.restaurant.update({ where: { id: input.restaurantId }, data: after });
    await afterChange(
      input.restaurantId,
      input.actor,
      { trialEndsAt: r.trialEndsAt, subscriptionStatus: r.subscriptionStatus, subscriptionTier: r.subscriptionTier, status: r.status },
      after,
      r.name,
      `${EXTENSION_NOTE_PREFIX} até ${brDate(trialEndsAt)}: ${reason}`,
    );
    return { ok: true, trialEndsAt };
  } catch (error) {
    if (error instanceof TrialInputError) return { ok: false, status: 400, error: error.message };
    throw error;
  }
}

export async function setInternal(input: { restaurantId: string; isInternal?: unknown; reason?: unknown; actor: Actor }): Promise<Result> {
  try {
    const reason = reasonOf(input.reason);
    if (typeof input.isInternal !== 'boolean') throw new TrialInputError('Informe se a conta é interna');
    const r = await prisma.restaurant.findUnique({ where: { id: input.restaurantId }, select: SELECT });
    if (!r) return { ok: false, status: 404, error: 'Cliente não encontrado' };
    await prisma.restaurant.update({ where: { id: input.restaurantId }, data: { isInternal: input.isInternal } });
    await afterChange(
      input.restaurantId,
      input.actor,
      { isInternal: r.isInternal },
      { isInternal: input.isInternal },
      r.name,
      `Conta interna ${input.isInternal ? 'ligada' : 'desligada'}: ${reason}`,
    );
    return { ok: true, isInternal: input.isInternal };
  } catch (error) {
    if (error instanceof TrialInputError) return { ok: false, status: 400, error: error.message };
    throw error;
  }
}
