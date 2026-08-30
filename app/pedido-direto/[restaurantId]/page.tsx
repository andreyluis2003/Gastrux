// @ts-nocheck
export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import DirectOrderLanding from './direct-order-landing';

export default async function PedidoDiretoPage({ params, searchParams }: any) {
  const { restaurantId } = params;
  const src = searchParams?.src || 'direct';

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      packagingQrEnabled: true,
      packagingQrDiscount: true,
      packagingQrMessage: true,
    },
  });

  if (!restaurant) return notFound();

  return (
    <DirectOrderLanding
      restaurant={restaurant}
      source={src}
    />
  );
}
