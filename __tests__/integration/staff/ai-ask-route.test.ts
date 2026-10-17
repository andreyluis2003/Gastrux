// @ts-nocheck
/** POST /api/ai/ask refuses bodies over 8 MB before parsing (spec 2026-10-17 ia-implantacao §4.1) */
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { POST } from '../../../app/api/ai/ask/route';

describe('ask route body limit', () => {
  it('a body over 8 MB gets 413', async () => {
    const big = JSON.stringify({ question: 'oi', attachments: [{ type: 'image', mediaType: 'image/jpeg', data: 'A'.repeat(8.5 * 1024 * 1024) }] });
    const res = await POST(new Request('http://x/api/ai/ask', { method: 'POST', body: big }));
    expect(res.status).toBe(413);
  });
});
