import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SEGMENTS } from '@/lib/marketing/segments';
import { seedStarterTemplate } from '@/lib/onboarding/seed-template';
import { parseRestaurantAddress } from '@/lib/onboarding/address';

export const dynamic = 'force-dynamic';

const BUSINESS_STAGES = ['operating', 'opening_soon', 'just_researching'];
const LOCATION_COUNTS = ['1', '2_5', '6_plus'];
const PAIN_POINTS = ['estoque', 'cmv', 'caixa', 'outro'];
// Business-type answers reuse the marketing segment slugs so the two stay in
// sync, but drop 'delivery'/'franquias' - those are a business-model/channel
// dimension, not a cuisine/format, and don't belong in the same single-choice
// list as 'pizzaria'/'japones'/etc.
const BUSINESS_TYPES = SEGMENTS.map((s) => s.slug).filter((slug) => !['delivery', 'franquias'].includes(slug));

/**
 * The sign-up questions (/auth/qualification). Besides the answers, they carry the "Comece com"
 * choice (startWith: 'template' = the example menu of the chosen business type, 'blank' = nothing)
 * and the restaurant address, which may be left for later. "Pular por enquanto" sends skip: true
 * and gets the general example, as every account did before.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await request.json().catch(() => ({}));

  // Only the owner of the account's own restaurant shapes it (staff never reach this page)
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { currentRestaurantId: true } });
  const restaurant = user?.currentRestaurantId
    ? await prisma.restaurant.findFirst({ where: { id: user.currentRestaurantId, ownerId: userId }, select: { id: true } })
    : null;

  if (body.skip === true) {
    const seed = restaurant ? await seedStarterTemplate(restaurant.id, null) : null;
    return NextResponse.json({ skipped: true, template: seed?.seeded ? seed.template : null });
  }

  const { businessStage, businessType, locationCount, mainPainPoint } = body;
  const startWith = body.startWith ?? 'template';

  if (
    !BUSINESS_STAGES.includes(businessStage) ||
    !BUSINESS_TYPES.includes(businessType) ||
    !LOCATION_COUNTS.includes(locationCount) ||
    !PAIN_POINTS.includes(mainPainPoint) ||
    !['template', 'blank'].includes(startWith)
  ) {
    return NextResponse.json({ error: 'Resposta inválida' }, { status: 400 });
  }

  const address = parseRestaurantAddress(body.address);
  if (!address.ok) {
    return NextResponse.json({ error: address.error }, { status: 400 });
  }

  const leadQuality = businessStage === 'just_researching' ? 'curious' : 'qualified';

  await prisma.user.update({
    where: { id: userId },
    data: { businessStage, businessType, locationCount, mainPainPoint, leadQuality },
  });

  let template: string | null = null;
  if (restaurant) {
    if (address.value) {
      await prisma.restaurant.update({ where: { id: restaurant.id }, data: address.value });
    }
    if (startWith === 'template') {
      const seed = await seedStarterTemplate(restaurant.id, businessType);
      template = seed.seeded ? seed.template : null;
    }
  }

  return NextResponse.json({ leadQuality, template, addressSaved: !!address.value });
}
