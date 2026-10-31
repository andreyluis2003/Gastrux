/**
 * The conversations of the Gastrux official number: what clients answer reaches the agent's queue, is never
 * handed to a restaurant's order bot, and the team answers there. WhatsApp only allows free text within 24
 * hours of the client's last message; after that, only an approved template (Meta's rule).
 */
import type { AgentWhatsAppMessage } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { platformTeam } from '../platform-team';
import { sendPlatformText } from './client';
import { phoneKey, phoneVariants } from './numbers';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const STOP_WORDS = new Set(['SAIR', 'PARAR', 'STOP']);
const STOP_REPLY = 'Pronto, não vamos mais mandar dicas por aqui. Se precisar de ajuda, é só escrever.';

export class WindowClosedError extends Error {
  constructor() {
    super('Passaram 24 horas desde a última mensagem do cliente');
  }
}

/** The client who owns a number, with their restaurant */
async function clientOf(waId: string) {
  const user = await prisma.user.findFirst({ where: { whatsapp: { in: phoneVariants(waId) } }, select: { id: true, name: true } });
  if (!user) return null;
  const restaurant = await prisma.restaurant.findFirst({ where: { ownerId: user.id }, select: { id: true, name: true } });
  return { user, restaurant };
}

export async function windowOpen(phone: string, now = new Date()): Promise<boolean> {
  const last = await prisma.agentWhatsAppMessage.findFirst({
    where: { phone: phoneKey(phone), direction: 'IN' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return !!last && now.getTime() - last.createdAt.getTime() < WINDOW_MS;
}

/** Records an outgoing message that Meta accepted */
export function recordOutbound(data: { waId: string; text: string; waMessageId: string; messageType: string; userId?: string | null; restaurantId?: string | null; agentActionId?: string; sentBy?: string }) {
  return prisma.agentWhatsAppMessage.create({ data: { ...data, phone: phoneKey(data.waId), direction: 'OUT', status: 'sent' } });
}

async function tellTeam(title: string, message: string, data: Record<string, string>, severity: 'LOW' | 'HIGH' = 'HIGH') {
  for (const member of await platformTeam()) {
    await prisma.notification.create({
      data: { userId: member.id, restaurantId: member.currentRestaurantId, type: 'SYSTEM_INFO', severity, title, message, actionUrl: '/admin/agente', actionLabel: 'Abrir a conversa', data: { agent: 'whatsapp', ...data } },
    });
  }
}

export function inboundText(msg: any): string {
  if (msg.type === 'text') return msg.text?.body || '';
  if (msg.type === 'button') return msg.button?.text || '[botão]';
  if (msg.type === 'interactive') return msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[botão]';
  return `[${msg.type}]`;
}

/** One message from a client. A number Meta delivers twice is recorded and handled once. */
export async function handleInbound(msg: any, profileName?: string): Promise<void> {
  const waId = String(msg.from);
  const text = inboundText(msg).slice(0, 4000);
  const client = await clientOf(waId);
  const { count } = await prisma.agentWhatsAppMessage.createMany({
    data: [{ phone: phoneKey(waId), waId, userId: client?.user.id, restaurantId: client?.restaurant?.id, direction: 'IN', text, messageType: String(msg.type || 'text'), waMessageId: msg.id }],
    skipDuplicates: true,
  });
  if (count === 0) return;

  const who = client?.restaurant?.name || client?.user.name || profileName || waId;
  if (STOP_WORDS.has(text.trim().toUpperCase())) {
    if (client) await prisma.user.update({ where: { id: client.user.id }, data: { onboardingEmailsOptOut: true } });
    const waMessageId = await sendPlatformText(waId, STOP_REPLY);
    await recordOutbound({ waId, text: STOP_REPLY, waMessageId, messageType: 'text', userId: client?.user.id, restaurantId: client?.restaurant?.id });
    await tellTeam('Cliente pediu para parar as mensagens', `${who} respondeu ${text.trim()} no WhatsApp.`, { phone: phoneKey(waId) }, 'LOW');
    return;
  }
  await tellTeam(`WhatsApp de ${who}`, text.slice(0, 200), { phone: phoneKey(waId) });
}

/** Delivered, read or failed. A failure the client never sees has to reach the team. */
export async function handleStatus(status: any): Promise<void> {
  const failed = status.status === 'failed';
  const error = failed ? String(status.errors?.[0]?.error_data?.details || status.errors?.[0]?.title || 'Não entregue').slice(0, 300) : null;
  const row = await prisma.agentWhatsAppMessage.findUnique({ where: { waMessageId: String(status.id) } });
  // A late "delivered" must not overwrite "read" or "failed"
  if (!row || row.status === 'failed' || (row.status === 'read' && !failed)) return;
  await prisma.agentWhatsAppMessage.update({ where: { id: row.id }, data: { status: String(status.status), error } });
  if (failed) await tellTeam('WhatsApp não entregue', `${row.phone}: ${error}`, { phone: row.phone });
}

/** A team member's answer, within the 24-hour window */
export async function reply(phone: string, text: string, sentBy: string, now = new Date()) {
  const key = phoneKey(phone);
  const last = await prisma.agentWhatsAppMessage.findFirst({ where: { phone: key, direction: 'IN' }, orderBy: { createdAt: 'desc' } });
  if (!last || now.getTime() - last.createdAt.getTime() >= WINDOW_MS) throw new WindowClosedError();
  const waMessageId = await sendPlatformText(last.waId, text);
  return recordOutbound({ waId: last.waId, text, waMessageId, messageType: 'text', userId: last.userId, restaurantId: last.restaurantId, sentBy });
}

export interface ConversationSummary {
  phone: string;
  name: string;
  restaurantId: string | null;
  lastText: string;
  lastDirection: 'IN' | 'OUT';
  lastAt: Date;
  unread: number;
  windowOpen: boolean;
}

/** Conversations with the newest first, from the latest messages */
export async function listConversations(now = new Date()): Promise<ConversationSummary[]> {
  const rows = await prisma.agentWhatsAppMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
  const byPhone = new Map<string, AgentWhatsAppMessage[]>();
  for (const row of rows) byPhone.set(row.phone, [...(byPhone.get(row.phone) ?? []), row]);

  const ids = rows.map((r) => r.restaurantId).filter((x): x is string => !!x);
  const restaurants = await prisma.restaurant.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  const names = new Map(restaurants.map((r) => [r.id, r.name]));

  return [...byPhone.entries()].map(([phone, list]) => {
    const restaurantId = list.find((m) => m.restaurantId)?.restaurantId ?? null;
    const lastIn = list.find((m) => m.direction === 'IN');
    return {
      phone,
      name: (restaurantId && names.get(restaurantId)) || `+${list[0].waId}`,
      restaurantId,
      lastText: list[0].text,
      lastDirection: list[0].direction,
      lastAt: list[0].createdAt,
      unread: list.filter((m) => m.direction === 'IN' && !m.readAt).length,
      windowOpen: !!lastIn && now.getTime() - lastIn.createdAt.getTime() < WINDOW_MS,
    };
  });
}

/** A conversation, oldest first; opening it marks the client's messages as read */
export async function openConversation(phone: string) {
  const key = phoneKey(phone);
  await prisma.agentWhatsAppMessage.updateMany({ where: { phone: key, direction: 'IN', readAt: null }, data: { readAt: new Date() } });
  const messages = await prisma.agentWhatsAppMessage.findMany({ where: { phone: key }, orderBy: { createdAt: 'desc' }, take: 200 });
  return messages.reverse();
}
