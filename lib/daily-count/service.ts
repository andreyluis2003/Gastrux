import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MANAGER_ROLES, recordAudit, type RestaurantMember, type RestaurantRole } from '@/lib/auth/restaurant-role';
import { buildRows, entryTotals, lossReason, parseQuantity, DailyCountError, type CountRow, type EntryKind } from './compute';
import { soldByRecipe } from './sold';

type Db = PrismaClient | Prisma.TransactionClient;

export const ENTRY_ROLES: RestaurantRole[] = ['OWNER', 'MANAGER', 'ADMIN', 'CASHIER', 'COOK'];
export const UNDO_MS = 2 * 60 * 1000;
const TOO_LONG_MS = 20 * 60 * 60 * 1000;
const KINDS: EntryKind[] = ['OPENING', 'MOUNTED', 'LOSS'];

/** The open night of the restaurant, created on first use (one OPEN per restaurant, partial unique index) */
export async function openNight(db: Db, restaurantId: string): Promise<{ id: string; openedAt: Date }> {
  const select = { id: true, openedAt: true } as const;
  const found = await db.dailyCount.findFirst({ where: { restaurantId, status: 'OPEN' }, select });
  if (found) return found;
  try {
    return await db.dailyCount.create({ data: { restaurantId }, select });
  } catch (e) {
    // Two first taps at once: the other one created it
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await db.dailyCount.findFirst({ where: { restaurantId, status: 'OPEN' }, select });
      if (again) return again;
    }
    throw e;
  }
}

/** Items of a night: active recipes marked for the count, plus any recipe with an entry in this night */
export async function nightItems(db: Db, restaurantId: string, countId: string): Promise<{ recipeId: string; name: string }[]> {
  const withEntries = await db.dailyCountEntry.findMany({ where: { countId, restaurantId }, select: { recipeId: true }, distinct: ['recipeId'] });
  const recipes = await db.recipe.findMany({
    where: { restaurantId, OR: [{ dailyCount: true, active: true }, { id: { in: withEntries.map((e) => e.recipeId) } }] },
    select: { id: true, name: true },
  });
  return recipes.map((r) => ({ recipeId: r.id, name: r.name }));
}

export async function nightRows(db: Db, restaurantId: string, night: { id: string; openedAt: Date }, to: Date): Promise<CountRow[]> {
  const items = await nightItems(db, restaurantId, night.id);
  const entries = await db.dailyCountEntry.findMany({ where: { countId: night.id, restaurantId }, select: { recipeId: true, kind: true, quantity: true } });
  const sold = await soldByRecipe(db, restaurantId, items.map((i) => i.recipeId), night.openedAt, to);
  return buildRows(items, entryTotals(entries as any), sold);
}

async function titleFor(restaurantId: string): Promise<string> {
  // Restaurant has ownerId but no owner relation in the schema
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { ownerId: true } });
  const owner = r ? await prisma.user.findUnique({ where: { id: r.ownerId }, select: { businessType: true } }) : null;
  return owner?.businessType === 'espetaria' ? 'Contagem de espetos' : 'Contagem do dia';
}

/** Once a night was closed, an opening is the leftover the close carried: it can never be entered again, so never undone (review I3) */
const canDelete = (member: RestaurantMember, e: { userId: string; createdAt: Date; kind: string }, now: Date, openingLocked: boolean) =>
  !(e.kind === 'OPENING' && openingLocked) &&
  (MANAGER_ROLES.includes(member.role) || (e.userId === member.userId && now.getTime() - e.createdAt.getTime() <= UNDO_MS));

export async function loadBoard(member: RestaurantMember, now = new Date()) {
  const { restaurantId } = member;
  const night = await openNight(prisma, restaurantId);
  const [rows, entries, closedBefore, title, openings] = await Promise.all([
    nightRows(prisma, restaurantId, night, now),
    prisma.dailyCountEntry.findMany({ where: { countId: night.id, restaurantId }, orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { name: true } } } }),
    prisma.dailyCount.count({ where: { restaurantId, status: 'CLOSED' } }),
    titleFor(restaurantId),
    prisma.dailyCountEntry.count({ where: { countId: night.id, restaurantId, kind: 'OPENING' } }),
  ]);
  return {
    countId: night.id,
    openedAt: night.openedAt.toISOString(),
    title,
    firstUse: closedBefore === 0,
    /** The opening was already entered in this night (review I2: the first-use banner goes away) */
    hasOpening: openings > 0,
    openTooLong: now.getTime() - night.openedAt.getTime() > TOO_LONG_MS,
    canClose: MANAGER_ROLES.includes(member.role),
    rows,
    entries: entries.map((e) => ({
      id: e.id, recipeId: e.recipeId, kind: e.kind as EntryKind, quantity: e.quantity, reason: e.reason,
      userName: e.user?.name ?? null, createdAt: e.createdAt.toISOString(), canDelete: canDelete(member, e, now, closedBefore > 0),
    })),
  };
}

export async function addEntry(member: RestaurantMember, body: { recipeId?: unknown; kind?: unknown; quantity?: unknown; reason?: unknown; note?: unknown }) {
  const { restaurantId } = member;
  if (typeof body.kind !== 'string' || !KINDS.includes(body.kind as EntryKind)) throw new DailyCountError('Tipo de lançamento inválido');
  const kind = body.kind as EntryKind;
  const quantity = parseQuantity(body.quantity);
  const reason = kind === 'LOSS' ? lossReason(body.reason, body.note) : null;
  if (typeof body.recipeId !== 'string') throw new DailyCountError('Item não encontrado', 404);
  const recipe = await prisma.recipe.findFirst({ where: { id: body.recipeId, restaurantId }, select: { id: true } });
  if (!recipe) throw new DailyCountError('Item não encontrado', 404);
  if (kind === 'OPENING' && (await prisma.dailyCount.count({ where: { restaurantId, status: 'CLOSED' } })) > 0) {
    throw new DailyCountError('O início da noite vem da contagem do fechamento anterior', 409);
  }
  return prisma.$transaction(async (tx) => {
    const night = await openNight(tx, restaurantId);
    // Wait for a close in progress: the tap then lands in the new night (lib/daily-count/close.ts)
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS "status" FROM "daily_counts" WHERE "id" = ${night.id} FOR UPDATE`;
    const target = locked[0]?.status === 'OPEN' ? night : await openNight(tx, restaurantId);
    if (kind === 'OPENING') {
      // The first night just closed while this waited: the new night's opening is the counted leftover
      if (target.id !== night.id) throw new DailyCountError('O início da noite vem da contagem do fechamento anterior', 409);
      // Once per item and night: a second device or a retry would double it (review I2)
      if (await tx.dailyCountEntry.count({ where: { countId: target.id, restaurantId, recipeId: recipe.id, kind: 'OPENING' } })) {
        throw new DailyCountError('O início deste item já foi lançado', 409);
      }
    }
    const entry = await tx.dailyCountEntry.create({
      data: { countId: target.id, restaurantId, recipeId: recipe.id, kind, quantity, reason, userId: member.userId },
      select: { id: true, countId: true },
    });
    return entry;
  }, { timeout: 20_000, maxWait: 10_000 });
}

export async function deleteEntry(member: RestaurantMember, entryId: string, now = new Date()) {
  const entry = await prisma.dailyCountEntry.findFirst({
    where: { id: entryId, restaurantId: member.restaurantId },
    include: { count: { select: { status: true } } },
  });
  if (!entry) throw new DailyCountError('Lançamento não encontrado', 404);
  if (entry.count.status !== 'OPEN') throw new DailyCountError('Esta contagem já foi fechada', 409);
  const openingLocked = entry.kind === 'OPENING' && (await prisma.dailyCount.count({ where: { restaurantId: member.restaurantId, status: 'CLOSED' } })) > 0;
  if (openingLocked) throw new DailyCountError('A sobra da noite anterior não pode ser apagada', 409);
  if (!canDelete(member, entry, now, false)) throw new DailyCountError('Só o gerente apaga este lançamento', 403);
  await prisma.dailyCountEntry.delete({ where: { id: entry.id } });
  if (entry.userId !== member.userId || now.getTime() - entry.createdAt.getTime() > UNDO_MS) {
    await recordAudit(member, { action: 'DELETE', entityType: 'DailyCountEntry', entityId: entry.id, changes: { kind: entry.kind, quantity: entry.quantity, recipeId: entry.recipeId, by: entry.userId } });
  }
  return { ok: true as const };
}
