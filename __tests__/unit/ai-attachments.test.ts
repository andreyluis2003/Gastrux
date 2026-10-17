import { validateAttachments, attachmentBlocks, attachmentSummary } from '../../lib/ai/attachments';

const b64 = (bytes: number) => Buffer.alloc(Math.floor(bytes), 1).toString('base64');
const img = (bytes = 1000, mediaType = 'image/jpeg') => ({ type: 'image', mediaType, data: b64(bytes) });

describe('chat attachments (spec 2026-10-17 ia-implantacao §4.1)', () => {
  it('accepts up to 4 images or 1 PDF', () => {
    expect(validateAttachments([img(), img(), img(), img()])).toMatchObject({ ok: true });
    expect(validateAttachments([{ type: 'pdf', mediaType: 'application/pdf', data: b64(1000) }])).toMatchObject({ ok: true });
    expect(validateAttachments(undefined)).toEqual({ ok: true, list: [] });
  });
  it('refuses 5 images, 2 PDFs, mixed kinds, wrong types and big files', () => {
    for (const bad of [
      [img(), img(), img(), img(), img()],
      [{ type: 'pdf', mediaType: 'application/pdf', data: b64(10) }, { type: 'pdf', mediaType: 'application/pdf', data: b64(10) }],
      [img(), { type: 'pdf', mediaType: 'application/pdf', data: b64(10) }],
      [img(1000, 'image/gif')],
      [img(1.6 * 1024 * 1024)],
      [{ type: 'pdf', mediaType: 'application/pdf', data: b64(5.1 * 1024 * 1024) }],
      [{ type: 'image', mediaType: 'image/png', data: '%%%not-base64' }],
      'x',
    ]) expect(validateAttachments(bad).ok).toBe(false);
  });
  it('builds image/document blocks and a summary without the data', () => {
    const v = validateAttachments([img()]);
    if (!v.ok) throw new Error();
    expect(attachmentBlocks(v.list)[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    expect(attachmentSummary(v.list)).toEqual({ images: 1, pdf: false });
    expect(attachmentSummary([])).toBeNull();
  });
});
