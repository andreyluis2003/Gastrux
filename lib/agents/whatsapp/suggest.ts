/**
 * The suggested reply for a conversation of the official number (spec 2026-11-09): made once per client
 * message and stored, settled when the team sends or discards, and counted over the last 14 days.
 */
import type { AgentReplySuggestion } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAnthropic } from '@/lib/ai/client';
import { aiModels, estimateCostUsd } from '@/lib/ai/config';
import { KNOWLEDGE } from '@/lib/ai/knowledge';
import { restaurantTier } from '@/lib/tier-guard';
import { loadActivationSignals } from '../activation/signals';
import { WINDOW_MS } from './conversation';
import { phoneKey } from './numbers';
import {
  nonTextReason, parseReply, pendingClientMessages, replySystemPrompt, replyUserPrompt, sameEnough, validReplyText,
  type ClientContext, type ReplyMessage,
} from './reply-rules';

export type SuggestionView =
  | { state: 'none' }
  | { state: 'unavailable' }
  | { state: 'ready'; id: string; kind: 'SUGGESTION' | 'TEAM' | 'FAILED'; text: string | null; reason: string | null };

const STATS_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function view(row: AgentReplySuggestion): SuggestionView {
  return { state: 'ready', id: row.id, kind: row.kind as 'SUGGESTION' | 'TEAM' | 'FAILED', text: row.text, reason: row.reason };
}

export async function getOrCreateSuggestion(
  phone: string,
  opts: { regenerate?: boolean; by?: string; now?: Date } = {},
): Promise<SuggestionView> {
  const now = opts.now ?? new Date();
  const key = phoneKey(phone);

  const rows = await prisma.agentWhatsAppMessage.findMany({ where: { phone: key }, orderBy: { createdAt: 'desc' }, take: 20 });
  rows.reverse();
  const last = rows[rows.length - 1];
  if (!last || last.direction !== 'IN') return { state: 'none' };
  if (now.getTime() - last.createdAt.getTime() >= WINDOW_MS) return { state: 'none' };

  const stored = await prisma.agentReplySuggestion.findFirst({ where: { phone: key, forMessageId: last.id }, orderBy: { createdAt: 'desc' } });
  if (stored && !opts.regenerate) {
    // The team chose "Descartar": reopening must not bring the draft back
    if (stored.kind === 'SUGGESTION' && stored.outcome === 'discarded') return { state: 'none' };
    return view(stored);
  }
  // Regenerating replaces the pending draft, but only once a new one can actually be made
  const discardPrevious = () => opts.regenerate
    ? prisma.agentReplySuggestion.updateMany({
        where: { phone: key, forMessageId: last.id, kind: 'SUGGESTION', outcome: 'pending' },
        data: { outcome: 'discarded', decidedBy: opts.by ?? null },
      })
    : Promise.resolve();

  const messages: ReplyMessage[] = rows.map((m) => ({
    id: m.id, direction: m.direction as 'IN' | 'OUT', text: m.text, messageType: m.messageType, createdAt: m.createdAt,
  }));
  const base = { phone: key, forMessageId: last.id, forMessageAt: last.createdAt };

  const nonText = nonTextReason(pendingClientMessages(messages));
  if (nonText) {
    await discardPrevious();
    return view(await prisma.agentReplySuggestion.create({ data: { ...base, kind: 'TEAM', reason: nonText, outcome: 'team', costUsd: 0 } }));
  }

  const client = getAnthropic();
  if (!client) return { state: 'unavailable' };

  const restaurantId = [...rows].reverse().find((m) => m.restaurantId)?.restaurantId;
  let ctx: ClientContext = { kind: 'visitor' };
  if (restaurantId) {
    try {
      const signals = await loadActivationSignals(restaurantId, now);
      if (signals) ctx = { kind: 'client', signals, tier: await restaurantTier(restaurantId) };
    } catch (e) {
      // A visitor prompt would pitch the product to a real client, so make no suggestion at all
      console.error('[agent-suggest] signals failed:', e instanceof Error ? e.message : e);
      return { state: 'unavailable' };
    }
  }
  await discardPrevious();

  const model = aiModels().default;
  let costUsd = 0;
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 700,
      system: [{ type: 'text', text: replySystemPrompt(KNOWLEDGE), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: replyUserPrompt(ctx, messages, now) }],
    });
    if (res.usage) costUsd = estimateCostUsd(model, res.usage);
    const raw = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    const parsed = parseReply(raw);
    if (parsed?.kind === 'SUGGESTION' && validReplyText(parsed.text)) {
      return view(await prisma.agentReplySuggestion.create({ data: { ...base, kind: 'SUGGESTION', text: parsed.text, model, costUsd, outcome: 'pending' } }));
    }
    if (parsed?.kind === 'TEAM') {
      return view(await prisma.agentReplySuggestion.create({ data: { ...base, kind: 'TEAM', reason: parsed.reason, model, costUsd, outcome: 'team' } }));
    }
  } catch (e) {
    console.error('[agent-reply] suggestion failed', e);
  }
  return view(await prisma.agentReplySuggestion.create({ data: { ...base, kind: 'FAILED', model, costUsd, outcome: 'failed' } }));
}

export async function discardSuggestion(phone: string, id: string, by: string): Promise<void> {
  await prisma.agentReplySuggestion.updateMany({
    where: { id, phone: phoneKey(phone), kind: 'SUGGESTION', outcome: 'pending' },
    data: { outcome: 'discarded', decidedBy: by },
  });
}

/** Only the suggestion the team actually had on screen (by id) is settled; a message typed from scratch settles nothing. */
export async function settleSuggestion(phone: string, id: string | undefined, sentText: string, sentMessageId: string, by: string): Promise<void> {
  if (!id) return;
  const row = await prisma.agentReplySuggestion.findFirst({ where: { id, phone: phoneKey(phone), kind: 'SUGGESTION', outcome: 'pending' } });
  if (!row) return;
  await prisma.agentReplySuggestion.updateMany({
    where: { id, outcome: 'pending' },
    data: { outcome: row.text && sameEnough(row.text, sentText) ? 'sent_as_is' : 'sent_edited', sentMessageId, decidedBy: by },
  });
}

export async function suggestionStats(now = new Date()): Promise<{ made: number; asIs: number; edited: number; discarded: number; team: number }> {
  await prisma.agentReplySuggestion.updateMany({
    where: { kind: 'SUGGESTION', outcome: 'pending', forMessageAt: { lt: new Date(now.getTime() - WINDOW_MS) } },
    data: { outcome: 'expired' },
  });
  const since = new Date(now.getTime() - STATS_DAYS * DAY_MS);
  const count = (where: object) => prisma.agentReplySuggestion.count({ where: { createdAt: { gte: since }, ...where } });
  const [made, asIs, edited, discarded, team] = await Promise.all([
    count({ kind: 'SUGGESTION' }),
    count({ outcome: 'sent_as_is' }),
    count({ outcome: 'sent_edited' }),
    count({ outcome: 'discarded' }),
    count({ kind: 'TEAM' }),
  ]);
  return { made, asIs, edited, discarded, team };
}
