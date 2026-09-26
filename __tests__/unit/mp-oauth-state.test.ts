// @ts-nocheck
import { createOAuthState, verifyOAuthState } from '../../lib/mercadopago-connect/oauth-state';

describe('mercadopago-connect/oauth-state', () => {
  const original = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-nextauth-secret';
  });

  afterAll(() => {
    process.env.NEXTAUTH_SECRET = original;
  });

  it('round-trips restaurantId and userId', () => {
    const state = createOAuthState({ restaurantId: 'rest-1', userId: 'user-1' });
    const payload = verifyOAuthState(state);
    expect(payload?.restaurantId).toBe('rest-1');
    expect(payload?.userId).toBe('user-1');
    expect(typeof payload?.nonce).toBe('string');
  });

  it('is unique per call (random nonce)', () => {
    const a = createOAuthState({ restaurantId: 'r', userId: 'u' });
    const b = createOAuthState({ restaurantId: 'r', userId: 'u' });
    expect(a).not.toBe(b);
  });

  it('rejects an expired state', () => {
    const now = Date.now();
    const state = createOAuthState({ restaurantId: 'r', userId: 'u' }, now);
    expect(verifyOAuthState(state, now + 10 * 60 * 1000 + 1)).toBeNull();
    expect(verifyOAuthState(state, now + 5 * 60 * 1000)).not.toBeNull();
  });

  it('rejects a tampered body (e.g. swapping the restaurant)', () => {
    const state = createOAuthState({ restaurantId: 'rest-1', userId: 'user-1' });
    const [body, sig] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), restaurantId: 'rest-2' })
    ).toString('base64url');
    expect(verifyOAuthState(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects a state signed with another secret', () => {
    const state = createOAuthState({ restaurantId: 'r', userId: 'u' });
    process.env.NEXTAUTH_SECRET = 'a-different-secret';
    expect(verifyOAuthState(state)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyOAuthState('')).toBeNull();
    expect(verifyOAuthState('no-dot')).toBeNull();
    expect(verifyOAuthState('a.b')).toBeNull();
  });
});
