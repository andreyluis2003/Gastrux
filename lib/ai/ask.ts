import { effectiveTier } from '@/lib/tier-guard';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import type { RestaurantMember } from '@/lib/auth/restaurant-role';
import { getAnthropic } from './client';
import { aiModels, DETAILED_TIERS, estimateCostUsd, MAX_ROUNDS, monthlyLimit } from './config';
import { buildUserMessage, SYSTEM_PROMPT } from './prompt';
import { isManagerRole, toolsFor, type AiRole } from './tools/defs';
import { attachmentBlocks, attachmentSummary, validateAttachments, type Attachment } from './attachments';
import { runTool } from './tools/run';
import { TOOL_KIND, type DraftKind } from './drafts/service';
import { questionsThisMonth, recentRate } from './usage';

const inFlight = new Set<string>();
const UNAVAILABLE = 'A IA está indisponível agora. Tente em instantes.';

/** One question: checks, the tool loop, the log (spec 2026-10-16 ia-assistente §4.1-§4.6) */
export async function askQuestion(member: RestaurantMember, body: unknown, now = new Date()) {
  const b = (body ?? {}) as { question?: unknown; history?: unknown; detailed?: unknown; attachments?: unknown };
  const question = typeof b.question === 'string' ? b.question.trim() : '';
  if (!question || question.length > 1000) return { status: 400, body: { error: 'Escreva uma pergunta de até 1.000 caracteres.' } };
  // Photos or a PDF of the menu: owner and manager only, checked before any AI call (spec 2026-10-17 ia-implantacao §4.1)
  const att = validateAttachments(b.attachments);
  if (!att.ok) return { status: 400, body: { error: att.error } };
  if (att.list.length && !isManagerRole(member.role)) return { status: 403, body: { error: 'Anexos são do dono e do gerente.' } };
  const client = getAnthropic();
  if (!client) return { status: 503, body: { notConfigured: true, error: 'IA ainda não configurada.' } };
  // Taken before any await, so two requests of the same user can never both pass
  if (inFlight.has(member.userId)) return { status: 409, body: { error: 'Aguarde a resposta anterior.' } };
  inFlight.add(member.userId);
  try {
    return await ask(client, member, b, question, att.list, now);
  } finally {
    inFlight.delete(member.userId);
  }
}

async function ask(client: Anthropic, member: RestaurantMember, b: { history?: unknown; detailed?: unknown }, question: string, attachments: Attachment[], now: Date) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: member.restaurantId }, select: { name: true, subscriptionTier: true, isInternal: true, createdAt: true } });
  const tier = effectiveTier(restaurant).toLowerCase();
  const detailed = b.detailed === true;
  if (detailed && !DETAILED_TIERS.includes(tier)) return { status: 403, body: { error: 'A análise detalhada é do plano Pro.', upgradeUrl: '/pricing' } };
  const limit = monthlyLimit(tier);
  const models = aiModels();
  // Reading a menu needs the detailed model on any plan: one-off, and prices must be right
  const withFiles = attachments.length > 0;
  const model = detailed || withFiles ? models.detailed : models.default;

  // Check the limits and reserve the question in one step, per restaurant: a question still
  // running already counts toward the month and the 10/min rate (parallel requests cannot pass)
  const gate = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ai-ask:' + member.restaurantId}))`;
    // Plans of 2026-10-18: no free onboarding questions any more, the trial already has the Business 350
    const used = await questionsThisMonth(member.restaurantId, now, tx);
    if (limit !== null && used >= limit) {
      return { refused: { status: 429, body: { error: `Você usou as ${limit} perguntas do mês do plano ${tier}.`, used, limit, upgradeUrl: '/pricing' } } };
    }
    if ((await recentRate(member.restaurantId, now, tx)) >= 10) {
      return { refused: { status: 429, body: { error: 'Muitas perguntas em sequência. Tente em um minuto.', used, limit } } };
    }
    const row = await tx.aiQuestion.create({
      data: { restaurantId: member.restaurantId, userId: member.userId, role: member.role, question, model, detailed, counted: true, free: false,
        attachments: attachmentSummary(attachments) ?? undefined },
      select: { id: true },
    });
    return { used, id: row.id };
  });
  if ('refused' in gate) return gate.refused!;
  const { used, id } = gate as { used: number; id: string };

  const history = Array.isArray(b.history)
    ? (b.history as any[]).filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string').map((m) => ({ role: m.role, content: m.content }))
    : [];
  const tools = toolsFor(member.role as AiRole);
  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: (() => {
      const text = buildUserMessage({ question, history, role: member.role, restaurantName: restaurant?.name ?? 'Restaurante', plan: tier, now });
      // The files go again in every tool round: a cache point after them makes rounds 2+ cheap (pendências)
      return withFiles ? [...attachmentBlocks(attachments), { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } }] : text;
    })(),
  }];
  const totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const toolCalls: { name: string; input: unknown }[] = [];
  const deniedTools: string[] = [];
  const drafts: { id: string; kind: DraftKind; resumo: string }[] = [];
  let answer = '';
  let error: string | null = null;

  try {
    for (let round = 0; ; round++) {
      if (round >= MAX_ROUNDS) { answer = 'Não consegui concluir a consulta. Tente uma pergunta mais específica.'; break; }
      const response = await client.messages.create({
        model,
        max_tokens: withFiles ? 16000 : detailed ? 3000 : 1500,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools,
        output_config: { effort: detailed || withFiles ? 'medium' : 'low' },
        messages,
      } as Anthropic.MessageCreateParamsNonStreaming,
      // A menu read from photos/PDF takes longer than the client's 60 s, and a retry would be billed twice
      withFiles ? { timeout: 180_000, maxRetries: 0 } : undefined);
      totals.input_tokens += response.usage.input_tokens;
      totals.output_tokens += response.usage.output_tokens;
      totals.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;
      totals.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;
      const textOut = response.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map((c) => c.text).join('\n').trim();
      if (response.stop_reason === 'refusal') { answer = 'Não consigo responder isso.'; break; }
      if (response.stop_reason === 'max_tokens') {
        answer = withFiles
          ? 'O cardápio é grande demais para uma vez só. Mande menos páginas por vez (por exemplo, uma foto de cada vez).'
          : textOut ? `${textOut} (resposta cortada)` : 'Não consegui concluir a resposta (resposta cortada).';
        break;
      }
      if (response.stop_reason !== 'tool_use') { answer = textOut || 'Não encontrei uma resposta.'; break; }
      messages.push({ role: 'assistant', content: response.content });
      const uses = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
      const results = await Promise.all(uses.map(async (u) => {
        toolCalls.push({ name: u.name, input: u.input });
        const r = await runTool(member, u.name, u.input, now, { questionId: id });
        if (!r.ok && r.denied) deniedTools.push(u.name);
        if (r.ok && TOOL_KIND[u.name]) { const d = r.data as { rascunhoId: string; resumo: string }; drafts.push({ id: d.rascunhoId, kind: TOOL_KIND[u.name], resumo: d.resumo }); }
        return {
          type: 'tool_result' as const, tool_use_id: u.id,
          content: r.ok ? JSON.stringify(r.data) : r.error,
          ...(r.ok ? {} : { is_error: true }),
        };
      }));
      messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    error = e instanceof Anthropic.APIError ? `${e.status ?? ''} ${e.message}`.trim() : String((e as Error)?.message ?? e);
    console.error('[ai] ask failed:', error);
  }

  // The answer was paid for: a failed log write must not cost the user the answer
  try {
    await prisma.aiQuestion.update({
      where: { id },
      data: {
        answer: error ? null : answer,
        toolCalls: toolCalls as any, deniedTools: deniedTools.length ? (deniedTools as any) : undefined,
        inputTokens: totals.input_tokens, outputTokens: totals.output_tokens, cacheReadTokens: totals.cache_read_input_tokens, cacheWriteTokens: totals.cache_creation_input_tokens,
        costUsd: estimateCostUsd(model, totals), counted: !error, free: false, error,
      },
    });
  } catch (e) {
    console.error('[ai] log update failed:', (e as Error)?.message ?? e);
  }
  // A draft made before the failure exists: the owner still gets its button (pendências)
  if (error) return { status: 503, body: { error: UNAVAILABLE, used, limit, free: null, drafts } };
  return { status: 200, body: { answer, used: used + 1, limit, model, free: null, drafts } };
}
