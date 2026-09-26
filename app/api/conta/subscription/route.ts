// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role'
import { subscriptionGrantsAccess } from '@/lib/billing/subscription-sync'

export const dynamic = 'force-dynamic'

/**
 * The restaurant's Gastrux subscription and billing history, for the owner and managers. It used to
 * answer any logged-in user from their raw currentRestaurantId, or their first restaurant, without
 * checking they still belonged to it.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'A cobrança é visível para o dono e gerentes')
  if (!auth.ok) return auth.response
  const restaurantId = auth.member.restaurantId
  const isOwner = auth.member.role === 'OWNER'
  // The owner pays for all their restaurants (lib/billing/subscription-sync.ts): managers see the owner's
  const owner = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { ownerId: true } })
  const payerId = owner?.ownerId || session.user.id

  // The subscription the plan comes from now; a canceled one counts while its paid period lasts
  const candidates = await prisma.subscription.findMany({
    where: {
      OR: [{ userId: payerId }, { restaurantId }],
      status: { in: ['active', 'trialing', 'past_due', 'canceled'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  const subscription = candidates.find((s) => subscriptionGrantsAccess(s)) || null

  // This is SaaS billing history (what the restaurant owner pays Gastrux for
  // their subscription), not order/reservation payments - that's BillingInvoice,
  // not Payment (which has no restaurantId and is for customer-facing order
  // payments).
  const invoices = await prisma.billingInvoice.findMany({
    where: {
      OR: [{ userId: payerId }, { restaurantId }],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const payments = invoices.map((inv) => ({ ...inv, amount: inv.total }))

  return NextResponse.json({ subscription, payments, canCancel: isOwner })
}
