import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

/** The Anthropic client, or null when ANTHROPIC_API_KEY is not configured (the chat shows "IA ainda não configurada") */
export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ maxRetries: 1, timeout: 60_000 });
  return client;
}
