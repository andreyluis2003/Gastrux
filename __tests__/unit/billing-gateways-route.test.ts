// @ts-nocheck
import { GET } from '../../app/api/billing/gateways/route';

describe('GET /api/billing/gateways', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  // Production 2026-10-10: the pricing page always offered Stripe, but production has no
  // STRIPE_SECRET_KEY, so the Stripe button only ever answered with an error.
  it('offers Stripe only when its secret key is set', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect((await (await GET()).json()).stripe).toBe(false);

    process.env.STRIPE_SECRET_KEY = 'sk_live_x';
    expect((await (await GET()).json()).stripe).toBe(true);
  });

  it('offers Mercado Pago only when BILLING_MP_ENABLED is true', async () => {
    process.env.BILLING_MP_ENABLED = 'false';
    expect((await (await GET()).json()).mercadoPago).toBe(false);

    process.env.BILLING_MP_ENABLED = 'true';
    expect((await (await GET()).json()).mercadoPago).toBe(true);
  });
});
