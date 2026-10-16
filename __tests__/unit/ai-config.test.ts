import { aiModels, estimateCostUsd, monthlyLimit } from '../../lib/ai/config';

describe('AI config (lib/ai/config.ts)', () => {
  it('monthly limits per plan (owner 2026-10-16); unknown plans get the starter limit', () => {
    expect(monthlyLimit('starter')).toBe(30);
    expect(monthlyLimit('pro')).toBe(150);
    expect(monthlyLimit('business')).toBe(350);
    expect(monthlyLimit('enterprise')).toBeNull();
    expect(monthlyLimit(undefined)).toBe(30);
    expect(monthlyLimit('PRO')).toBe(150);
  });

  it('models come from the environment, with Haiku and Sonnet 5.5 by default', () => {
    const keep = { ...process.env };
    delete process.env.AI_MODEL_DEFAULT;
    delete process.env.AI_MODEL_DETAILED;
    expect(aiModels()).toEqual({ default: 'claude-haiku-5-5', detailed: 'claude-sonnet-5-5' });
    process.env.AI_MODEL_DEFAULT = 'claude-opus-5-5';
    expect(aiModels().default).toBe('claude-opus-5-5');
    process.env = keep;
  });

  it('estimated cost in USD: input, output, cache reads at 10% and writes at 125% of input', () => {
    expect(estimateCostUsd('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(0.1, 6);
    expect(estimateCostUsd('claude-haiku-5-5', { input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(0.5, 6);
    expect(estimateCostUsd('claude-haiku-5-5', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(0.01 + 0.125, 6);
    expect(estimateCostUsd('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(12, 6);
    expect(estimateCostUsd('modelo-desconhecido', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(4, 6); // priced as Opus 5.5 to never under-report
  });
});
