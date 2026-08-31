// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTicket, updateTicket } from '@/lib/support/service'
import { isPlatformAdminIdentity } from '@/lib/admin/guard'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const email = (session?.user as any)?.email
  if (!session?.user?.id || !isPlatformAdminIdentity(role, email)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const ticket = await getTicket(params.id)
  if (!ticket) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ticket })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const email = (session?.user as any)?.email
  if (!session?.user?.id || !isPlatformAdminIdentity(role, email)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const body = await req.json()
  const updated = await updateTicket(params.id, {
    status: body.status,
    priority: body.priority,
    assignedToId: body.assignedToId,
    category: body.category,
  })
  return NextResponse.json({ ticket: updated })
}
