import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { aiCostsByMonth } from '@/lib/admin/ai-costs';
import { currentMonth } from '@/lib/utility-bills/rules';

export const dynamic = 'force-dynamic';

/** GET /api/admin/platform/ai-costs?month=YYYY-MM - AI cost per restaurant in a Brasília month (platform admins) */
export async function GET(req: NextRequest) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;
  const month = new URL(req.url).searchParams.get('month') || currentMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Mês inválido' }, { status: 400 });
  return NextResponse.json(await aiCostsByMonth(month), { headers: { 'Cache-Control': 'no-store' } });
}
