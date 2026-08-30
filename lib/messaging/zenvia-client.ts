// @ts-nocheck
// Zenvia messaging client (WhatsApp channel).
// Docs: https://zenvia.github.io/zenvia-openapi-spec/
// Auth header: X-API-TOKEN

import {
  MessagingProviderClient,
  ProviderConfig,
  SendResult,
  SendTemplatePayload,
  SubmitTemplateResult,
  TemplateDefinition,
  renderTemplateBody,
} from './types';

export class ZenviaClient implements MessagingProviderClient {
  readonly name = 'ZENVIA' as const;
  private token: string;
  private from: string;

  constructor(cfg: ProviderConfig) {
    this.token = cfg.apiKey || '';
    this.from = cfg.fromNumber || '';
  }

  async sendTemplate(payload: SendTemplatePayload): Promise<SendResult> {
    if (!this.token) return { ok: false, error: 'Zenvia token não configurado' };
    if (!this.from) return { ok: false, error: 'Zenvia from (número) não configurado' };

    const rendered = renderTemplateBody(payload.template.bodyText, payload.variables);

    try {
      const body = {
        from: this.from,
        to: payload.to,
        contents: [
          {
            type: 'text',
            text: rendered,
          },
        ],
      };
      const res = await fetch('https://api.zenvia.com/v2/channels/whatsapp/messages', {
        method: 'POST',
        headers: {
          'X-API-TOKEN': this.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { ok: false, error: `Zenvia ${res.status}: ${errText.slice(0, 300)}` };
      }
      const out = await res.json().catch(() => ({}));
      return { ok: true, providerMsgId: out?.id, raw: out };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Erro de rede Zenvia' };
    }
  }

  async submitTemplate(tpl: TemplateDefinition): Promise<SubmitTemplateResult> {
    if (!this.token) return { ok: false, error: 'Zenvia token não configurado' };
    // Zenvia também aprova templates via portal → salvamos pending ref.
    return {
      ok: true,
      providerRef: `zenvia-pending-${tpl.name}-${Date.now()}`,
    };
  }
}
