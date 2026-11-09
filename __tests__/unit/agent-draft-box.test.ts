import { shouldPrefill, shouldApplyResponse } from '@/lib/agents/whatsapp/draft-box';

describe('shouldPrefill', () => {
  it('is true for an empty box', () => expect(shouldPrefill('', null)).toBe(true));
  it('is true for a whitespace-only box', () => expect(shouldPrefill('  \n ', 'x')).toBe(true));
  it('is true when the box still holds the previous draft', () => expect(shouldPrefill('Oi, tudo bem?', 'Oi, tudo bem?')).toBe(true));
  it('is false when the team typed something else', () => expect(shouldPrefill('Meu texto', 'Oi, tudo bem?')).toBe(false));
  it('is false when typed and there is no previous draft', () => expect(shouldPrefill('Meu texto', null)).toBe(false));
});

describe('shouldApplyResponse', () => {
  it('applies when the seq is current and the IN message is the latest', () => expect(shouldApplyResponse(3, 3, 'm1', 'm1')).toBe(true));
  it('drops a stale seq', () => expect(shouldApplyResponse(2, 3, 'm1', 'm1')).toBe(false));
  it('drops when the latest message is no longer an IN', () => expect(shouldApplyResponse(3, 3, 'm1', null)).toBe(false));
  it('drops when a newer client message arrived', () => expect(shouldApplyResponse(3, 3, 'm1', 'm2')).toBe(false));
});
