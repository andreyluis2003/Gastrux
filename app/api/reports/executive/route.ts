import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { enforceFeature } from '@/lib/api/tier-middleware';
import { EXECUTIVE_REPORT_TYPES, executiveReportHtml, type ExecutiveReportType } from '@/lib/reports/executive';

export const dynamic = 'force-dynamic';

const DAYS = [7, 14, 30, 60, 90];

/**
 * GET /api/reports/executive?type=cmv|menu-engineering|waste|comprehensive&days=30&recipes=1 - the report as a
 * page to print or save as PDF (lib/reports/executive.ts). The screen opens it in a new tab.
 */
export async function GET(req: NextRequest) {
  // Owner-and-manager data: the cook and the cashier are refused (prod audit 2026-10-17)
  const gate = await requireRestaurantRole(MANAGER_ROLES);
  if (!gate.ok) return gate.response;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as ExecutiveReportType;
  const days = Number(searchParams.get('days') ?? 30);
  if (!EXECUTIVE_REPORT_TYPES.includes(type) || !DAYS.includes(days)) {
    return NextResponse.json({ error: 'Relatório ou período inválido' }, { status: 400 });
  }
  const restaurantId = gate.member.restaurantId;
  // Only the full executive report is a "Relatórios avançados" feature; CMV, menu and waste are on every plan
  if (type === 'comprehensive') {
    const tierBlock = await enforceFeature(restaurantId, 'advancedReports');
    if (tierBlock) return tierBlock;
  }
  try {
    const html = await executiveReportHtml(restaurantId, type, days, searchParams.get('recipes') !== '0');
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[reports/executive] failed:', error);
    return NextResponse.json({ error: 'Não foi possível gerar o relatório' }, { status: 500 });
  }
}
