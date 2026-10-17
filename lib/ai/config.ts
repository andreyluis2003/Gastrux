/** "Pergunte ao Gastrux" settings (spec 2026-10-16 ia-assistente, §3, §4.1, §4.5) */

export const AI_LIMITS: Record<string, number | null> = { starter: 30, pro: 150, business: 350, enterprise: null };
export const DETAILED_TIERS = ['pro', 'business', 'enterprise'];
export const MAX_ROUNDS = 6;
/** Onboarding: the first questions of a new account are free (spec 2026-10-17 ia-implantacao §3.4) */
export const FREE_DAYS = 30;
export const FREE_QUESTIONS = 100;

export function monthlyLimit(tier: string | null | undefined): number | null {
  const t = (tier || 'starter').toLowerCase();
  return t in AI_LIMITS ? AI_LIMITS[t] : AI_LIMITS.starter;
}

/** The owner chose Haiku 5.5 / Sonnet 5.5 for cost (Anthropic's default is Opus 5.5); switchable by env */
export function aiModels() {
  return {
    default: process.env.AI_MODEL_DEFAULT || 'claude-haiku-5-5',
    detailed: process.env.AI_MODEL_DETAILED || 'claude-sonnet-5-5',
  };
}

// USD per million tokens (Anthropic first-party prices, 2026-10). Unknown models priced as Opus 5.5.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

export function estimateCostUsd(
  model: string,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
): number {
  const p = PRICES[model] ?? PRICES['claude-opus-5-5'];
  const perToken = (usd: number) => usd / 1_000_000;
  return (
    usage.input_tokens * perToken(p.input) +
    usage.output_tokens * perToken(p.output) +
    (usage.cache_read_input_tokens ?? 0) * perToken(p.input) * 0.1 +
    (usage.cache_creation_input_tokens ?? 0) * perToken(p.input) * 1.25
  );
}
