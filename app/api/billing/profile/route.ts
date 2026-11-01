import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { parseBillingProfile } from '@/lib/billing/billing-profile';

export const dynamic = 'force-dynamic';

const DENIED = 'Só o dono do restaurante vê os dados da nota fiscal';

/** The invoice details of the restaurant being worked in, or what the account already knows to start the form */
export async function GET() {
  const auth = await requireRestaurantRole(['OWNER'], DENIED);
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;
  const profile = await prisma.billingProfile.findUnique({ where: { restaurantId } });
  if (profile) return NextResponse.json({ profile }, { headers: { 'Cache-Control': 'private, no-store' } });
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, cnpj: true, zipCode: true, city: true, state: true } });
  return NextResponse.json(
    { profile: null, suggested: { name: r?.name ?? '', document: r?.cnpj ?? '', zipCode: r?.zipCode ?? '', city: r?.city ?? '', state: r?.state ?? '' } },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function PUT(request: NextRequest) {
  const auth = await requireRestaurantRole(['OWNER'], DENIED);
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;
  const parsed = parseBillingProfile(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const profile = await prisma.billingProfile.upsert({
    where: { restaurantId },
    create: { restaurantId, ...parsed.value },
    update: parsed.value,
  });
  return NextResponse.json({ profile });
}
