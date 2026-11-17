import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { normalizePhone } from '@/lib/cashback/rules';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { weightLineCents } from '@/lib/comanda/weight';
import { takeCouponTry } from '@/lib/coupons/attempts';
import { PHONE_NEEDED } from '@/lib/coupons/service';
import { previewSessionCoupon } from '@/lib/coupons/session';

export const dynamic = 'force-dynamic';

const DENIED = 'Usar cupom exige o caixa';
const MAX_ITEMS = 200;

/**
 * What the counter sale items cost, priced as lib/comanda/add-item.ts prices them (menu item price; a recipe sold
 * directly, its selling price; plus each modifier's surcharge; a product by weight costs its weighed part) - nothing is written.
 * An item that is not this restaurant's counts as zero: the sale itself refuses it.
 */
async function itemsSubtotalCents(restaurantId: string, items: any[]): Promise<number> {
  let total = 0;
  for (const raw of items.slice(0, MAX_ITEMS)) {
    const quantity = Number.isInteger(raw?.quantity) && raw.quantity > 0 ? raw.quantity : 1;
    let price: unknown = null;
    if (typeof raw?.menuItemId === 'string') {
      const m = await prisma.menuItem.findFirst({
        where: { id: raw.menuItemId, restaurantId },
        select: { price: true, soldByWeight: true },
      });
      if (!m) continue;
      if (m.soldByWeight) {
        const grams = Number.isInteger(raw?.weightGrams) && raw.weightGrams > 0 ? raw.weightGrams : 0;
        total += weightLineCents(m.price, grams);
        continue;
      }
      price = Number(m.price) || 0;
    } else if (typeof raw?.recipeId === 'string') {
      const r = await prisma.recipe.findFirst({ where: { id: raw.recipeId, restaurantId }, select: { sellingPrice: true } });
      if (!r) continue;
      price = r.sellingPrice ?? 0;
    } else {
      continue;
    }
    const modifierIds = Array.isArray(raw?.modifierIds) ? [...new Set(raw.modifierIds.filter((x: unknown) => typeof x === 'string'))] as string[] : [];
    const modifiers = modifierIds.length
      ? await prisma.itemModifier.findMany({ where: { id: { in: modifierIds }, restaurantId }, select: { priceAdjustment: true } })
      : [];
    total += lineTotalCents(price, quantity, modifiers.map((x) => x.priceAdjustment));
  }
  return total;
}

/**
 * Cupom na venda balcão (spec 2026-11-16 cupom-whatsapp-balcao, parte 1b). POST { code, customerPhone?, items } - what
 * the coupon gives on these items, priced from the menu; nothing is written (the sale reserves the use).
 * Answers { code, discountCents, label } or { error }.
 */
export async function POST(req: Request) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, DENIED);
  if (!auth.ok) return auth.response;
  const { restaurantId, userId } = auth.member;
  // The team shares one address in the room: the tries count per logged user (and per restaurant)
  if (!takeCouponTry('user:' + userId, restaurantId)) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente em um minuto.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return NextResponse.json({ error: 'Adicione itens à venda antes do cupom' }, { status: 400 });
  const phoneDigits = normalizePhone(body?.customerPhone) ?? '';
  const subtotalCents = await itemsSubtotalCents(restaurantId, items);
  const check = await previewSessionCoupon(prisma, { restaurantId, code: body?.code, phoneDigits, subtotalCents });
  if (!check.ok) {
    const error = check.error === PHONE_NEEDED && !phoneDigits ? 'Digite o celular do cliente antes' : check.error;
    return NextResponse.json({ error }, { status: 422 });
  }
  return NextResponse.json({ code: check.code, discountCents: check.discountCents, label: check.label });
}
