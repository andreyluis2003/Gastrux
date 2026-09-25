// @ts-nocheck
import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';
import { POST } from '../../../app/api/whatsapp/webhook/route';

function signedRequest(payload: any, secret: string) {
  const rawBody = JSON.stringify(payload);
  const signature =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return new Request('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': signature },
    body: rawBody,
  });
}

describe('POST /api/whatsapp/webhook - account_update events', () => {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.WHATSAPP_APP_SECRET = originalSecret;
  });

  it('logs and acknowledges an account_update event without erroring', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const payload = {
      entry: [
        {
          id: 'waba-123',
          changes: [
            {
              field: 'account_update',
              value: { event: 'PARTNER_ADDED', waba_info: { waba_id: 'waba-123' } },
            },
          ],
        },
      ],
    };

    const res = await POST(signedRequest(payload, 'test-secret') as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[wa-webhook] account_update'),
      expect.objectContaining({ event: 'PARTNER_ADDED' })
    );

    logSpy.mockRestore();
  });

  it('still returns ok:true for a payload with no entries', async () => {
    const res = await POST(signedRequest({ entry: [] }, 'test-secret') as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
