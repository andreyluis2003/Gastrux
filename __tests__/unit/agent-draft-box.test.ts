import { shouldPrefill, shouldApplyResponse, shouldClearStaleDraft } from '@/lib/agents/whatsapp/draft-box';

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

describe('shouldClearStaleDraft', () => {
  it('clears an untouched draft when a new client message gets a non-suggestion', () =>
    expect(shouldClearStaleDraft('A', 'A', 'm1', 'm2', false)).toBe(true));
  it('never clears typed text', () => expect(shouldClearStaleDraft('meu texto', 'A', 'm1', 'm2', false)).toBe(false));
  it('keeps the draft when a regenerate fails for the same message', () =>
    expect(shouldClearStaleDraft('A', 'A', 'm1', 'm1', false)).toBe(false));
  it('does nothing when the response is a suggestion (it overwrites)', () =>
    expect(shouldClearStaleDraft('A', 'A', 'm1', 'm2', true)).toBe(false));
  it('does nothing without a draft', () => expect(shouldClearStaleDraft('', null, null, 'm2', false)).toBe(false));
});
