// @ts-nocheck
// Phase 55 — Messaging Platforms common types

export type ProviderName = 'META_CLOUD' | 'TAKE_BLIP' | 'ZENVIA';

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE';
  text: string;
  url?: string;
  phone?: string;
}

export interface TemplateDefinition {
  name: string; // snake_case internal name
  language: string; // pt_BR, en_US
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  headerText?: string | null;
  bodyText: string;
  footerText?: string | null;
  buttons?: TemplateButton[] | null;
  variables?: Array<{ name: string; example?: string }>;
}

export interface SendTemplatePayload {
  to: string; // E.164 digits only (ex: "5511999998888")
  template: TemplateDefinition;
  variables: Record<string, string | number>;
}

export interface SendResult {
  ok: boolean;
  providerMsgId?: string;
  error?: string;
  raw?: any;
}

export interface SubmitTemplateResult {
  ok: boolean;
  providerRef?: string;
  error?: string;
  raw?: any;
}

export interface ProviderConfig {
  apiKey?: string | null;
  apiSecret?: string | null;
  botIdentifier?: string | null;
  fromNumber?: string | null;
  blipRouter?: string | null;
  zenviaAccount?: string | null;
}

export interface MessagingProviderClient {
  name: ProviderName;
  sendTemplate(payload: SendTemplatePayload): Promise<SendResult>;
  submitTemplate(tpl: TemplateDefinition): Promise<SubmitTemplateResult>;
}

export function renderTemplateBody(body: string, vars: Record<string, any>): string {
  if (!body) return '';
  let out = body;
  // Replace {{1}} {{2}} etc using ordered keys (1,2,3...) or named
  out = out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
    const v = vars[key] ?? vars[String(key)];
    return v === undefined || v === null ? '' : String(v);
  });
  return out;
}

export function normalizePhone(raw: string): string {
  if (!raw) return '';
  // Keep digits only; if starts with 0, strip
  let d = String(raw).replace(/\D+/g, '');
  // Brazilian fallback: if 10 or 11 digits => prepend 55
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}
