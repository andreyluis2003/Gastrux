import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { WHATSAPP_CONSENT_VERSION, parseWhatsapp } from '@/lib/onboarding/whatsapp';

export const dynamic = 'force-dynamic';

/** Owner of the current restaurant, without a number yet: accounts from before the sign-up asked for it */
async function ownerWithoutNumber(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { whatsapp: true, currentRestaurantId: true } });
  if (!user?.currentRestaurantId || user.whatsapp) return false;
  return !!(await prisma.restaurant.findFirst({ where: { id: user.currentRestaurantId, ownerId: userId }, select: { id: true } }));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  return NextResponse.json({ needed: await ownerWithoutNumber(session.user.id) });
}

/** Fills an empty number only: changing a saved number, or its consent, is not this route's job */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const userId = session.user.id;
  if (!(await ownerWithoutNumber(userId))) return NextResponse.json({ error: 'Nada a preencher' }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const whatsapp = parseWhatsapp(body?.whatsapp);
  if (!whatsapp.ok) return NextResponse.json({ error: whatsapp.error }, { status: 400 });

  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsapp: whatsapp.value,
      // Only an explicit tick counts, as in the sign-up
      ...(body?.whatsappMarketing === true
        ? { whatsappMarketingConsentAt: new Date(), whatsappMarketingConsentVersion: WHATSAPP_CONSENT_VERSION }
        : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
