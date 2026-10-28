/**
 * The activation agent's routine (spec 2026-10-27), called every 5 minutes by the VPS cron. For each trial
 * account: read the signals, decide, write the text, and record it as an AgentAction. Client messages
 * wait as DRAFT in the approval queue (/admin/agente); owner alerts are SENT to the platform team at once
 * (bell and e-mail). The unique index (account x agent x trigger x channel) with skipDuplicates makes a
 * rerun, or two runs at the same time, record each message once.
 */
import type { AgentChannel, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getPlatformAdminEmails } from '@/lib/admin/guard';
import { sendTransactionalEmail } from '@/lib/email/transactional';
import { TRIGGER_LABELS, decide, type ActivationDecision, type ActivationSignals } from './rules';
import { listTrialRestaurantIds, loadActivationSignals } from './signals';
import { writeActivationMessage } from './writer';

export interface ActivationRunResult { drafted: number; alerts: number; skipped: number }

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The platform team: role ADMIN or listed in PLATFORM_ADMIN_EMAILS */
async function platformTeam() {
  const emails = getPlatformAdminEmails();
  return prisma.user.findMany({
    where: { OR: [{ role: 'ADMIN' }, ...(emails.length ? [{ email: { in: emails } }] : [])] },
    select: { id: true, email: true, currentRestaurantId: true },
    take: 20,
  });
}

/** Inserts one row; true when this run recorded it (false: it already existed) */
async function insert(row: Prisma.AgentActionCreateManyInput): Promise<boolean> {
  const { count } = await prisma.agentAction.createMany({ data: [row], skipDuplicates: true });
  return count === 1;
}

async function tellTeam(s: ActivationSignals, d: ActivationDecision, title: string, message: string, email?: { subject: string; text: string }) {
  const team = await platformTeam();
  for (const member of team) {
    // The bell lists the notifications of the restaurant the person has open
    await prisma.notification.create({
      data: {
        userId: member.id, restaurantId: member.currentRestaurantId, type: 'SYSTEM_INFO', severity: d.ownerAlert ? 'HIGH' : 'LOW',
        title, message, actionUrl: '/admin/agente', actionLabel: 'Abrir a fila',
        data: { agent: 'activation', trigger: d.trigger, restaurantId: s.restaurantId },
      },
    });
    if (email && member.email) {
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${escapeHtml(email.text).replace(/\n/g, '<br>')}</div>`;
      await sendTransactionalEmail({ to: member.email, subject: email.subject, html, notificationId: 'agent-owner-alert' }).catch((err) =>
        console.error('[activation-agent] owner alert e-mail failed:', err),
      );
    }
  }
}

export async function runActivationAgent(now = new Date(), opts: { only?: string[] } = {}): Promise<ActivationRunResult> {
  const result: ActivationRunResult = { drafted: 0, alerts: 0, skipped: 0 };
  const ids = opts.only ?? (await listTrialRestaurantIds(now));

  for (const id of ids) {
    try {
      const s = await loadActivationSignals(id, now);
      const d = s ? decide(s, now) : null;
      if (!s || !d) {
        result.skipped++;
        continue;
      }
      const base = { restaurantId: s.restaurantId, userId: s.ownerId, agent: 'activation', trigger: d.trigger, data: { stepsDone: s.stepsDone, reason: d.reason } };

      if (d.ownerAlert) {
        const m = await writeActivationMessage(s, d, 'OWNER_ALERT', now);
        if (await insert({ ...base, channel: 'OWNER_ALERT', status: 'SENT', subject: m.subject, text: m.text, sentAt: now })) {
          result.alerts++;
          await tellTeam(s, d, m.subject ?? TRIGGER_LABELS[d.trigger], m.text.split('\n')[0], { subject: m.subject ?? TRIGGER_LABELS[d.trigger], text: m.text });
        }
        continue;
      }

      // The fixed welcome e-mail stays (owner decision 2026-10-27), so the agent welcomes by WhatsApp only
      const emailToo = d.trigger !== 'boas_vindas';
      const channels: AgentChannel[] = [...(s.email && emailToo ? ['EMAIL' as const] : []), ...(s.whatsapp ? ['WHATSAPP' as const] : [])];
      // The first channel's row decides who tells the team, so two runs at once notify once
      let first = true;
      let notify = false;
      for (const channel of channels) {
        const m = await writeActivationMessage(s, d, channel as 'EMAIL' | 'WHATSAPP', now);
        const inserted = await insert({ ...base, channel, status: 'DRAFT', subject: m.subject, text: m.text, costUsd: m.costUsd });
        if (inserted) result.drafted++;
        if (first) notify = inserted;
        first = false;
      }
      if (channels.length === 0) result.skipped++;
      if (notify) {
        const title = d.trigger === 'boas_vindas' ? 'Novo cliente: mandar boas-vindas' : `Mensagem para aprovar: ${TRIGGER_LABELS[d.trigger]}`;
        await tellTeam(s, d, title, `${s.restaurantName}: ${d.reason}.`);
      }
    } catch (err) {
      console.error('[activation-agent] account failed:', id, err);
      result.skipped++;
    }
  }
  return result;
}
