// @ts-nocheck
import { prisma } from '@/lib/db'
import { sendNotificationEmail } from '@/lib/email-service'

export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const lastInvoice = await prisma.billingInvoice.findFirst({
    where: { number: { startsWith: `INV-${year}-` } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  const lastSeq = lastInvoice ? parseInt(lastInvoice.number.split('-').pop() || '0', 10) : 0
  const nextSeq = lastSeq + 1
  return `INV-${year}-${String(nextSeq).padStart(5, '0')}`
}

export async function createInvoice(params: any) {
  const number = await generateInvoiceNumber()
  const subtotal = params.subtotal
  const tax = params.tax ?? 0
  const discount = params.discount ?? 0
  const total = Number((subtotal + tax - discount).toFixed(2))

  const invoice = await prisma.billingInvoice.create({
    data: {
      number,
      userId: params.userId,
      restaurantId: params.restaurantId ?? null,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      customerDocument: params.customerDocument ?? null,
      customerAddress: params.customerAddress ?? null,
      subscriptionId: params.subscriptionId ?? null,
      description: params.description,
      periodStart: params.periodStart ?? null,
      periodEnd: params.periodEnd ?? null,
      subtotal,
      tax,
      discount,
      total,
      currency: params.currency || 'BRL',
      dueDate: params.dueDate ?? null,
      paymentId: params.paymentId ?? null,
      status: params.status || 'ISSUED',
      paidAt: params.paidAt ?? null,
      paymentMethod: params.paymentMethod ?? null,
    },
  })

  try {
    if (params.customerEmail && process.env.NOTIF_ID_FATURA_NOVA_EMITIDA) {
      await sendNotificationEmail({
        notificationId: process.env.NOTIF_ID_FATURA_NOVA_EMITIDA,
        subject: `Nova fatura — ${invoice.number}`,
        htmlBody: buildInvoiceEmail(invoice),
        recipientEmail: params.customerEmail,
      })
    }
  } catch (err) {
    console.error('[BILLING] Falha email:', err)
  }
  return invoice
}

export async function listUserInvoices(userId: string) {
  return prisma.billingInvoice.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export async function getInvoice(id: string) {
  return prisma.billingInvoice.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      restaurant: { select: { id: true, name: true } },
    },
  })
}

export async function markInvoicePaid(id: string, paymentMethod?: string, paymentId?: string) {
  return prisma.billingInvoice.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      paymentMethod: paymentMethod || null,
      paymentId: paymentId || null,
    },
  })
}

function buildInvoiceEmail(invoice: any): string {
  const appUrl = process.env.NEXTAUTH_URL || ''
  const url = appUrl ? `${appUrl}/conta/cobranca` : ''
  const total = typeof invoice.total?.toNumber === 'function' ? invoice.total.toNumber() : Number(invoice.total || 0)
  return `<html><body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#f3f4f6;">
    <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
      <div style="background:#fff;border-radius:12px;padding:32px;">
        <div style="background:linear-gradient(135deg,#059669,#2563eb);border-radius:12px;padding:32px;margin:-32px -32px 24px;color:#fff;">
          <h1 style="margin:0;font-size:24px;">Nova fatura disponível</h1>
          <p style="margin:8px 0 0;opacity:.9;">${invoice.number}</p>
        </div>
        <p style="color:#374151;line-height:1.6;">Olá ${invoice.customerName}, sua fatura foi emitida.</p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">DESCRIÇÃO</p>
          <p style="margin:0 0 12px;">${invoice.description}</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">TOTAL</p>
          <p style="margin:0;color:#059669;font-weight:700;font-size:24px;">${invoice.currency} ${total.toFixed(2)}</p>
        </div>
        ${url ? `<p style="text-align:center;"><a href="${url}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;">Ver fatura</a></p>` : ''}
      </div>
    </div>
  </body></html>`
}

export function buildInvoicePdfHtml(invoice: any): string {
  const total = typeof invoice.total?.toNumber === 'function' ? invoice.total.toNumber() : Number(invoice.total || 0)
  const subtotal = typeof invoice.subtotal?.toNumber === 'function' ? invoice.subtotal.toNumber() : Number(invoice.subtotal || 0)
  const tax = typeof invoice.tax?.toNumber === 'function' ? invoice.tax.toNumber() : Number(invoice.tax || 0)
  const discount = typeof invoice.discount?.toNumber === 'function' ? invoice.discount.toNumber() : Number(invoice.discount || 0)

  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8" />
<title>${invoice.number}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #111827; padding: 40px; margin: 0; }
  .header { display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
  .logo { font-size: 24px; font-weight: 700; color: #2563eb; }
  .invoice-number { text-align: right; }
  .invoice-number h1 { margin: 0; font-size: 28px; }
  .parties { display: flex; gap: 40px; margin-bottom: 40px; }
  .party { flex: 1; }
  .party h3 { margin: 0 0 8px; font-size: 11px; color: #6b7280; text-transform: uppercase; }
  .description { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
  .totals { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 24px; }
  .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
  .totals-row.total { padding-top: 16px; border-top: 2px solid #e5e7eb; font-size: 20px; font-weight: 700; color: #059669; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .paid { background: #d1fae5; color: #065f46; }
  .issued { background: #dbeafe; color: #1e40af; }
  .overdue { background: #fee2e2; color: #991b1b; }
</style></head><body>
  <div class="header">
    <div class="logo">Gastrux</div>
    <div class="invoice-number">
      <h1>${invoice.number}</h1>
      <p>Emitida em ${new Date(invoice.createdAt).toLocaleDateString('pt-BR')}</p>
      <p><span class="status ${invoice.status === 'PAID' ? 'paid' : invoice.status === 'OVERDUE' ? 'overdue' : 'issued'}">${invoice.status}</span></p>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <h3>De</h3>
      <p><strong>Gastrux</strong></p>
    </div>
    <div class="party">
      <h3>Para</h3>
      <p><strong>${invoice.customerName}</strong></p>
      <p>${invoice.customerEmail}</p>
      ${invoice.customerDocument ? `<p>${invoice.customerDocument}</p>` : ''}
    </div>
  </div>
  <div class="description">
    <h3>Descrição</h3>
    <p>${invoice.description}</p>
  </div>
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${invoice.currency} ${subtotal.toFixed(2)}</span></div>
    ${tax > 0 ? `<div class="totals-row"><span>Impostos</span><span>${invoice.currency} ${tax.toFixed(2)}</span></div>` : ''}
    ${discount > 0 ? `<div class="totals-row"><span>Desconto</span><span>- ${invoice.currency} ${discount.toFixed(2)}</span></div>` : ''}
    <div class="totals-row total"><span>Total</span><span>${invoice.currency} ${total.toFixed(2)}</span></div>
  </div>
</body></html>`
}
