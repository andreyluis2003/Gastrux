import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/email/transactional';

/**
 * End-of-trial reminders (spec 2026-10-18 §5): with 7, 3 and 1 days left (days 23, 27 and 30 of 30) the
 * restaurant gets a bell alert and the owner an e-mail, once per milestone. Runs daily from the VPS cron.
 */
const DAY_MS = 86_400_000;
const MILESTONES = [1, 3, 7];

const titleFor = (milestone: number) => (milestone === 1 ? 'Último dia do seu teste' : `Faltam ${milestone} dias do seu teste`);
const brDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function emailHtml(name: string, title: string, ends: Date) {
  return [
    `<p>Olá, ${escapeHtml(name)}.</p>`,
    `<p>${title}: o teste do Gastrux com tudo do Business termina em ${brDate(ends)}.</p>`,
    '<p>Escolha um plano para continuar vendendo sem parar: Pro R$ 149 ou Business R$ 199 por mês.</p>',
    '<p><a href="https://gastrux.com/pricing">Escolher plano</a></p>',
  ].join('');
}

export async function sendTrialReminders(now = new Date()): Promise<{ sent: number }> {
  const trials = await prisma.restaurant.findMany({
    where: { isInternal: false, subscriptionStatus: 'trialing', trialEndsAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY_MS) } },
    select: { id: true, name: true, ownerId: true, trialEndsAt: true },
  });
  let sent = 0;
  for (const r of trials) {
    const daysLeft = Math.ceil((r.trialEndsAt!.getTime() - now.getTime()) / DAY_MS);
    const milestone = MILESTONES.find((m) => m >= daysLeft);
    if (!milestone) continue;
    const dedupeKey = `trial-reminder:${r.id}:${milestone}`;
    const existing = await prisma.notification.findFirst({ where: { restaurantId: r.id, data: { path: ['dedupeKey'], equals: dedupeKey } }, select: { id: true } });
    if (existing) continue;
    const title = titleFor(milestone);
    const notification = await prisma.notification.create({
      data: {
        restaurantId: r.id, type: 'SYSTEM_INFO', severity: milestone === 7 ? 'MEDIUM' : 'HIGH', title,
        message: `O teste com tudo do Business termina em ${brDate(r.trialEndsAt!)}. Depois disso o sistema fica só para consulta até você escolher um plano.`,
        actionUrl: '/pricing', actionLabel: 'Escolher plano', data: { kind: 'trial-reminder', dedupeKey, milestone },
      },
    });
    sent++;
    const owner = await prisma.user.findUnique({ where: { id: r.ownerId }, select: { email: true, name: true } });
    if (!owner?.email) continue;
    try {
      await sendTransactionalEmail({ to: owner.email, subject: title, html: emailHtml(owner.name || r.name, title, r.trialEndsAt!), notificationId: notification.id });
    } catch (error) {
      console.error(`[trial-reminders] e-mail to the owner of ${r.id} failed`, error);
    }
  }
  return { sent };
}
