import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { appBaseUrl } from '@/lib/auth/password-reset';

/**
 * The delivery link shared on WhatsApp previews the restaurant (name, "Cardápio e pedidos online", its logo), not
 * Gastrux (2026-10-18, WhatsApp option A).
 */
const MENU_TEXT = 'Cardápio e pedidos online';

export async function generateMetadata({ params }: { params: { restaurantId: string } }): Promise<Metadata> {
  const restaurant = await prisma.restaurant
    .findUnique({ where: { id: params.restaurantId }, select: { name: true, logoUrl: true } })
    .catch(() => null);
  if (!restaurant) return { title: MENU_TEXT, openGraph: { title: MENU_TEXT, description: MENU_TEXT } };
  const logo = restaurant.logoUrl
    ? (restaurant.logoUrl.startsWith('/') ? `${appBaseUrl()}${restaurant.logoUrl}` : restaurant.logoUrl)
    : null;
  return {
    title: `${restaurant.name} | ${MENU_TEXT}`,
    description: `Veja o cardápio do ${restaurant.name} e faça seu pedido online.`,
    openGraph: {
      title: restaurant.name,
      description: MENU_TEXT,
      type: 'website',
      ...(logo ? { images: [{ url: logo }] } : {}),
    },
  };
}

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
