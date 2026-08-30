// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      currentRestaurantId: true,
      restaurants: { select: { id: true }, take: 1 },
    },
  })
  const restaurantId = user?.currentRestaurantId || user?.restaurants?.[0]?.id || null

  const subscription = await prisma.subscription.findFirst({
    where: {
      OR: [
        { userId: session.user.id },
        ...(restaurantId ? [{ restaurantId }] : []),
      ],
      status: { in: ['active', 'trialing', 'past_due'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  const payments = restaurantId
    ? await prisma.payment.findMany({
        where: {},
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : []

  return NextResponse.json({ subscription, payments })
}
