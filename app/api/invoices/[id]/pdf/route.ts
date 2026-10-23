import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getInvoice, buildInvoicePdfHtml } from '@/lib/billing/invoice-service'
import { isPlatformAdminIdentity } from '@/lib/admin/guard'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const invoice = await getInvoice(params.id)
  if (!invoice) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })
  const isAdmin = isPlatformAdminIdentity(session.user.role as string, session.user.email as string)
  if (!isAdmin && invoice.userId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // A page to print or save as PDF (2026-10-23): the PDF came from an external service (Abacus) whose key was
  // never set in production, so every download failed
  return new NextResponse(buildInvoicePdfHtml(invoice), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
