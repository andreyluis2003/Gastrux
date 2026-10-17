import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkTierLimit } from '@/lib/tier-guard';
import { ASSIGNABLE_ROLES } from '@/lib/staff/create-member';
import type { RestaurantMember } from '@/lib/auth/restaurant-role';
import { PAPEL_ROLE, type MenuPayload, type Papel, type StaffPayload, type TablesPayload } from './validate';

export type DraftKind = 'MENU' | 'TABLES' | 'STAFF';
export const DRAFT_DAYS = 7;
export const TOOL_KIND: Record<string, DraftKind> = { propor_cardapio: 'MENU', propor_mesas: 'TABLES', propor_equipe: 'STAFF' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function draftSummary(kind: DraftKind, p: unknown): string {
  if (kind === 'MENU') {
    const m = p as MenuPayload;
    const items = m.categorias.reduce((t, c) => t + c.itens.length, 0);
    return `Cardápio: ${plural(m.categorias.length, 'categoria', 'categorias')}, ${plural(items, 'item', 'itens')}`;
  }
  if (kind === 'TABLES') { const t = p as TablesPayload; return `Mesas ${t.inicio} a ${t.inicio + t.quantidade - 1}, ${t.area}, ${t.lugares} lugares`; }
  return `Equipe: ${plural((p as StaffPayload).pessoas.length, 'pessoa', 'pessoas')}`;
}

/** A proposal of the AI: nothing reaches the restaurant until the owner confirms (spec 2026-10-17 ia-implantacao §4.3) */
export async function createDraft(member: RestaurantMember, kind: DraftKind, payload: unknown, questionId?: string) {
  const d = await prisma.aiDraft.create({
    data: {
      restaurantId: member.restaurantId, createdById: member.userId, questionId: questionId ?? null, kind, payload: payload as object,
      expiresAt: new Date(Date.now() + DRAFT_DAYS * 86_400_000),
    },
    select: { id: true },
  });
  return { id: d.id, resumo: draftSummary(kind, payload) };
}

type Db = Prisma.TransactionClient | typeof prisma;
export type DraftState = 'PENDING' | 'APPLIED' | 'DISCARDED' | 'EXPIRED';
export const normName = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
export const stateOf = (d: { status: string; expiresAt: Date }, now = new Date()): DraftState =>
  d.status === 'PENDING' && d.expiresAt.getTime() < now.getTime() ? 'EXPIRED' : (d.status as DraftState);

/**
 * The sign-up example menu: items linked to a DEMO- recipe, or made in the same seed (lib/onboarding/seed-template.ts
 * writes recipes, items and the drinks' fichas simples in one transaction). Anchored on the seed, not on the account
 * age: an owner importing the menu minutes after sign-up must never lose those items (final review 2026-10-17).
 */
export async function exampleMenuItemIds(db: Db, restaurantId: string): Promise<string[]> {
  const seed = await db.recipe.aggregate({ where: { restaurantId, code: { startsWith: 'DEMO-' } }, _max: { createdAt: true } });
  if (!seed._max.createdAt) return [];
  const until = new Date(seed._max.createdAt.getTime() + 60_000);
  const rows = await db.menuItem.findMany({
    where: { restaurantId, active: true, OR: [{ createdAt: { lte: until } }, { recipe: { code: { startsWith: 'DEMO-' } } }] },
    select: { id: true },
  });
  return rows.map((i) => i.id);
}

/** The sign-up's example tables (lib/onboarding/seed-template.ts) */
export const EXAMPLE_TABLE = 'Mesa de exemplo';

/** The area the owner means: same name ignoring case and spaces at the ends ("salão" is "Salão") */
export const findSection = (db: Db, restaurantId: string, area: string) =>
  db.tableSection.findFirst({ where: { restaurantId, name: { equals: area.trim(), mode: 'insensitive' } }, select: { id: true } });

/**
 * Tables there are, per area, the example ones apart: the AI places new tables after them instead of asking the
 * owner (homolog 2026-10-17: it made 'Salão' 1-8 next to the seeded 'Salão principal' 1-2)
 */
export async function existingTables(db: Db, restaurantId: string) {
  const rows = await db.table.findMany({
    where: { restaurantId }, orderBy: [{ section: { name: 'asc' } }, { number: 'asc' }],
    select: { number: true, description: true, section: { select: { name: true } } },
  });
  const byArea = new Map<string, { area: string; numeros: number[]; exemplo: number[] }>();
  for (const t of rows) {
    const a = byArea.get(t.section.name) ?? { area: t.section.name, numeros: [], exemplo: [] };
    a.numeros.push(t.number);
    if (t.description === EXAMPLE_TABLE) a.exemplo.push(t.number);
    byArea.set(t.section.name, a);
  }
  return [...byArea.values()];
}

/** Draft + marks for the review screen (spec 2026-10-17 ia-implantacao §4.4); null = not found or another restaurant */
export async function loadDraft(member: RestaurantMember, id: string, now = new Date()) {
  const draft = await prisma.aiDraft.findFirst({ where: { id, restaurantId: member.restaurantId } });
  if (!draft) return null;
  const rid = member.restaurantId;
  let marks: Record<string, unknown> = {};
  if (draft.kind === 'MENU') {
    const names = new Set((await prisma.menuItem.findMany({ where: { restaurantId: rid, active: true }, select: { name: true } })).map((i) => normName(i.name)));
    const p = draft.payload as unknown as MenuPayload;
    const exampleIds = await exampleMenuItemIds(prisma, rid);
    const exampleSet = new Set((await prisma.menuItem.findMany({ where: { id: { in: exampleIds } }, select: { name: true } })).map((i) => normName(i.name)));
    const existingNames = p.categorias.flatMap((c) => c.itens.map((i) => i.nome)).filter((n) => names.has(normName(n)));
    marks = {
      existingNames,
      // Duplicates only of the example: they are created after all when the owner removes the example
      exampleNames: existingNames.filter((n) => exampleSet.has(normName(n))),
      hasExample: exampleIds.length > 0,
    };
  } else if (draft.kind === 'TABLES') {
    const p = draft.payload as unknown as TablesPayload;
    const section = await findSection(prisma, rid, p.area);
    const inRange = (n: number) => n >= p.inicio && n < p.inicio + p.quantidade;
    const here = section ? await prisma.table.findMany({ where: { restaurantId: rid, sectionId: section.id }, select: { number: true, description: true } }) : [];
    marks = {
      existingNumbers: here.filter((t) => inRange(t.number)).map((t) => t.number).sort((a, b) => a - b),
      exampleNumbers: here.filter((t) => inRange(t.number) && t.description === EXAMPLE_TABLE).map((t) => t.number).sort((a, b) => a - b),
      exampleTables: await prisma.table.count({ where: { restaurantId: rid, description: EXAMPLE_TABLE } }),
    };
  } else {
    const p = draft.payload as unknown as StaffPayload;
    const emails = p.pessoas.map((x) => x.email).filter(Boolean);
    const elsewhere = emails.length
      ? await prisma.staffMember.findMany({ where: { user: { email: { in: emails } }, NOT: { restaurantId: rid } }, select: { user: { select: { email: true } } } })
      : [];
    const t = await checkTierLimit(rid, 'users');
    const roles = ASSIGNABLE_ROLES[member.role] ?? [];
    marks = {
      emailsElsewhere: elsewhere.map((e) => e.user.email),
      usersLimit: { allowed: t.limit === null || t.current + p.pessoas.length <= t.limit, current: t.current, limit: t.limit },
      assignable: (Object.keys(PAPEL_ROLE) as Papel[]).filter((k) => roles.includes(PAPEL_ROLE[k])),
    };
  }
  return {
    draft: { id: draft.id, kind: draft.kind, payload: draft.payload, createdAt: draft.createdAt, expiresAt: draft.expiresAt, result: draft.result },
    state: stateOf(draft, now), marks,
  };
}

export async function discardDraft(member: RestaurantMember, id: string) {
  const d = await prisma.aiDraft.findFirst({ where: { id, restaurantId: member.restaurantId } });
  if (!d) return { status: 404, body: { error: 'Rascunho não encontrado' } };
  if (stateOf(d) !== 'PENDING') return { status: 409, body: { error: 'Este rascunho não está mais pendente.', result: d.result } };
  await prisma.aiDraft.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'DISCARDED' } });
  return { status: 200, body: { ok: true } };
}
