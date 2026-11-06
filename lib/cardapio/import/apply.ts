import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { ensureMenuItemRecipes, retireProductRecipe } from '@/lib/cardapio/product-recipe';
import { exampleMenuItemIds, normName } from '@/lib/ai/drafts/service';
import { MAX_ITEMS } from './parse';

/**
 * Writes the reviewed import (spec 2026-11-06 importar-cardapio-por-link §8-§14). What the screen sends is
 * validated again here: names, prices, https photos, the price change and the "é do meu restaurante" box.
 */
export interface ImportPayload {
  categorias: { nome: string; itens: { nome: string; descricao: string; preco: number; foto: string | null; codigo: string | null }[] }[];
  adicionais: { grupo: string; nome: string; preco: number }[];
  ajustePct: number;
  removeExample: boolean;
}
type V = { ok: true; value: ImportPayload } | { ok: false; error: string };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const money = (v: unknown, min: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= 99999 ? Math.round(v * 100) / 100 : null);
const https = (v: unknown) => {
  if (typeof v !== 'string' || !v || v.length > 1000) return null;
  try {
    return new URL(v).protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
};

/** A price changed by pct %, rounded to the cent, never under R$ 0,01 */
export const adjustPrice = (preco: number, pct: number) => Math.max(0.01, Math.round(preco * (1 + pct / 100) * 100) / 100);

export function validateImport(raw: any): V {
  if (raw?.confirmaDono !== true) return { ok: false, error: 'Confirme que este cardápio é do seu restaurante.' };
  const ajustePct = raw?.ajustePct ?? 0;
  if (typeof ajustePct !== 'number' || !Number.isFinite(ajustePct) || ajustePct < -50 || ajustePct > 50) {
    return { ok: false, error: 'O ajuste de preço vai de -50% a +50%.' };
  }
  if (!Array.isArray(raw?.categorias)) return { ok: false, error: 'Nenhum produto marcado.' };
  const categorias: ImportPayload['categorias'] = [];
  let n = 0;
  for (const c of raw.categorias) {
    const nome = str(c?.nome, 120);
    if (!nome || !Array.isArray(c?.itens) || !c.itens.length) continue;
    const itens: ImportPayload['categorias'][number]['itens'] = [];
    for (const i of c.itens) {
      n++;
      const iname = str(i?.nome, 120);
      const preco = money(i?.preco, 0.01);
      if (!iname) return { ok: false, error: `Item ${n}: nome inválido` };
      if (preco === null) return { ok: false, error: `"${iname}": preço inválido` };
      itens.push({ nome: iname, descricao: str(i?.descricao, 500), preco, foto: https(i?.foto), codigo: str(i?.codigo, 60) || null });
    }
    categorias.push({ nome, itens });
  }
  if (n === 0) return { ok: false, error: 'Nenhum produto marcado.' };
  if (n > MAX_ITEMS) return { ok: false, error: `No máximo ${MAX_ITEMS} produtos por vez.` };
  const adicionais: ImportPayload['adicionais'] = [];
  for (const a of Array.isArray(raw?.adicionais) ? raw.adicionais.slice(0, 500) : []) {
    const grupo = str(a?.grupo, 80);
    const nome = str(a?.nome, 120);
    const preco = money(a?.preco ?? 0, 0);
    if (grupo && nome && preco !== null) adicionais.push({ grupo, nome, preco });
  }
  return { ok: true, value: { categorias, adicionais, ajustePct, removeExample: raw?.removeExample === true } };
}

export interface ImportResult { created: number; skipped: string[]; photos: number; codes: number; addons: number; removedExample: number }

export async function applyImport(member: RestaurantMember, p: ImportPayload): Promise<ImportResult> {
  const rid = member.restaurantId;
  const result = await prisma.$transaction(async (tx) => {
    // One import at a time per restaurant: a double tap must not create everything twice
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-import:' + rid}))`;
    const existing = new Set((await tx.menuItem.findMany({ where: { restaurantId: rid, active: true }, select: { name: true } })).map((i) => normName(i.name)));
    let removedExample = 0;
    if (p.removeExample) {
      const ids = await exampleMenuItemIds(tx, rid);
      const items = await tx.menuItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, recipeId: true } });
      await tx.menuItem.updateMany({ where: { id: { in: ids } }, data: { active: false } });
      for (const it of items) { existing.delete(normName(it.name)); await retireProductRecipe(tx, rid, it.recipeId); }
      await tx.recipe.updateMany({ where: { restaurantId: rid, code: { startsWith: 'DEMO-R-' } }, data: { active: false } });
      removedExample = items.length;
    }
    const usedCodes = new Set((await tx.menuItem.findMany({ where: { restaurantId: rid, code: { not: null } }, select: { code: true } })).map((i) => i.code!.toLowerCase()));
    const created: string[] = [];
    const skipped: string[] = [];
    let photos = 0;
    let codes = 0;
    for (const [ci, c] of p.categorias.entries()) {
      let cat = await tx.menuCategory.findFirst({ where: { restaurantId: rid, active: true, name: { equals: c.nome, mode: 'insensitive' } }, select: { id: true } });
      if (!cat) cat = await tx.menuCategory.create({ data: { restaurantId: rid, name: c.nome, position: 100 + ci, active: true }, select: { id: true } });
      for (const [ii, it] of c.itens.entries()) {
        const key = normName(it.nome);
        if (existing.has(key)) { skipped.push(it.nome); continue; }
        existing.add(key);
        // A code already used in this restaurant (or twice in the import) is left out: it is unique per restaurant
        const code = it.codigo && !usedCodes.has(it.codigo.toLowerCase()) ? it.codigo : null;
        if (code) { usedCodes.add(code.toLowerCase()); codes++; }
        const mi = await tx.menuItem.create({
          data: { restaurantId: rid, categoryId: cat.id, name: it.nome, description: it.descricao || null, price: adjustPrice(it.preco, p.ajustePct), position: ii, code },
          select: { id: true },
        });
        if (it.foto) {
          // No file storage yet: the photo stays at its original address (spec §6)
          await tx.menuItemImage.create({ data: { menuItemId: mi.id, imageUrl: it.foto, cloudStoragePath: '' } });
          photos++;
        }
        created.push(mi.id);
      }
    }
    await ensureMenuItemRecipes(tx, rid, created);
    let addons = 0;
    if (p.adicionais.length) {
      const have = new Set((await tx.itemModifier.findMany({ where: { restaurantId: rid, active: true }, select: { name: true, category: true } })).map((m) => `${normName(m.category ?? '')}|${normName(m.name)}`));
      for (const [ai, a] of p.adicionais.entries()) {
        const key = `${normName(a.grupo)}|${normName(a.nome)}`;
        if (have.has(key)) continue;
        have.add(key);
        await tx.itemModifier.create({ data: { restaurantId: rid, name: a.nome, category: a.grupo, priceAdjustment: a.preco, position: ai } });
        addons++;
      }
    }
    return { created: created.length, skipped, photos, codes, addons, removedExample };
  }, { timeout: 30000 });
  await recordAudit(member, { action: 'CREATE', entityType: 'MenuItem', entityId: 'import-link', changes: { menuImport: true, ...result, skipped: result.skipped.length } });
  return result;
}
