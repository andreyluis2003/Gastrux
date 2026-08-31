// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createTicket, listUserTickets } from '@/lib/support/service'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const tickets = await listUserTickets(session.user.id)
  return NextResponse.json({ tickets })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { currentRestaurantId: true, restaurants: { select: { restaurantId: true }, take: 1 } },
  })
  const restaurantId = user?.currentRestaurantId || user?.restaurants?.[0]?.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 400 })
  const body = await req.json()
  const { subject, description, category, priority } = body
  if (!subject || !description) return NextResponse.json({ error: 'Assunto e descrição são obrigatórios' }, { status: 400 })
  const ticket = await createTicket({
    openedById: session.user.id,
    restaurantId,
    subject,
    description,
    category: category || 'DUVIDA',
    priority: priority || 'NORMAL',
  })
  return NextResponse.json({ ticket })
}
