import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { getPlatformMetrics, invalidatePlatformMetrics } from '@/lib/admin/platform-metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const bypass = searchParams.get('refresh') === '1';

  try {
    const metrics = await getPlatformMetrics(bypass);
    return NextResponse.json(metrics);
  } catch (error: any) {
    console.error('[platform/metrics]', error);
    return NextResponse.json(
      { error: 'Falha ao carregar métricas', message: error?.message || 'Unknown' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const { response } = await requirePlatformAdmin();
  if (response) return response;
  await invalidatePlatformMetrics();
  return NextResponse.json({ ok: true });
}
