// @ts-nocheck
import { FocusNFeClient } from './focus-nfe-client';
import { MockNFeProvider } from './mock-provider';
import { NFeProvider } from './types';

/**
 * Retorna o provider apropriado baseado na config do tenant.
 * - Se config.nfeApiKey estiver vazio → usa MockNFeProvider (sandbox simulado)
 * - Se env=sandbox E NFE_FORCE_REAL != '1' → usa MockNFeProvider
 * - Caso contrário → usa FocusNFeClient real
 */
export function getProvider(config: { nfeApiKey?: string; environment?: string; nfeProvider?: string }): NFeProvider {
  const apiKey = (config.nfeApiKey || '').trim();
  const env = (config.environment || 'sandbox') as 'sandbox' | 'production';

  if (!apiKey) {
    return new MockNFeProvider();
  }

  // Em sandbox, permite modo simulado (evita consumir créditos SEFAZ homologação)
  // Setar NFE_FORCE_REAL=1 no .env para forçar chamada real mesmo em sandbox.
  if (env === 'sandbox' && process.env.NFE_FORCE_REAL !== '1') {
    return new MockNFeProvider();
  }

  const providerName = (config.nfeProvider || 'focusnfe').toLowerCase();
  if (providerName === 'focusnfe' || providerName === 'focus') {
    return new FocusNFeClient(apiKey, env);
  }

  // Providers adicionais (webmaniabr, nfeio etc.) podem ser adicionados aqui
  // Fallback para Focus como padrão
  return new FocusNFeClient(apiKey, env);
}
