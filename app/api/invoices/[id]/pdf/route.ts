import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getInvoice, buildInvoicePdfHtml } from '@/lib/billing/invoice-service'
import { generatePdfFromHtml } from '@/lib/pdf-generator'
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

  try {
    const html = buildInvoicePdfHtml(invoice)
    const pdfBuffer = await generatePdfFromHtml({
      html_content: html,
      pdf_options: { format: 'A4', margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' } },
    })
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.number}.pdf"`,
      },
    })
  } catch (err: any) {
    console.error('[INVOICE PDF]', err)
    return NextResponse.json({ error: err.message || 'Erro ao gerar PDF' }, { status: 500 })
  }
}
