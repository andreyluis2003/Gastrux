import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/admin/guard';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/email/transactional';
import { agentEmailHtml, whatsappUrl } from '@/lib/agents/activation/deliver';

export const dynamic = 'force-dynamic';

const DECIDED = 'Esta mensagem já foi decidida';

/**
 * PATCH /api/admin/agent-actions/[id] { action: 'approve' | 'discard', text?, subject? } - the platform team
 * decides a draft of the activation agent (spec 2026-10-27). The status leaves DRAFT before anything is
 * sent, so a double click sends once; an e-mail that fails goes back to DRAFT with the error. An e-mail
 * goes out here; a WhatsApp comes back as a wa.me link for the team to send (the official number is stage 2).
 * Only while the account is still in trial and the owner did not ask to stop.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { response, user } = await requirePlatformAdmin();
  if (response) return response;
  const decidedBy = String(user.email || user.id || 'equipe');

  const body = await req.json().catch(() => ({}));
  if (!['approve', 'discard'].includes(body.action)) {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  }

  const action = await prisma.agentAction.findUnique({ where: { id: params.id } });
  if (!action || action.channel === 'OWNER_ALERT') return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
  if (action.status !== 'DRAFT') return NextResponse.json({ error: DECIDED }, { status: 409 });

  if (body.action === 'discard') {
    const { count } = await prisma.agentAction.updateMany({ where: { id: action.id, status: 'DRAFT' }, data: { status: 'DISCARDED', decidedBy } });
    if (count === 0) return NextResponse.json({ error: DECIDED }, { status: 409 });
    return NextResponse.json({ status: 'DISCARDED' });
  }

  const owner = await prisma.user.findUnique({ where: { id: action.userId }, select: { id: true, email: true, whatsapp: true, onboardingEmailsOptOut: true } });
  if (!owner || owner.onboardingEmailsOptOut) {
    return NextResponse.json({ error: 'O cliente pediu para parar as mensagens' }, { status: 409 });
  }
  // A draft can wait in the queue while the client subscribes or the account closes (final review I-2)
  const restaurant = await prisma.restaurant.findUnique({ where: { id: action.restaurantId }, select: { status: true } });
  if (restaurant?.status !== 'TRIAL') {
    return NextResponse.json({ error: 'O cliente não está mais em teste' }, { status: 409 });
  }
  if (action.channel === 'WHATSAPP' && !owner.whatsapp) return NextResponse.json({ error: 'O cliente não tem WhatsApp' }, { status: 409 });
  const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : action.text;
  const subject = typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim() : action.subject;

  const { count } = await prisma.agentAction.updateMany({
    where: { id: action.id, status: 'DRAFT' },
    data: { status: 'SENT', decidedBy, sentAt: new Date(), text, subject, error: null },
  });
  if (count === 0) return NextResponse.json({ error: DECIDED }, { status: 409 });

  if (action.channel === 'WHATSAPP') {
    return NextResponse.json({ status: 'SENT', waUrl: whatsappUrl(owner.whatsapp!, text) });
  }

  try {
    await sendTransactionalEmail({ to: owner.email, subject: subject || 'Gastrux', html: agentEmailHtml(text, owner.id), notificationId: `agent-${action.trigger}` });
    return NextResponse.json({ status: 'SENT' });
  } catch (err: any) {
    // Back to the queue with the edits and the error, to try again (final review I-4)
    await prisma.agentAction.update({
      where: { id: action.id },
      data: { status: 'DRAFT', sentAt: null, decidedBy: null, error: String(err?.message || err).slice(0, 500) },
    });
    return NextResponse.json({ error: 'Não foi possível enviar o e-mail' }, { status: 502 });
  }
}
