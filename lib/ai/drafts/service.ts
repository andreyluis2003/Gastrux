import { prisma } from '@/lib/prisma';
import type { RestaurantMember } from '@/lib/auth/restaurant-role';
import type { MenuPayload, StaffPayload, TablesPayload } from './validate';

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
