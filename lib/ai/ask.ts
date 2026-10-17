import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import type { RestaurantMember } from '@/lib/auth/restaurant-role';
import { getAnthropic } from './client';
import { aiModels, DETAILED_TIERS, estimateCostUsd, MAX_ROUNDS, monthlyLimit } from './config';
import { buildUserMessage, SYSTEM_PROMPT } from './prompt';
import { toolsFor, type AiRole } from './tools/defs';
import { runTool } from './tools/run';
import { questionsThisMonth, recentRate } from './usage';

const inFlight = new Set<string>();
const UNAVAILABLE = 'A IA está indisponível agora. Tente em instantes.';

/** One question: checks, the tool loop, the log (spec 2026-10-16 ia-assistente §4.1-§4.6) */
export async function askQuestion(member: RestaurantMember, body: unknown, now = new Date()) {
  const b = (body ?? {}) as { question?: unknown; history?: unknown; detailed?: unknown };
  const question = typeof b.question === 'string' ? b.question.trim() : '';
  if (!question || question.length > 1000) return { status: 400, body: { error: 'Escreva uma pergunta de até 1.000 caracteres.' } };
  const client = getAnthropic();
  if (!client) return { status: 503, body: { notConfigured: true, error: 'IA ainda não configurada.' } };

  const restaurant = await prisma.restaurant.findUnique({ where: { id: member.restaurantId }, select: { name: true, subscriptionTier: true } });
  const tier = (restaurant?.subscriptionTier || 'starter').toLowerCase();
  const detailed = b.detailed === true;
  if (detailed && !DETAILED_TIERS.includes(tier)) return { status: 403, body: { error: 'A análise detalhada é do plano Pro.', upgradeUrl: '/pricing' } };
  const limit = monthlyLimit(tier);
  const used = await questionsThisMonth(member.restaurantId, now);
  if (limit !== null && used >= limit) {
    return { status: 429, body: { error: `Você usou as ${limit} perguntas do mês do plano ${tier}.`, used, limit, upgradeUrl: '/pricing' } };
  }
  if (inFlight.has(member.userId)) return { status: 409, body: { error: 'Aguarde a resposta anterior.' } };
  if ((await recentRate(member.restaurantId, now)) >= 10) return { status: 429, body: { error: 'Muitas perguntas em sequência. Tente em um minuto.', used, limit } };

  const history = Array.isArray(b.history)
    ? (b.history as any[]).filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string').map((m) => ({ role: m.role, content: m.content }))
    : [];
  const models = aiModels();
  const model = detailed ? models.detailed : models.default;
  const tools = toolsFor(member.role as AiRole);
  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: buildUserMessage({ question, history, role: member.role, restaurantName: restaurant?.name ?? 'Restaurante', plan: tier, now }),
  }];
  const totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const toolCalls: { name: string; input: unknown }[] = [];
  const deniedTools: string[] = [];
  let answer = '';
  let error: string | null = null;

  inFlight.add(member.userId);
  try {
    for (let round = 0; ; round++) {
      if (round >= MAX_ROUNDS) { answer = 'Não consegui concluir a consulta. Tente uma pergunta mais específica.'; break; }
      const response = await client.messages.create({
        model,
        max_tokens: detailed ? 3000 : 1500,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools,
        output_config: { effort: detailed ? 'medium' : 'low' },
        messages,
      } as Anthropic.MessageCreateParamsNonStreaming);
      totals.input_tokens += response.usage.input_tokens;
      totals.output_tokens += response.usage.output_tokens;
      totals.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;
      totals.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;
      const textOut = response.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map((c) => c.text).join('\n').trim();
      if (response.stop_reason === 'refusal') { answer = 'Não consigo responder isso.'; break; }
      if (response.stop_reason === 'max_tokens') { answer = `${textOut} (resposta cortada)`.trim(); break; }
      if (response.stop_reason !== 'tool_use') { answer = textOut || 'Não encontrei uma resposta.'; break; }
      messages.push({ role: 'assistant', content: response.content });
      const uses = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
      const results = await Promise.all(uses.map(async (u) => {
        toolCalls.push({ name: u.name, input: u.input });
        const r = await runTool(member, u.name, u.input, now);
        if (!r.ok && r.denied) deniedTools.push(u.name);
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
  } finally {
    inFlight.delete(member.userId);
  }

  await prisma.aiQuestion.create({
    data: {
      restaurantId: member.restaurantId, userId: member.userId, role: member.role, question, answer: error ? null : answer, model, detailed,
      toolCalls: toolCalls as any, deniedTools: deniedTools.length ? (deniedTools as any) : undefined,
      inputTokens: totals.input_tokens, outputTokens: totals.output_tokens, cacheReadTokens: totals.cache_read_input_tokens, cacheWriteTokens: totals.cache_creation_input_tokens,
      costUsd: estimateCostUsd(model, totals), counted: !error, error,
    },
  });
  if (error) return { status: 503, body: { error: UNAVAILABLE, used, limit } };
  return { status: 200, body: { answer, used: used + 1, limit, model } };
}
