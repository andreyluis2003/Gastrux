// @ts-nocheck
// Meta Cloud API template sender — reutiliza credenciais do WhatsAppConfig (Phase 51).
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

import { prisma } from '@/lib/prisma';
import {
  MessagingProviderClient,
  ProviderConfig,
  SendResult,
  SendTemplatePayload,
  SubmitTemplateResult,
  TemplateDefinition,
} from './types';

const META_API_VERSION = 'v20.0';

export class MetaTemplateClient implements MessagingProviderClient {
  readonly name = 'META_CLOUD' as const;
  private phoneNumberId: string = '';
  private accessToken: string = '';
  private businessAccountId: string = '';
  private restaurantId: string;

  constructor(cfg: ProviderConfig, restaurantId: string) {
    this.restaurantId = restaurantId;
    // For Meta we prefer credentials stored in the WhatsAppConfig of the restaurant
    // but we accept overrides via ProviderConfig for flexibility.
    this.accessToken = cfg.apiKey || '';
    this.phoneNumberId = cfg.botIdentifier || '';
  }

  private async ensureCreds() {
    if (this.accessToken && this.phoneNumberId) return;
    const waCfg = await prisma.whatsAppConfig.findUnique({
      where: { restaurantId: this.restaurantId },
      select: { phoneNumberId: true, accessToken: true, businessAccountId: true },
    });
    if (waCfg) {
      this.accessToken = this.accessToken || waCfg.accessToken || '';
      this.phoneNumberId = this.phoneNumberId || waCfg.phoneNumberId || '';
      this.businessAccountId = waCfg.businessAccountId || '';
    }
  }

  async sendTemplate(payload: SendTemplatePayload): Promise<SendResult> {
    await this.ensureCreds();
    if (!this.accessToken || !this.phoneNumberId) {
      return { ok: false, error: 'Meta Cloud: credenciais WhatsApp não configuradas' };
    }
    const tpl = payload.template;
    const vars = payload.variables || {};
    // Extract ordered positional variables
    const varList = (tpl.variables || []).map((v: any, idx: number) => {
      const value = vars[v.name] ?? vars[String(idx + 1)];
      return { type: 'text', text: String(value ?? '') };
    });

    try {
      const body: any = {
        messaging_product: 'whatsapp',
        to: payload.to,
        type: 'template',
        template: {
          name: tpl.name,
          language: { code: tpl.language || 'pt_BR' },
          components: [] as any[],
        },
      };
      if (varList.length) {
        body.template.components.push({ type: 'body', parameters: varList });
      }
      const res = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out?.error) {
        return { ok: false, error: out?.error?.message || `Meta ${res.status}`, raw: out };
      }
      const msgId = out?.messages?.[0]?.id;
      return { ok: true, providerMsgId: msgId, raw: out };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Erro de rede Meta Cloud' };
    }
  }

  async submitTemplate(tpl: TemplateDefinition): Promise<SubmitTemplateResult> {
    await this.ensureCreds();
    if (!this.accessToken || !this.businessAccountId) {
      return { ok: false, error: 'Meta Cloud: accessToken/WABA ID necessários para submissão de template' };
    }
    try {
      const components: any[] = [];
      if (tpl.headerText) {
        components.push({ type: 'HEADER', format: 'TEXT', text: tpl.headerText });
      }
      components.push({ type: 'BODY', text: tpl.bodyText });
      if (tpl.footerText) components.push({ type: 'FOOTER', text: tpl.footerText });
      if (tpl.buttons?.length) {
        components.push({
          type: 'BUTTONS',
          buttons: tpl.buttons.map((b: any) => {
            if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
            if (b.type === 'PHONE') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone };
            return { type: 'QUICK_REPLY', text: b.text };
          }),
        });
      }

      const body = {
        name: tpl.name,
        category: tpl.category,
        language: tpl.language || 'pt_BR',
        components,
      };
      const res = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${this.businessAccountId}/message_templates`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out?.error) {
        return { ok: false, error: out?.error?.message || `Meta ${res.status}`, raw: out };
      }
      return { ok: true, providerRef: out?.id, raw: out };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Erro de rede Meta Cloud' };
    }
  }
}
