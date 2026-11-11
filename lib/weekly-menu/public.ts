import type { DeliveryPaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CashRuleError } from '@/lib/caixa/rules';
import { bannerText, closedText, openMenuOf, remainingPortions, todayIn } from './rules';
import { orderedByItem } from './service';

// Public side of the weekly menu: the link shows it and takes pre-orders (spec 2026-11-10 cardapio-da-semana)

type Db = Prisma.TransactionClient | typeof prisma;

/** Same text the normal delivery order gives for a product it cannot sell */
export const ITEMS_NOT_FOUND = 'Um ou mais itens do pedido não foram encontrados no cardápio deste restaurante';

export interface OpenWeeklyMenu {
  id: string;
  serviceDate: string;
  orderDeadline: Date | null;
  banner: string;
  items: Map<string, { portionLimit: number | null; remaining: number | null }>;
}

async function timeZoneOf(db: Db, restaurantId: string): Promise<string | null> {
  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  return r ? r.timezone || 'America/Sao_Paulo' : null;
}

async function openMenuRow(db: Db, restaurantId: string, timeZone: string, now: Date) {
  const today = todayIn(timeZone, now);
  const menus = await db.weeklyMenu.findMany({
    where: { restaurantId, serviceDate: { gte: today } },
    select: { id: true, serviceDate: true, orderDeadline: true },
  });
  return openMenuOf(menus, today, now);
}

/** The menu the link shows now (earliest not past and before its deadline), or null. */
export async function openWeeklyMenu(restaurantId: string, now: Date = new Date()): Promise<OpenWeeklyMenu | null> {
  const tz = await timeZoneOf(prisma, restaurantId);
  if (!tz) return null;
  const open = await openMenuRow(prisma, restaurantId, tz, now);
  if (!open) return null;
  const [rows, ordered] = await Promise.all([
    prisma.weeklyMenuItem.findMany({ where: { weeklyMenuId: open.id }, select: { menuItemId: true, portionLimit: true } }),
    orderedByItem(prisma, open.id),
  ]);
  const items = new Map(
    rows.map((r) => [r.menuItemId, { portionLimit: r.portionLimit, remaining: remainingPortions(r.portionLimit, ordered.get(r.menuItemId) ?? 0) }]),
  );
  return { id: open.id, serviceDate: open.serviceDate, orderDeadline: open.orderDeadline, banner: bannerText(open.serviceDate, open.orderDeadline, tz), items };
}

/**
 * With no open menu: the earliest upcoming menu whose deadline has passed, as the "encerrado" notice
 * (spec 2026-11-10 cardapio-da-semana, "Como o cliente usa" item 4). Null when none.
 */
export async function closedWeeklyMenu(restaurantId: string, now: Date = new Date()): Promise<{ serviceDate: string; text: string } | null> {
  const tz = await timeZoneOf(prisma, restaurantId);
  if (!tz) return null;
  const today = todayIn(tz, now);
  const m = await prisma.weeklyMenu.findFirst({
    where: { restaurantId, serviceDate: { gte: today }, orderDeadline: { lte: now } },
    orderBy: { serviceDate: 'asc' },
    select: { serviceDate: true },
  });
  return m ? { serviceDate: m.serviceDate, text: closedText(m.serviceDate) } : null;
}

/**
 * Can this order go on this weekly menu now? The menu must be this restaurant's (404) and the open one (409 with the
 * closed text), every product on it (400) and within the portions left (409). Pass no lines to check only the menu.
 * Run without a lock as an early answer; placeWeeklyOrder runs it again under the per-menu lock.
 */
export async function checkWeeklyOrder(
  db: Db,
  restaurantId: string,
  weeklyMenuId: string,
  lines: { menuItemId: string; quantity: number }[],
  now: Date = new Date(),
): Promise<{ serviceDate: string }> {
  const menu = await db.weeklyMenu.findFirst({
    where: { id: weeklyMenuId, restaurantId },
    select: { id: true, serviceDate: true, items: { select: { menuItemId: true, portionLimit: true, menuItem: { select: { name: true } } } } },
  });
  if (!menu) throw new CashRuleError('Cardápio da semana não encontrado', 404);
  const tz = (await timeZoneOf(db, restaurantId)) ?? 'America/Sao_Paulo';
  const open = await openMenuRow(db, restaurantId, tz, now);
  if (open?.id !== menu.id) throw new CashRuleError(closedText(menu.serviceDate), 409);
  if (!lines.length) return { serviceDate: menu.serviceDate };

  const onMenu = new Map(menu.items.map((i) => [i.menuItemId, i]));
  const asked = new Map<string, number>();
  for (const l of lines) {
    if (!onMenu.has(l.menuItemId)) throw new CashRuleError(ITEMS_NOT_FOUND, 400);
    asked.set(l.menuItemId, (asked.get(l.menuItemId) ?? 0) + l.quantity);
  }
  const ordered = await orderedByItem(db, menu.id);
  for (const [menuItemId, qty] of asked) {
    const item = onMenu.get(menuItemId)!;
    const left = remainingPortions(item.portionLimit, ordered.get(menuItemId) ?? 0);
    if (left !== null && qty > left) {
      const name = item.menuItem.name;
      throw new CashRuleError(left === 0 ? `${name} esgotou` : `${name}: só restam ${left} porções`, 409);
    }
  }
  return { serviceDate: menu.serviceDate };
}

export interface WeeklyOrderLine {
  menuItemId: string;
  recipeId: string;
  name: string;
  /** Price frozen at the time of the pre-order */
  unitPrice: number;
  quantity: number;
  specialInstructions?: string | null;
}

/** Everything the release needs to write the site order later (writeSiteOrder) */
export interface ValidatedWeeklyOrder {
  orderNumber: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  isPickup: boolean;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryZipCode: string | null;
  kitchenNote: string;
  paymentMethod: DeliveryPaymentMethod;
  cashChangeFor: number | null;
  voucherBrand: string | null;
  paymentNote: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  couponRedemptionId: string | null;
  couponCode: string | null;
  items: WeeklyOrderLine[];
}

/** Writes the pre-order under the same per-menu lock the admin edit takes, re-checking deadline and portions. */
export async function placeWeeklyOrder(
  restaurantId: string,
  weeklyMenuId: string,
  validated: ValidatedWeeklyOrder,
  now: Date = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    // Same key as updateWeeklyMenu: orders and edits of one menu serialize
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'weekly-menu:' + weeklyMenuId}))`;
    const { serviceDate } = await checkWeeklyOrder(tx, restaurantId, weeklyMenuId, validated.items, now);
    const { items, ...fields } = validated;
    const row = await tx.weeklyMenuOrder.create({
      data: {
        ...fields,
        restaurantId,
        weeklyMenuId,
        items: {
          create: items.map((i) => ({
            menuItemId: i.menuItemId, recipeId: i.recipeId, name: i.name, unitPrice: i.unitPrice,
            quantity: i.quantity, specialInstructions: i.specialInstructions || null,
          })),
        },
      },
      select: { id: true },
    });
    return { id: row.id, serviceDate };
  });
}
