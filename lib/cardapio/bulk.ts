import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { syncProductRecipe } from '@/lib/cardapio/product-recipe';
import { normalizeDays } from '@/lib/cardapio/days';

/**
 * Several menu items changed at once (spec 2026-11-06 cardapio-rapido §2-§4): sold out / back on sale, a price
 * (one item, from the list), a price change in %, another category, shown on QR and site or not, weekdays.
 * Every id must be an active item of this restaurant.
 */
export type BulkAction =
  | { acao: 'esgotar' | 'voltar' }
  | { acao: 'preco'; preco: number }
  | { acao: 'ajuste'; pct: number }
  | { acao: 'categoria'; categoryId: string }
  | { acao: 'canais'; mostrar: boolean }
  | { acao: 'dias'; dias: number[] };

type Parsed = { ok: true; ids: string[]; action: BulkAction } | { ok: false; error: string };

export const MAX_BULK = 500;
const roundCents = (n: number) => Math.round(n * 100) / 100;
const priceOk = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0.01 && n <= 99999;

export function parseBulk(raw: any): Parsed {
  const ids = Array.isArray(raw?.ids) ? [...new Set(raw.ids.filter((x: unknown) => typeof x === 'string' && x.length <= 64))] as string[] : [];
  if (!ids.length) return { ok: false, error: 'Nenhum item marcado.' };
  if (ids.length > MAX_BULK) return { ok: false, error: `No máximo ${MAX_BULK} itens por vez.` };
  switch (raw?.acao) {
    case 'esgotar':
    case 'voltar':
      return { ok: true, ids, action: { acao: raw.acao } };
    case 'preco': {
      const preco = typeof raw.preco === 'string' ? Number(raw.preco.replace(',', '.')) : raw.preco;
      if (!priceOk(preco)) return { ok: false, error: 'Preço entre R$ 0,01 e R$ 99.999.' };
      if (ids.length !== 1) return { ok: false, error: 'O preço é de um item por vez.' };
      return { ok: true, ids, action: { acao: 'preco', preco: roundCents(preco) } };
    }
    case 'ajuste': {
      const pct = raw.pct;
      if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < -50 || pct > 50 || pct === 0) return { ok: false, error: 'O ajuste vai de -50% a +50%.' };
      return { ok: true, ids, action: { acao: 'ajuste', pct } };
    }
    case 'categoria':
      if (typeof raw.categoryId !== 'string' || !raw.categoryId) return { ok: false, error: 'Escolha a categoria.' };
      return { ok: true, ids, action: { acao: 'categoria', categoryId: raw.categoryId } };
    case 'canais':
      if (typeof raw.mostrar !== 'boolean') return { ok: false, error: 'Mostrar ou ocultar?' };
      return { ok: true, ids, action: { acao: 'canais', mostrar: raw.mostrar } };
    case 'dias': {
      const dias = normalizeDays(raw.dias);
      if (!dias) return { ok: false, error: 'Dias da semana inválidos.' };
      if (Array.isArray(raw.dias) && raw.dias.length === 0) return { ok: false, error: 'Escolha pelo menos um dia.' };
      return { ok: true, ids, action: { acao: 'dias', dias } };
    }
    default:
      return { ok: false, error: 'Ação desconhecida.' };
  }
}

export async function applyBulk(member: RestaurantMember, ids: string[], action: BulkAction): Promise<{ status: number; body: unknown }> {
  const rid = member.restaurantId;
  const items = await prisma.menuItem.findMany({ where: { id: { in: ids }, restaurantId: rid, active: true }, select: { id: true, price: true } });
  if (items.length !== ids.length) return { status: 404, body: { error: 'Algum item não foi encontrado neste restaurante.' } };
  const where = { id: { in: ids }, restaurantId: rid };
  let changedPrices = false;
  switch (action.acao) {
    case 'esgotar':
    case 'voltar':
      await prisma.menuItem.updateMany({ where, data: { available: action.acao === 'voltar' } });
      break;
    case 'preco':
      await prisma.menuItem.update({ where: { id: ids[0] }, data: { price: action.preco } });
      changedPrices = true;
      break;
    case 'ajuste':
      await prisma.$transaction(items.map((i) => prisma.menuItem.update({
        where: { id: i.id },
        data: { price: Math.max(0.01, roundCents(Number(i.price) * (1 + action.pct / 100))) },
      })));
      changedPrices = true;
      break;
    case 'categoria': {
      const cat = await prisma.menuCategory.findFirst({ where: { id: action.categoryId, restaurantId: rid, active: true }, select: { id: true } });
      if (!cat) return { status: 404, body: { error: 'Categoria não encontrada.' } };
      await prisma.menuItem.updateMany({ where, data: { categoryId: cat.id } });
      break;
    }
    case 'canais':
      await prisma.menuItem.updateMany({ where, data: { displayOnQR: action.mostrar, displayOnWeb: action.mostrar } });
      break;
    case 'dias':
      await prisma.menuItem.updateMany({ where, data: { availableDays: action.dias } });
      break;
  }
  // A ficha simples follows the item's price (as on the edit screen)
  if (changedPrices) for (const id of ids) await syncProductRecipe(prisma, rid, id);
  await recordAudit(member, { action: 'UPDATE', entityType: 'MenuItem', entityId: ids.length === 1 ? ids[0] : 'lote', changes: { lote: ids.length, ...action } });
  return { status: 200, body: { updated: ids.length } };
}
