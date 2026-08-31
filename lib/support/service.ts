// @ts-nocheck
import { prisma } from '@/lib/db'
import { sendNotificationEmail } from '@/lib/email-service'
import { isPlatformAdminIdentity, getPlatformAdminEmails } from '@/lib/admin/guard'

function ticketConfirmationEmail(ticket: any, userName: string): string {
  const appUrl = process.env.NEXTAUTH_URL || ''
  const url = appUrl ? `${appUrl}/suporte/${ticket.id}` : ''
  return `<html><body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#f3f4f6;">
    <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
      <div style="background:#fff;border-radius:12px;padding:32px;">
        <div style="background:linear-gradient(135deg,#0ea5e9,#2563eb);border-radius:12px;padding:32px;margin:-32px -32px 24px;color:#fff;">
          <h1 style="margin:0;font-size:24px;">Ticket recebido — estamos no caso!</h1>
          <p style="margin:8px 0 0;opacity:.9;">Olá ${userName}, abrimos seu ticket de suporte.</p>
        </div>
        <p style="color:#374151;line-height:1.6;">Nossa equipe responderá o mais rápido possível.</p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">ASSUNTO</p>
          <p style="margin:0 0 12px;font-weight:600;">${ticket.subject}</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">CATEGORIA · PRIORIDADE</p>
          <p style="margin:0;">${ticket.category} · ${ticket.priority}</p>
        </div>
        ${url ? `<p style="text-align:center;"><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;">Acompanhar ticket</a></p>` : ''}
      </div>
    </div>
  </body></html>`
}

function ticketAdminNotifyEmail(ticket: any, openedByName: string, restaurantName: string): string {
  const appUrl = process.env.NEXTAUTH_URL || ''
  const url = appUrl ? `${appUrl}/admin/support/${ticket.id}` : ''
  const colors: Record<string,string> = { URGENT:'#dc2626', HIGH:'#f59e0b', NORMAL:'#2563eb', LOW:'#6b7280' }
  const color = colors[ticket.priority] || '#2563eb'
  const desc = (ticket.description || ticket.firstMessage || '').slice(0,500)
  return `<html><body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#f3f4f6;">
    <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
      <div style="background:#fff;border-radius:12px;padding:32px;">
        <h2 style="margin:0 0 16px;">Novo ticket de suporte</h2>
        <div style="background:${color}15;border-left:4px solid ${color};padding:12px 16px;border-radius:4px;margin:0 0 16px;">
          <p style="margin:0;color:${color};font-weight:600;">Prioridade: ${ticket.priority}</p>
        </div>
        <p style="color:#6b7280;font-size:14px;margin:0 0 4px;">Cliente</p>
        <p style="font-weight:600;margin:0 0 12px;">${openedByName} · ${restaurantName}</p>
        <p style="color:#6b7280;font-size:14px;margin:0 0 4px;">Assunto</p>
        <p style="margin:0 0 12px;">${ticket.subject}</p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:0 0 16px;white-space:pre-wrap;color:#374151;">${desc}</div>
        ${url ? `<a href="${url}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;">Abrir no admin</a>` : ''}
      </div>
    </div>
  </body></html>`
}

export async function createTicket(params: {
  openedById: string
  restaurantId: string
  subject: string
  description: string
  category: string
  priority: string
}) {
  const categoryMap: Record<string, string> = {
    DUVIDA: 'OTHER',
    TECNICO: 'TECHNICAL',
    BUG: 'BUG_REPORT',
    COBRANCA: 'BILLING',
    MELHORIA: 'FEATURE_REQUEST',
    OUTRO: 'OTHER',
  }
  const category = categoryMap[params.category] || params.category

  const user = await prisma.user.findUnique({ where: { id: params.openedById } })
  const restaurant = await prisma.restaurant.findUnique({ where: { id: params.restaurantId } })
  if (!user || !restaurant) throw new Error('Usuário ou restaurante inválido')

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: params.openedById,
      restaurantId: params.restaurantId,
      subject: params.subject,
      category,
      priority: params.priority,
      status: 'OPEN',
      messages: {
        create: {
          senderId: params.openedById,
          senderRole: 'customer',
          body: params.description,
          internal: false,
        },
      },
    },
    include: {
      messages: { include: { sender: { select: { id: true, name: true, email: true, role: true } } } },
      user: { select: { id: true, name: true, email: true } },
      restaurant: { select: { id: true, name: true } },
    },
  })

  try {
    if (user.email && process.env.NOTIF_ID_TICKET_DE_SUPORTE_CONFIRMAO) {
      await sendNotificationEmail({
        notificationId: process.env.NOTIF_ID_TICKET_DE_SUPORTE_CONFIRMAO,
        subject: `Ticket #${String(ticket.number).padStart(4, '0')} recebido — ${params.subject}`,
        htmlBody: ticketConfirmationEmail({ ...ticket, description: params.description }, user.name || 'Cliente'),
        recipientEmail: user.email,
      })
    }
  } catch (err) {
    console.error('[SUPPORT] Email confirmação:', err)
  }

  try {
    const platformAdminEmails = getPlatformAdminEmails()
    const admins = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          ...(platformAdminEmails.length ? [{ email: { in: platformAdminEmails } }] : []),
        ],
      },
      select: { email: true },
      take: 10,
    })
    if (process.env.NOTIF_ID_NOVO_TICKET_DE_SUPORTE_ADMIN) {
      for (const admin of admins) {
        if (!admin.email) continue
        await sendNotificationEmail({
          notificationId: process.env.NOTIF_ID_NOVO_TICKET_DE_SUPORTE_ADMIN,
          subject: `[${params.priority}] Novo ticket — ${params.subject}`,
          htmlBody: ticketAdminNotifyEmail({ ...ticket, description: params.description }, user.name || 'Cliente', restaurant.name),
          recipientEmail: admin.email,
        })
      }
    }
  } catch (err) {
    console.error('[SUPPORT] Notificar admin:', err)
  }

  return ticket
}

export async function addMessage(params: {
  ticketId: string
  authorId: string
  body: string
  isInternal?: boolean
}) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: params.ticketId } })
  if (!ticket) throw new Error('Ticket não encontrado')

  const author = await prisma.user.findUnique({ where: { id: params.authorId } })
  const senderRole = isPlatformAdminIdentity(author?.role, author?.email) ? 'agent' : 'customer'

  const msg = await prisma.supportMessage.create({
    data: {
      ticketId: params.ticketId,
      senderId: params.authorId,
      senderRole,
      body: params.body,
      internal: params.isInternal ?? false,
    },
    include: { sender: { select: { id: true, name: true, email: true, role: true } } },
  })

  const updateData: any = { updatedAt: new Date(), lastActivityAt: new Date() }
  if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') updateData.status = 'OPEN'
  else if (ticket.status === 'OPEN' && senderRole === 'agent') updateData.status = 'IN_PROGRESS'
  if (!ticket.firstResponseAt && senderRole === 'agent') updateData.firstResponseAt = new Date()

  await prisma.supportTicket.update({ where: { id: params.ticketId }, data: updateData })
  return msg
}

export async function listUserTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { messages: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  })
}

export async function listTicketsForAdmin(filters: {
  status?: string
  priority?: string
  assignedToId?: string
  q?: string
}) {
  const where: any = {}
  if (filters.status) where.status = filters.status
  if (filters.priority) where.priority = filters.priority
  if (filters.assignedToId) where.assignedToId = filters.assignedToId
  if (filters.q) {
    where.OR = [
      { subject: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  return prisma.supportTicket.findMany({
    where,
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    include: {
      user: { select: { id: true, name: true, email: true } },
      restaurant: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
    take: 200,
  })
}

export async function getTicket(id: string) {
  return prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      restaurant: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
  })
}

export async function updateTicket(id: string, data: any) {
  const updateData: any = { ...data }
  if (data.status === 'RESOLVED' || data.status === 'CLOSED') {
    updateData.resolvedAt = new Date()
    if (data.status === 'CLOSED') updateData.closedAt = new Date()
  }
  return prisma.supportTicket.update({
    where: { id },
    data: updateData,
    include: { assignedTo: { select: { id: true, name: true } } },
  })
}
