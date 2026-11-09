import { shouldPrefill } from '@/lib/agents/whatsapp/draft-box';

describe('shouldPrefill', () => {
  it('is true for an empty box', () => expect(shouldPrefill('', null)).toBe(true));
  it('is true for a whitespace-only box', () => expect(shouldPrefill('  \n ', 'x')).toBe(true));
  it('is true when the box still holds the previous draft', () => expect(shouldPrefill('Oi, tudo bem?', 'Oi, tudo bem?')).toBe(true));
  it('is false when the team typed something else', () => expect(shouldPrefill('Meu texto', 'Oi, tudo bem?')).toBe(false));
  it('is false when typed and there is no previous draft', () => expect(shouldPrefill('Meu texto', null)).toBe(false));
});
