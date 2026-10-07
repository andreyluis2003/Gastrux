import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { getCustomerDetails, updateCustomer, extendTrial } from '@/lib/admin/customer-service';
import { clientProfiles } from '@/lib/admin/client-profile';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;

  try {
    const details = await getCustomerDetails(params.id);
    if (!details) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    // Profile and notes always fresh (the details above are cached for a short while)
    const [profiles, notes] = await Promise.all([
      clientProfiles([params.id]),
      prisma.platformClientNote.findMany({ where: { restaurantId: params.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return NextResponse.json(
      { ...details, profile: profiles.get(params.id) ?? null, notes },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err: any) {
    console.error('[admin/customers/:id]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;

  try {
    const body = await req.json();

    // Support special actions
    if (body.action === 'extend_trial' && typeof body.days === 'number' && body.days > 0) {
      const result = await extendTrial(params.id, body.days);
      if (!result) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
      return NextResponse.json(result);
    }

    if (body.action === 'suspend') {
      const result = await updateCustomer(params.id, {
        status: 'SUSPENDED' as any,
        subscriptionStatus: 'past_due',
      });
      return NextResponse.json(result);
    }

    if (body.action === 'reactivate') {
      const result = await updateCustomer(params.id, {
        status: 'ACTIVE' as any,
        subscriptionStatus: 'active',
      });
      return NextResponse.json(result);
    }

    // Generic update
    const result = await updateCustomer(params.id, {
      status: body.status,
      subscriptionTier: body.subscriptionTier,
      subscriptionStatus: body.subscriptionStatus,
      trialEndsAt: body.trialEndsAt,
      billingCycleEnd: body.billingCycleEnd,
      note: body.note,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[admin/customers/:id PATCH]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
