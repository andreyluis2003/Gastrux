import { prisma } from '@/lib/prisma';
import { CashRuleError } from '@/lib/caixa/rules';
import { releaseRedemption } from '@/lib/coupons/service';
import { productionSummary, remainingPortions, todayIn } from './rules';

// Admin service for the weekly menu (spec 2026-11-10 cardapio-da-semana)

// Orders that hold portions: everything but CANCELLED
const LIVE = ['PLACED', 'RELEASING', 'RELEASED'] as const;

export interface WeeklyMenuItemInput {
  menuItemId: string;
  portionLimit?: number | null;
}

export interface NewWeeklyMenu {
  serviceDate: string;
  orderDeadline?: string | null;
  items?: WeeklyMenuItemInput[];
  copyFromId?: string;
}

function parseDate(serviceDate: unknown): string {
  if (typeof serviceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    throw new CashRuleError('Informe a data do cardápio', 400);
  }
  const [y, m, d] = serviceDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new CashRuleError('Data inválida', 400);
  }
  return serviceDate;
}

function parseDeadline(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = typeof v === 'string' ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new CashRuleError('Prazo inválido', 400);
  return d;
}

function cleanItems(items: unknown): { menuItemId: string; portionLimit: number | null }[] {
  if (!Array.isArray(items)) throw new CashRuleError('Informe os produtos do cardápio', 400);
  const seen = new Set<string>();
  const out: { menuItemId: string; portionLimit: number | null }[] = [];
  for (const raw of items) {
    const id = raw?.menuItemId;
    if (typeof id !== 'string' || !id) throw new CashRuleError('Produto inválido', 400);
    if (seen.has(id)) continue;
    seen.add(id);
    const lim = raw.portionLimit;
    if (lim !== null && lim !== undefined && (!Number.isInteger(lim) || lim < 0)) {
      throw new CashRuleError('Limite de porções inválido', 400);
    }
    out.push({ menuItemId: id, portionLimit: lim ?? null });
  }
  return out;
}

async function assertProducts(restaurantId: string, ids: string[]) {
  if (!ids.length) return;
  const found = await prisma.menuItem.count({ where: { id: { in: ids }, restaurantId, active: true } });
  if (found !== ids.length) throw new CashRuleError('Produto não encontrado ou inativo', 400);
}

export async function createWeeklyMenu(restaurantId: string, input: NewWeeklyMenu) {
  const serviceDate = parseDate(input.serviceDate);
  const orderDeadline = parseDeadline(input.orderDeadline);
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  if (serviceDate < todayIn(restaurant?.timezone ?? 'America/Sao_Paulo')) {
    throw new CashRuleError('A data do cardápio já passou', 400);
  }

  let items: { menuItemId: string; portionLimit: number | null }[];
  if (input.copyFromId) {
    const src = await prisma.weeklyMenu.findFirst({
      where: { id: input.copyFromId, restaurantId },
      include: { items: true },
    });
    if (!src) throw new CashRuleError('Cardápio de origem não encontrado', 404);
    items = src.items.map((i) => ({ menuItemId: i.menuItemId, portionLimit: i.portionLimit }));
  } else {
    items = cleanItems(input.items ?? []);
  }
  await assertProducts(restaurantId, items.map((i) => i.menuItemId));

  const dup = await prisma.weeklyMenu.findUnique({
    where: { restaurantId_serviceDate: { restaurantId, serviceDate } },
    select: { id: true },
  });
  if (dup) throw new CashRuleError('Já existe um cardápio para esta data', 409);
  try {
    return await prisma.weeklyMenu.create({
      data: { restaurantId, serviceDate, orderDeadline, items: { create: items } },
      select: { id: true, serviceDate: true, orderDeadline: true },
    });
  } catch (e: any) {
    if (e?.code === 'P2002') throw new CashRuleError('Já existe um cardápio para esta data', 409);
    throw e;
  }
}

export async function updateWeeklyMenu(
  restaurantId: string,
  id: string,
  input: { orderDeadline?: string | null; items: WeeklyMenuItemInput[] },
) {
  const menu = await prisma.weeklyMenu.findFirst({ where: { id, restaurantId }, select: { id: true } });
  if (!menu) throw new CashRuleError('Cardápio não encontrado', 404);
  const items = cleanItems(input.items);
  const orderDeadline = input.orderDeadline === undefined ? undefined : parseDeadline(input.orderDeadline);
  const keep = new Set(items.map((i) => i.menuItemId));

  await prisma.$transaction(async (tx) => {
    // Same per-menu lock the public ordering takes: placement and edits serialize
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'weekly-menu:' + id}))`;
    const current = await tx.weeklyMenuItem.findMany({ where: { weeklyMenuId: id }, select: { menuItemId: true } });
    const currentIds = new Set(current.map((c) => c.menuItemId));
    const added = items.map((i) => i.menuItemId).filter((x) => !currentIds.has(x));
    if (added.length) {
      const found = await tx.menuItem.count({ where: { id: { in: added }, restaurantId, active: true } });
      if (found !== added.length) throw new CashRuleError('Produto não encontrado ou inativo', 400);
    }
    // Dropping a product that already has a PLACED order is refused
    const removed = [...currentIds].filter((x) => !keep.has(x));
    for (const menuItemId of removed) {
      const n = await tx.weeklyMenuOrder.count({
        where: { weeklyMenuId: id, status: 'PLACED', items: { some: { menuItemId } } },
      });
      if (n > 0) throw new CashRuleError(`Já tem ${n} encomendas com este produto`, 409);
    }
    if (orderDeadline !== undefined) await tx.weeklyMenu.update({ where: { id }, data: { orderDeadline } });
    if (removed.length) await tx.weeklyMenuItem.deleteMany({ where: { weeklyMenuId: id, menuItemId: { in: removed } } });
    for (const it of items) {
      await tx.weeklyMenuItem.upsert({
        where: { weeklyMenuId_menuItemId: { weeklyMenuId: id, menuItemId: it.menuItemId } },
        create: { weeklyMenuId: id, menuItemId: it.menuItemId, portionLimit: it.portionLimit },
        update: { portionLimit: it.portionLimit },
      });
    }
  });
  return getWeeklyMenu(restaurantId, id);
}

export async function listWeeklyMenus(restaurantId: string) {
  const menus = await prisma.weeklyMenu.findMany({
    where: { restaurantId },
    orderBy: { serviceDate: 'desc' },
    select: {
      id: true,
      serviceDate: true,
      orderDeadline: true,
      _count: { select: { items: true } },
      orders: { where: { status: { in: [...LIVE] } }, select: { id: true } },
    },
  });
  return menus.map((m) => ({
    id: m.id,
    serviceDate: m.serviceDate,
    orderDeadline: m.orderDeadline,
    itemCount: m._count.items,
    orderCount: m.orders.length,
  }));
}

export async function getWeeklyMenu(restaurantId: string, id: string) {
  const menu = await prisma.weeklyMenu.findFirst({
    where: { id, restaurantId },
    include: {
      items: { include: { menuItem: { select: { name: true, price: true } } }, orderBy: { id: 'asc' } },
      orders: { include: { items: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!menu) throw new CashRuleError('Cardápio não encontrado', 404);

  const live = menu.orders.filter((o) => (LIVE as readonly string[]).includes(o.status));
  const orderedBy = new Map<string, number>();
  for (const o of live) for (const it of o.items) orderedBy.set(it.menuItemId, (orderedBy.get(it.menuItemId) ?? 0) + it.quantity);

  const items = menu.items.map((i) => {
    const ordered = orderedBy.get(i.menuItemId) ?? 0;
    return {
      menuItemId: i.menuItemId,
      name: i.menuItem.name,
      price: Number(i.menuItem.price),
      portionLimit: i.portionLimit,
      ordered,
      remaining: remainingPortions(i.portionLimit, ordered),
    };
  });
  const summary = productionSummary(live.flatMap((o) => o.items));
  const { orders, items: _items, ...menuRow } = menu;
  return { menu: menuRow, items, summary, orders };
}

export async function cancelWeeklyOrder(restaurantId: string, menuId: string, orderId: string, reason: unknown) {
  const order = await prisma.weeklyMenuOrder.findFirst({
    where: { id: orderId, weeklyMenuId: menuId, restaurantId },
    select: { id: true, couponRedemptionId: true },
  });
  if (!order) throw new CashRuleError('Encomenda não encontrada', 404);
  const text = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
  // One transaction: the cancel and the coupon release succeed or fail together
  await prisma.$transaction(async (tx) => {
    // Conditional update: only a PLACED order is cancelled, and only once
    const res = await tx.weeklyMenuOrder.updateMany({
      where: { id: order.id, status: 'PLACED' },
      data: { status: 'CANCELLED', cancelReason: text || null, cancelledAt: new Date() },
    });
    if (res.count === 0) throw new CashRuleError('Esta encomenda já virou pedido; cancele pelo pedido', 409);
    if (order.couponRedemptionId) await releaseRedemption(order.couponRedemptionId, tx);
  });
  return { id: order.id, status: 'CANCELLED' as const };
}

export async function deleteWeeklyMenu(restaurantId: string, id: string) {
  const menu = await prisma.weeklyMenu.findFirst({ where: { id, restaurantId }, select: { id: true } });
  if (!menu) throw new CashRuleError('Cardápio não encontrado', 404);
  await prisma.$transaction(async (tx) => {
    const live = await tx.weeklyMenuOrder.count({ where: { weeklyMenuId: id, status: { not: 'CANCELLED' } } });
    if (live > 0) throw new CashRuleError('Este cardápio já tem encomendas; cancele-as antes de apagar', 409);
    // FK is Restrict: cancelled orders (their items cascade) go first
    await tx.weeklyMenuOrder.deleteMany({ where: { weeklyMenuId: id } });
    await tx.weeklyMenu.delete({ where: { id } });
  });
}
