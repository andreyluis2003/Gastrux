// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { computeDre } from '@/lib/finance/dre';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/** GET /api/financeiro/dre?startDate&endDate - the numbers come from lib/finance/dre.ts (shared with the AI) */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Financial results: owner and managers only (the cashier and the cook could open it)
    const auth = await requireRestaurantRole([...MANAGER_ROLES, 'ADMIN'], 'A DRE é do dono e do gerente');
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: 'startDate e endDate são obrigatórios (AAAA-MM-DD)' }, { status: 400 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 400 });
    }

    return NextResponse.json(await computeDre(restaurantId, startDate, endDate));
  } catch (error) {
    console.error('Error generating DRE:', error);
    return NextResponse.json({ error: 'Erro ao gerar DRE' }, { status: 500 });
  }
}
