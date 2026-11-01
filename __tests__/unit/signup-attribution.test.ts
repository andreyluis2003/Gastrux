import { attributionFromParams, attributionLabel, parseAttributionCookie } from '../../lib/marketing/attribution';

describe('sign-up origin', () => {
  it('reads the labels of an ad link', () => {
    const a = attributionFromParams(new URLSearchParams('utm_source=meta&utm_medium=paid_social&utm_campaign=sinop_v2&utm_content=video_a_9x16&fbclid=abc'));
    expect(a).toEqual({ source: 'meta', medium: 'paid_social', campaign: 'sinop_v2', content: 'video_a_9x16' });
    expect(attributionLabel(a!)).toBe('meta · paid_social · sinop_v2 · video_a_9x16');
  });

  it('needs a source and drops anything that is not a label', () => {
    expect(attributionFromParams(new URLSearchParams('utm_campaign=x'))).toBeNull();
    expect(attributionFromParams(new URLSearchParams('utm_source=<script>'))).toBeNull();
    expect(attributionFromParams(new URLSearchParams('utm_source=meta&utm_content=<b>'))?.content).toBeNull();
    expect(attributionFromParams(new URLSearchParams(`utm_source=${'a'.repeat(300)}`))?.source).toHaveLength(100);
  });

  it('a broken or forged cookie counts as nothing', () => {
    expect(parseAttributionCookie(undefined)).toBeNull();
    expect(parseAttributionCookie('{oops')).toBeNull();
    expect(parseAttributionCookie('{"source":"<x>"}')).toBeNull();
    expect(parseAttributionCookie('{"source":"meta"}')).toEqual({ source: 'meta', medium: null, campaign: null, content: null });
  });
});
