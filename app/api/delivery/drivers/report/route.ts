import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { MANAGER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';
import { driverReport, validPeriod } from '@/lib/delivery/driver-report';

export const dynamic = 'force-dynamic';

/** GET /api/delivery/drivers/report?from=YYYY-MM-DD&to=YYYY-MM-DD - deliveries, dailies, paid and to pay by driver (manager). */
export async function GET(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_PLUS, 'O relatório de entregadores exige um gerente');
  if (!auth.ok) return auth.response;
  try {
    const params = new URL(request.url).searchParams;
    const { from, to } = validPeriod(params.get('from'), params.get('to'));
    return NextResponse.json({ from, to, rows: await driverReport(auth.member.restaurantId, from, to) });
  } catch (error) {
    return cashErrorResponse(error, 'driver report');
  }
}
