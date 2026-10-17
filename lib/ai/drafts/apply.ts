import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { ensureMenuItemRecipes, retireProductRecipe } from '@/lib/cardapio/product-recipe';
import { ASSIGNABLE_ROLES, createStaffMember } from '@/lib/staff/create-member';
import { PAPEL_ROLE, validateMenu, validateStaff, validateTables, type MenuPayload, type TablesPayload } from './validate';
import { EXAMPLE_TABLE, exampleMenuItemIds, findSection, normName, stateOf } from './service';

type Outcome = { status: number; body: unknown };

/**
 * Confirms a draft once (spec 2026-10-17 ia-implantacao §4.5). The reviewed content is validated again:
 * nothing from the AI is trusted. Menu and tables go in one transaction (all or nothing); staff people
 * one by one, with the temporary passwords only in the response.
 */
export async function applyDraft(member: RestaurantMember, id: string, body: any): Promise<Outcome> {
  const rid = member.restaurantId;
  const found = await prisma.aiDraft.findFirst({ where: { id, restaurantId: rid } });
  if (!found) return { status: 404, body: { error: 'Rascunho não encontrado' } };
  const state = stateOf(found);
  if (state === 'EXPIRED') return { status: 410, body: { error: 'Este rascunho venceu. Peça de novo à IA.' } };
  if (state !== 'PENDING') return { status: 409, body: { error: 'Este rascunho já foi confirmado ou descartado.', result: found.result } };

  if (found.kind === 'STAFF') return applyStaff(member, id, body?.payload);

  const v = found.kind === 'MENU' ? validateMenu(body?.payload) : validateTables(body?.payload);
  if (!v.ok) return { status: 400, body: { error: v.error } };

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ai-draft:' + id}))`;
    const fresh = await tx.aiDraft.findUnique({ where: { id }, select: { status: true, result: true } });
    if (fresh?.status !== 'PENDING') return { conflict: fresh?.result ?? null };
    let result: Record<string, unknown>;
    if (found.kind === 'MENU') {
      const p = v.value as MenuPayload;
      const existing = new Set((await tx.menuItem.findMany({ where: { restaurantId: rid, active: true }, select: { name: true } })).map((i) => normName(i.name)));
      let removedExample = 0;
      if (body?.removeExample === true) {
        const ids = await exampleMenuItemIds(tx, rid);
        const items = await tx.menuItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, recipeId: true } });
        await tx.menuItem.updateMany({ where: { id: { in: ids } }, data: { active: false } });
        for (const it of items) { existing.delete(normName(it.name)); await retireProductRecipe(tx, rid, it.recipeId); }
        await tx.recipe.updateMany({ where: { restaurantId: rid, code: { startsWith: 'DEMO-R-' } }, data: { active: false } });
        removedExample = items.length;
      }
      const created: string[] = [];
      const skipped: string[] = [];
      for (const [ci, c] of p.categorias.entries()) {
        let cat = await tx.menuCategory.findFirst({ where: { restaurantId: rid, active: true, name: { equals: c.nome, mode: 'insensitive' } }, select: { id: true } });
        if (!cat) cat = await tx.menuCategory.create({ data: { restaurantId: rid, name: c.nome, position: 100 + ci, active: true }, select: { id: true } });
        for (const [ii, it] of c.itens.entries()) {
          if (existing.has(normName(it.nome))) { skipped.push(it.nome); continue; }
          existing.add(normName(it.nome));
          const mi = await tx.menuItem.create({
            data: { restaurantId: rid, categoryId: cat.id, name: it.nome, description: it.descricao || null, price: it.preco, position: ii },
            select: { id: true },
          });
          created.push(mi.id);
        }
      }
      // Sold at once like any item created on the Cardápio screen: a ficha simples each (2026-10-12)
      await ensureMenuItemRecipes(tx, rid, created);
      result = { created: created.length, skipped, removedExample };
    } else {
      const p = v.value as TablesPayload;
      let removedExample = 0;
      if (body?.removeExample === true) {
        // Only example tables never used (no bill, no booking); an area left empty goes too
        const ex = await tx.table.findMany({ where: { restaurantId: rid, description: EXAMPLE_TABLE, orderSessions: { none: {} }, reservations: { none: {} } }, select: { id: true, sectionId: true } });
        await tx.table.deleteMany({ where: { id: { in: ex.map((t) => t.id) } } });
        await tx.tableSection.deleteMany({ where: { restaurantId: rid, id: { in: [...new Set(ex.map((t) => t.sectionId))] }, tables: { none: {} } } });
        removedExample = ex.length;
      }
      let section = await findSection(tx, rid, p.area);
      if (!section) section = await tx.tableSection.create({ data: { restaurantId: rid, name: p.area.trim(), capacity: p.quantidade * p.lugares }, select: { id: true } });
      const taken = new Set((await tx.table.findMany({ where: { restaurantId: rid, sectionId: section.id }, select: { number: true } })).map((t) => t.number));
      const created: number[] = [];
      const skipped: number[] = [];
      for (let n = p.inicio; n < p.inicio + p.quantidade; n++) {
        if (taken.has(n)) { skipped.push(n); continue; }
        // A QR per table, as app/api/admin/tables does
        await tx.table.create({ data: { restaurantId: rid, sectionId: section.id, number: n, capacity: p.lugares, qrToken: randomBytes(16).toString('hex') } });
        created.push(n);
      }
      result = { created, skipped, removedExample };
    }
    await tx.aiDraft.update({ where: { id }, data: { status: 'APPLIED', appliedAt: new Date(), appliedById: member.userId, result: result as object } });
    return { result };
  }, { timeout: 30000 });

  if ('conflict' in outcome) return { status: 409, body: { error: 'Este rascunho já foi confirmado.', result: outcome.conflict } };
  await recordAudit(member, { action: 'CREATE', entityType: found.kind === 'MENU' ? 'MenuItem' : 'Table', entityId: id, changes: { aiDraft: id, ...outcome.result } });
  return { status: 200, body: outcome.result };
}

async function applyStaff(member: RestaurantMember, id: string, payload: unknown): Promise<Outcome> {
  const v = validateStaff(payload, { requireEmail: true });
  if (!v.ok) return { status: 400, body: { error: v.error } };
  const allowed = ASSIGNABLE_ROLES[member.role] ?? [];
  const bad = v.value.pessoas.find((p) => !allowed.includes(PAPEL_ROLE[p.papel]));
  if (bad) return { status: 400, body: { error: `"${bad.nome}": você não pode dar o papel ${bad.papel.toLowerCase()}` } };
  // Claim the draft first: a second tap gets 409 instead of hiring the people twice
  const claimed = await prisma.aiDraft.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPLIED', appliedAt: new Date(), appliedById: member.userId } });
  if (claimed.count === 0) {
    const d = await prisma.aiDraft.findUnique({ where: { id }, select: { result: true } });
    return { status: 409, body: { error: 'Este rascunho já foi confirmado.', result: d?.result ?? null } };
  }
  const people: { nome: string; email: string; ok: boolean; error?: string; temporaryPassword?: string | null }[] = [];
  for (const p of v.value.pessoas) {
    try {
      const r = await createStaffMember(member, { name: p.nome, email: p.email, staffRole: PAPEL_ROLE[p.papel] });
      people.push(r.ok ? { nome: p.nome, email: p.email, ok: true, temporaryPassword: r.temporaryPassword } : { nome: p.nome, email: p.email, ok: false, error: r.error });
    } catch {
      people.push({ nome: p.nome, email: p.email, ok: false, error: 'Não foi possível cadastrar agora' });
    }
  }
  // The stored result never carries a password
  await prisma.aiDraft.update({ where: { id }, data: { result: { people: people.map(({ temporaryPassword: _pw, ...rest }) => rest) } } });
  return { status: 200, body: { people } };
}
