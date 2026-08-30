import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getInvoice } from '@/lib/billing/invoice-service'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const invoice = await getInvoice(params.id)
  if (!invoice) {
    return NextResponse.json({ error: 'Fatura não encontrada' }, { status: 404 })
  }
  const role = session.user.role as string
  const isAdmin = role === 'OWNER' || role === 'ADMIN'
  if (!isAdmin && invoice.userId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  return NextResponse.json({ invoice })
}
