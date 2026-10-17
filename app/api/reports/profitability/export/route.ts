// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Owner-and-manager data: the cook and the cashier are refused (prod audit 2026-10-17)
  const gate = await requireRestaurantRole(MANAGER_ROLES);
  if (!gate.ok) return gate.response;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'excel';

    if (format === 'excel') {
      const excelContent = Buffer.from('Excel mock content');
      return new NextResponse(excelContent, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="lucratividade.xlsx"',
        },
      });
    }

    return NextResponse.json({ message: 'Relatorio exportado com sucesso' });
  } catch (error) {
    console.error('Error exporting profitability report:', error);
    return NextResponse.json(
      { error: 'Failed to export report' },
      { status: 500 }
    );
  }
}
