// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  exchangeCodeForToken,
  subscribeAppToWaba,
  registerPhoneNumber,
} from '../../../lib/whatsapp/embedded-signup';

describe('lib/whatsapp/embedded-signup', () => {
  const originalFetch = global.fetch;
  const originalAppId = process.env.WHATSAPP_APP_ID;
  const originalAppSecret = process.env.WHATSAPP_APP_SECRET;

  beforeEach(() => {
    process.env.WHATSAPP_APP_ID = 'test-app-id';
    process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.WHATSAPP_APP_ID = originalAppId;
    process.env.WHATSAPP_APP_SECRET = originalAppSecret;
    jest.restoreAllMocks();
  });

  describe('exchangeCodeForToken', () => {
    it('calls /oauth/access_token with client_id, client_secret and code, and returns the access token', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'business-token-abc', token_type: 'bearer' }),
      });
      global.fetch = fetchMock as any;

      const result = await exchangeCodeForToken('short-lived-code');

      expect(result).toEqual({ accessToken: 'business-token-abc' });
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('graph.facebook.com/v20.0/oauth/access_token');
      expect(calledUrl).toContain('client_id=test-app-id');
      expect(calledUrl).toContain('client_secret=test-app-secret');
      expect(calledUrl).toContain('code=short-lived-code');
    });

    it('throws with the Meta error message when the exchange fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid verification code format.' } }),
      }) as any;

      await expect(exchangeCodeForToken('bad-code')).rejects.toThrow(
        'Invalid verification code format.'
      );
    });
  });

  describe('subscribeAppToWaba', () => {
    it('POSTs to /{wabaId}/subscribed_apps with the business access token', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock as any;

      await subscribeAppToWaba('waba-123', 'business-token-abc');

      const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('https://graph.facebook.com/v20.0/waba-123/subscribed_apps');
      expect(calledOpts.method).toBe('POST');
      expect(calledOpts.headers.Authorization).toBe('Bearer business-token-abc');
    });

    it('throws with the Meta error message when the subscription fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Permission denied for this WABA.' } }),
      }) as any;

      await expect(subscribeAppToWaba('waba-123', 'bad-token')).rejects.toThrow(
        'Permission denied for this WABA.'
      );
    });
  });

  describe('registerPhoneNumber', () => {
    it('POSTs to /{phoneNumberId}/register with messaging_product and the given pin', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock as any;

      await registerPhoneNumber('phone-456', 'business-token-abc', '246810');

      const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('https://graph.facebook.com/v20.0/phone-456/register');
      const body = JSON.parse(calledOpts.body);
      expect(body).toEqual({ messaging_product: 'whatsapp', pin: '246810' });
    });

    it('throws with the Meta error message when registration fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Phone number already registered.' } }),
      }) as any;

      await expect(
        registerPhoneNumber('phone-456', 'business-token-abc', '246810')
      ).rejects.toThrow('Phone number already registered.');
    });
  });
});
