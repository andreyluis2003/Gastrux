// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { addMessage, getTicket } from '@/lib/support/service'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const ticket = await getTicket(params.id)
  if (!ticket) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  const role = (session.user as any).role
  const isAdmin = role === 'OWNER' || role === 'ADMIN'
  if (!isAdmin && ticket.userId !== session.user.id) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = await req.json()
  const { body: messageBody, isInternal } = body
  if (!messageBody?.trim()) return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 400 })
  const msg = await addMessage({
    ticketId: params.id,
    authorId: session.user.id,
    body: messageBody.trim(),
    isInternal: isAdmin ? Boolean(isInternal) : false,
  })
  return NextResponse.json({ message: msg })
}
