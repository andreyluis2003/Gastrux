import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { listCustomers } from '@/lib/admin/customer-service';
import { clientFunnel, clientProfiles } from '@/lib/admin/client-profile';
import { STAGES, type ClientStage } from '@/lib/admin/client-health';
import type { RestaurantStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The clients of the platform: the funnel (how many got to each step, how many need attention) and
 * one page of clients, each with contact, sign-up answers, usage and alerts (lib/admin/client-profile).
 * ?focus=attention lists only who needs attention; ?stage=<step> only that funnel step.
 */
export async function GET(req: NextRequest) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  try {
    const funnel = await clientFunnel();
    const stage = searchParams.get('stage') as ClientStage | null;
    const ids = searchParams.get('focus') === 'attention'
      ? funnel.attentionIds
      : stage && STAGES.some((s) => s.value === stage) ? funnel.stageIds(stage) : undefined;

    const data = await listCustomers({
      search: searchParams.get('search') || undefined,
      status: (searchParams.get('status') as RestaurantStatus) || null,
      tier: searchParams.get('tier') || null,
      subscriptionStatus: searchParams.get('subscriptionStatus') || null,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '25', 10),
      sortBy: (searchParams.get('sortBy') as any) || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') as any) || 'desc',
      ids,
    });
    const profiles = await clientProfiles(data.customers.map((c) => c.id));

    return NextResponse.json({
      ...data,
      customers: data.customers.map((c) => ({ ...c, profile: profiles.get(c.id) ?? null })),
      funnel: { total: funnel.total, byStage: funnel.byStage, needAttention: funnel.needAttention, urgent: funnel.urgent },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err: any) {
    console.error('[admin/customers]', err);
    return NextResponse.json({ error: 'Falha ao listar clientes' }, { status: 500 });
  }
}
