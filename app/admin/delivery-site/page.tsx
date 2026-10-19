import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { appBaseUrl } from '@/lib/auth/password-reset';
import { DeliverySiteClient } from '@/components/delivery/delivery-site-client';

export const dynamic = 'force-dynamic';

/** Site de delivery: the link and the WhatsApp messages of the store selected in the menu (2026-10-19) */
export default async function DeliverySitePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/auth/signin');
  const restaurantId = await getCurrentRestaurantId();
  const restaurant = restaurantId
    ? await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true, name: true } })
    : null;
  return (
    <DeliverySiteClient
      restaurantId={restaurant?.id ?? null}
      restaurantName={restaurant?.name ?? ''}
      deliveryUrl={restaurant ? `${appBaseUrl()}/delivery/${restaurant.id}` : ''}
    />
  );
}
