import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { listCustomers } from '@/lib/admin/customer-service';
import type { RestaurantStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  try {
    const data = await listCustomers({
      search: searchParams.get('search') || undefined,
      status: (searchParams.get('status') as RestaurantStatus) || null,
      tier: searchParams.get('tier') || null,
      subscriptionStatus: searchParams.get('subscriptionStatus') || null,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '25', 10),
      sortBy: (searchParams.get('sortBy') as any) || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') as any) || 'desc',
    });
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[admin/customers]', err);
    return NextResponse.json(
      { error: 'Falha ao listar clientes', message: err.message },
      { status: 500 }
    );
  }
}
