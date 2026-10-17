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

/** The sign-up example menu: items made in the first 10 minutes while DEMO- recipes exist (same rule as first-steps) */
export async function exampleMenuItemIds(db: Db, restaurantId: string): Promise<string[]> {
  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { createdAt: true } });
  if (!r || (await db.recipe.count({ where: { restaurantId, code: { startsWith: 'DEMO-' } } })) === 0) return [];
  const until = new Date(r.createdAt.getTime() + 10 * 60_000);
  const rows = await db.menuItem.findMany({
    where: { restaurantId, active: true, OR: [{ createdAt: { lte: until } }, { recipe: { code: { startsWith: 'DEMO-' } } }] },
    select: { id: true },
  });
  return rows.map((i) => i.id);
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
    marks = {
      existingNames: p.categorias.flatMap((c) => c.itens.map((i) => i.nome)).filter((n) => names.has(normName(n))),
      hasExample: (await exampleMenuItemIds(prisma, rid)).length > 0,
    };
  } else if (draft.kind === 'TABLES') {
    const p = draft.payload as unknown as TablesPayload;
    const section = await prisma.tableSection.findFirst({ where: { restaurantId: rid, name: p.area }, select: { id: true } });
    const nums = section ? (await prisma.table.findMany({ where: { restaurantId: rid, sectionId: section.id }, select: { number: true } })).map((t) => t.number) : [];
    marks = { existingNumbers: nums.filter((n) => n >= p.inicio && n < p.inicio + p.quantidade).sort((a, b) => a - b) };
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
