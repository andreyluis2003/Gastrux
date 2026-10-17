import type Anthropic from '@anthropic-ai/sdk';

export type Attachment = { type: 'image' | 'pdf'; mediaType: string; data: string };
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const bytesOf = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/** Photos or a PDF of the menu (spec 2026-10-17 ia-implantacao §4.1); checked before any AI call */
export function validateAttachments(raw: unknown): { ok: true; list: Attachment[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, list: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'Anexo inválido.' };
  const list: Attachment[] = [];
  for (const a of raw) {
    const type = a?.type, mediaType = a?.mediaType, data = a?.data;
    if (typeof data !== 'string' || !data || !B64.test(data)) return { ok: false, error: 'Anexo inválido.' };
    if (type === 'image' && IMAGE_TYPES.includes(mediaType)) {
      if (bytesOf(data) > MAX_IMAGE_BYTES) return { ok: false, error: 'Foto grande demais. Tire a foto de novo ou envie menor.' };
    } else if (type === 'pdf' && mediaType === 'application/pdf') {
      if (bytesOf(data) > MAX_PDF_BYTES) return { ok: false, error: 'PDF grande demais (até 5 MB).' };
    } else return { ok: false, error: 'Envie fotos (JPG, PNG ou WebP) ou um PDF.' };
    list.push({ type, mediaType, data });
  }
  const images = list.filter((a) => a.type === 'image').length;
  const pdfs = list.length - images;
  if (images > MAX_IMAGES) return { ok: false, error: 'Envie até 4 fotos por vez.' };
  if (pdfs > 1 || (pdfs && images)) return { ok: false, error: 'Envie até 4 fotos ou 1 PDF por vez.' };
  return { ok: true, list };
}

export function attachmentBlocks(list: Attachment[]): Anthropic.ContentBlockParam[] {
  return list.map((a): Anthropic.ContentBlockParam => a.type === 'image'
    ? { type: 'image', source: { type: 'base64', media_type: a.mediaType as 'image/jpeg', data: a.data } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } });
}

export const attachmentSummary = (list: Attachment[]) =>
  list.length ? { images: list.filter((a) => a.type === 'image').length, pdf: list.some((a) => a.type === 'pdf') } : null;
