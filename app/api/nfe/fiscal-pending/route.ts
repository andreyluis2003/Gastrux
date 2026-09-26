import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { resolveItemsFiscalData } from '@/lib/nfe/fiscal-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nfe/fiscal-pending - which active products could NOT go on an NFC-e today (their own
 * data plus the restaurant defaults are incomplete or invalid), so the accountant fixes them
 * before a sale is refused its note.
 */
export async function GET() {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;

  const [config, recipes] = await Promise.all([
    prisma.nFeConfig.findFirst({ where: { restaurantId } }),
    prisma.recipe.findMany({
      where: { restaurantId, active: true },
      select: { id: true, name: true, fiscalNcm: true, fiscalCest: true, fiscalCfop: true, fiscalOrigin: true, fiscalCsosn: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  if (!config) return NextResponse.json({ configured: false, blockedReason: 'Configuração fiscal não criada', pending: [], total: recipes.length });

  const regime = resolveItemsFiscalData(config, []);
  if (!regime.ok) return NextResponse.json({ configured: true, blockedReason: regime.reason, pending: [], total: recipes.length });

  const pending = recipes
    .filter((r) => !resolveItemsFiscalData(config, [r]).ok)
    .map((r) => ({ id: r.id, name: r.name, fiscalNcm: r.fiscalNcm, fiscalCfop: r.fiscalCfop, fiscalOrigin: r.fiscalOrigin, fiscalCsosn: r.fiscalCsosn, fiscalCest: r.fiscalCest }));
  return NextResponse.json({ configured: true, blockedReason: null, pending, total: recipes.length });
}
