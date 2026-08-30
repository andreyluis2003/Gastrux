/**
 * Cliente para a Meta Cloud API (WhatsApp Business).
 * https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const META_API_VERSION = 'v20.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaCredentials {
  phoneNumberId: string;
  accessToken: string;
}

export interface SendTextOptions {
  to: string; // E.164 sem "+" (ex: 5511999887766)
  text: string;
  previewUrl?: boolean;
}

export interface InteractiveButton {
  id: string; // payload (até 256 chars)
  title: string; // texto do botão (até 20 chars)
}

export interface SendInteractiveButtonsOptions {
  to: string;
  body: string;
  header?: string;
  footer?: string;
  buttons: InteractiveButton[]; // máx 3
}

export interface InteractiveListSection {
  title: string; // até 24 chars
  rows: Array<{
    id: string; // payload
    title: string; // até 24 chars
    description?: string; // até 72 chars
  }>;
}

export interface SendInteractiveListOptions {
  to: string;
  body: string;
  header?: string;
  footer?: string;
  buttonLabel: string; // ex: "Ver cardápio"
  sections: InteractiveListSection[]; // cada uma com até 10 rows
}

export interface MetaApiResponse {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class MetaCloudClient {
  constructor(private credentials: MetaCredentials) {}

  private async request(payload: any): Promise<MetaApiResponse> {
    const url = `${META_BASE_URL}/${this.credentials.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as MetaApiResponse;
    if (!res.ok) {
      const msg = data?.error?.message || `Meta API error ${res.status}`;
      const err = new Error(msg) as Error & { meta?: any };
      err.meta = data;
      throw err;
    }
    return data;
  }

  async sendText(opts: SendTextOptions) {
    return this.request({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: opts.to,
      type: 'text',
      text: { body: opts.text, preview_url: opts.previewUrl ?? false },
    });
  }

  async sendButtons(opts: SendInteractiveButtonsOptions) {
    const action = {
      buttons: opts.buttons.slice(0, 3).map((b) => ({
        type: 'reply',
        reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
      })),
    };
    const interactive: any = {
      type: 'button',
      body: { text: opts.body.slice(0, 1024) },
      action,
    };
    if (opts.header) interactive.header = { type: 'text', text: opts.header.slice(0, 60) };
    if (opts.footer) interactive.footer = { text: opts.footer.slice(0, 60) };
    return this.request({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: opts.to,
      type: 'interactive',
      interactive,
    });
  }

  async sendList(opts: SendInteractiveListOptions) {
    const action = {
      button: opts.buttonLabel.slice(0, 20),
      sections: opts.sections.slice(0, 10).map((s) => ({
        title: s.title.slice(0, 24),
        rows: s.rows.slice(0, 10).map((r) => ({
          id: r.id.slice(0, 200),
          title: r.title.slice(0, 24),
          description: r.description ? r.description.slice(0, 72) : undefined,
        })),
      })),
    };
    const interactive: any = {
      type: 'list',
      body: { text: opts.body.slice(0, 1024) },
      action,
    };
    if (opts.header) interactive.header = { type: 'text', text: opts.header.slice(0, 60) };
    if (opts.footer) interactive.footer = { text: opts.footer.slice(0, 60) };
    return this.request({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: opts.to,
      type: 'interactive',
      interactive,
    });
  }

  async markAsRead(waMessageId: string) {
    try {
      const url = `${META_BASE_URL}/${this.credentials.phoneNumberId}/messages`;
      await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: waMessageId,
        }),
      });
    } catch {
      // best-effort
    }
  }
}

export function normalizePhone(raw: string): string {
  return String(raw).replace(/\D/g, '');
}
