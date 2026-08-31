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
      restaurants: { select: { restaurantId: true }, take: 1 },
    },
  })
  const restaurantId = user?.currentRestaurantId || user?.restaurants?.[0]?.restaurantId || null

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

  // This is SaaS billing history (what the restaurant owner pays Gastrux for
  // their subscription), not order/reservation payments - that's BillingInvoice,
  // not Payment (which has no restaurantId and is for customer-facing order
  // payments).
  const invoices = await prisma.billingInvoice.findMany({
    where: {
      OR: [
        { userId: session.user.id },
        ...(restaurantId ? [{ restaurantId }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const payments = invoices.map((inv) => ({ ...inv, amount: inv.total }))

  return NextResponse.json({ subscription, payments })
}
