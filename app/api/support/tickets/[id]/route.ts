// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTicket, updateTicket } from '@/lib/support/service'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const ticket = await getTicket(params.id)
  if (!ticket) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  const role = (session.user as any).role
  const isAdmin = role === 'OWNER' || role === 'ADMIN'
  if (!isAdmin && ticket.userId !== session.user.id) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const filtered = {
    ...ticket,
    messages: isAdmin ? ticket.messages : ticket.messages.filter((m: any) => !m.internal),
  }
  return NextResponse.json({ ticket: filtered })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const ticket = await getTicket(params.id)
  if (!ticket) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  const body = await req.json()
  if (body.rating !== undefined || body.ratingComment !== undefined) {
    if (ticket.userId !== session.user.id) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const updated = await updateTicket(params.id, { rating: body.rating, ratingComment: body.ratingComment })
    return NextResponse.json({ ticket: updated })
  }
  if (body.status === 'CLOSED' && ticket.userId === session.user.id) {
    const updated = await updateTicket(params.id, { status: 'CLOSED' })
    return NextResponse.json({ ticket: updated })
  }
  return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
}
