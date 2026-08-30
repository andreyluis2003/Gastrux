// @ts-nocheck
// Take Blip (blip.ai) HTTP messaging client.
// Docs: https://docs.blip.ai/
// Authentication: Authorization: Key <base64(identifier:accessKey)>

import {
  MessagingProviderClient,
  ProviderConfig,
  SendResult,
  SendTemplatePayload,
  SubmitTemplateResult,
  TemplateDefinition,
  renderTemplateBody,
} from './types';

export class TakeBlipClient implements MessagingProviderClient {
  readonly name = 'TAKE_BLIP' as const;
  private apiKey: string;
  private botId: string;
  private router: string;

  constructor(cfg: ProviderConfig) {
    this.apiKey = cfg.apiKey || '';
    this.botId = cfg.botIdentifier || '';
    this.router = cfg.blipRouter || 'https://msging.net';
  }

  private authHeader(): string {
    return `Key ${this.apiKey}`;
  }

  async sendTemplate(payload: SendTemplatePayload): Promise<SendResult> {
    if (!this.apiKey) return { ok: false, error: 'Take Blip apiKey não configurado' };
    // Take Blip sends HSM (template) through a "message" command to WhatsApp channel.
    // Content type: application/vnd.iris.whatsapp.hsm+json (aprovado)
    const rendered = renderTemplateBody(payload.template.bodyText, payload.variables);

    try {
      const body = {
        id: `tmpl-${Date.now()}`,
        to: `${payload.to}@wa.gw.msging.net`,
        type: 'text/plain',
        content: rendered,
      };
      const res = await fetch(`${this.router}/messages`, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { ok: false, error: `Take Blip ${res.status}: ${errText.slice(0, 300)}` };
      }
      const out = await res.json().catch(() => ({}));
      return { ok: true, providerMsgId: out?.id || body.id, raw: out };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Erro de rede Take Blip' };
    }
  }

  async submitTemplate(tpl: TemplateDefinition): Promise<SubmitTemplateResult> {
    // Take Blip aprova templates via portal — não expomos endpoint direto.
    // Aqui apenas registramos a intenção e retornamos um ref mock.
    if (!this.apiKey) return { ok: false, error: 'Take Blip apiKey não configurado' };
    return {
      ok: true,
      providerRef: `blip-pending-${tpl.name}-${Date.now()}`,
    };
  }
}
