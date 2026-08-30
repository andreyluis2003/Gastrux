const LLM_URL = 'https://apps.abacus.ai/v1/chat/completions';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export async function callLLM(
  messages: LLMMessage[],
  options: LLMOptions = {},
): Promise<string> {
  const {
    model = 'gpt-5.4-mini',
    maxTokens = 2000,
    temperature = 0.4,
    jsonMode = false,
  } = options;

  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) throw new Error('ABACUSAI_API_KEY not configured');

  const body: any = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(LLM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[llm-client]', res.status, errText);
    throw new Error(`LLM error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
