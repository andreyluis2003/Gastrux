import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { getCustomerDetails, updateCustomer } from '@/lib/admin/customer-service';
import { clientProfiles } from '@/lib/admin/client-profile';
import { prisma } from '@/lib/prisma';
import { GRANTING_STATUSES } from '@/lib/billing/subscription-sync';

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

    // Extending a trial has its own route with a reason and audit: ./trial (spec 2026-10-18 §8)
    // Final review of the plans of 2026-10-18 (I-2): 'past_due' and 'active' read as a paid plan, so these
    // actions used to hand Business to a client whose trial was over. Suspend locks (lib/billing/plan-access.ts);
    // reactivate gives back only what the client had: the trial while it lasts, the plan only if a subscription pays
    if (body.action === 'suspend') {
      const result = await updateCustomer(params.id, { status: 'SUSPENDED' as any, subscriptionStatus: 'canceled' });
      return NextResponse.json(result);
    }

    if (body.action === 'reactivate') {
      const r = await prisma.restaurant.findUnique({ where: { id: params.id }, select: { ownerId: true, trialEndsAt: true } });
      if (!r) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
      const paying = await prisma.subscription.findFirst({ where: { userId: r.ownerId, status: { in: GRANTING_STATUSES } }, select: { status: true } });
      const result = paying
        ? await updateCustomer(params.id, { status: 'ACTIVE' as any, subscriptionStatus: paying.status })
        : await updateCustomer(params.id, { status: 'TRIAL' as any, subscriptionStatus: 'trialing' });
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
