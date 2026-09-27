// @ts-nocheck
/**
 * "Esqueci minha senha" (there was no way to recover an account). Each case states the DESIRED
 * behaviour: the same answer with or without an account, a one-time link valid for 1 hour whose token
 * is stored hashed, at most 3 links an hour, a new link voids the older ones, and using it sets the
 * new password (ending any "must change" state).
 */
import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/email/transactional', () => ({ sendTransactionalEmail: jest.fn().mockResolvedValue({ provider: 'test' }) }));

import { sendTransactionalEmail } from '../../../lib/email/transactional';
import { POST as forgot } from '../../../app/api/password/forgot/route';
import { POST as reset } from '../../../app/api/password/reset/route';
import { requestPasswordReset } from '../../../lib/auth/password-reset';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('forgot password', () => {
  const tag = crypto.randomBytes(3).toString('hex');
  const email = `esqueci-${tag}@reset.test`;
  let userId: string;
  const req = (body: any) => new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as any;
  const linkToken = () => {
    const html = (sendTransactionalEmail as jest.Mock).mock.calls.at(-1)[0].html;
    return /token=([A-Za-z0-9_-]+)/.exec(html)[1];
  };

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email, name: 'Dona Maria', password: await bcryptjs.hash('SenhaAntiga#1', 10), role: 'OWNER', active: true, mustChangePassword: true },
    });
    userId = user.id;
  });
  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
  });

  it('answers the same with or without an account, and only sends to a real one', async () => {
    const withAccount = await (await forgot(req({ email: `  ${email.toUpperCase()} ` }))).json();
    const without = await (await forgot(req({ email: `ninguem-${tag}@reset.test` }))).json();
    expect(withAccount).toEqual(without);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect((sendTransactionalEmail as jest.Mock).mock.calls[0][0].to).toBe(email);
  });

  it('stores only the hash of the token, valid for about 1 hour', async () => {
    await forgot(req({ email }));
    const token = linkToken();
    const rows = await prisma.passwordResetToken.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toContain(token);
    expect(rows[0].tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    const minutes = (rows[0].expiresAt.getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(55);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it('the link sets the new password once, and ends the "must change" state', async () => {
    await forgot(req({ email }));
    const token = linkToken();

    expect((await reset(req({ token, newPassword: 'curta' }))).status).toBe(400);
    const ok = await reset(req({ token, newPassword: 'SenhaNova#2026' }));
    expect(ok.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(await bcryptjs.compare('SenhaNova#2026', user.password)).toBe(true);
    expect(user.mustChangePassword).toBe(false);

    const again = await reset(req({ token, newPassword: 'OutraSenha#2026' }));
    expect(again.status).toBe(400);
    expect(await bcryptjs.compare('SenhaNova#2026', (await prisma.user.findUnique({ where: { id: userId } })).password)).toBe(true);
  });

  it('two tabs using the same link at once: only one wins', async () => {
    await forgot(req({ email }));
    const token = linkToken();
    const results = await Promise.all([
      reset(req({ token, newPassword: 'PrimeiraAba#1' })),
      reset(req({ token, newPassword: 'SegundaAba#2' })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it('a new link voids the older one; an expired link is refused', async () => {
    await forgot(req({ email }));
    const first = linkToken();
    await forgot(req({ email }));
    const second = linkToken();
    expect((await reset(req({ token: first, newPassword: 'Qualquer#123' }))).status).toBe(400);

    await prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await reset(req({ token: second, newPassword: 'Qualquer#123' }))).status).toBe(400);
  });

  it('at most 3 links an hour per account', async () => {
    for (let i = 0; i < 3; i++) expect((await requestPasswordReset(email)).sent).toBe(true);
    expect(await requestPasswordReset(email)).toEqual({ sent: false, reason: 'rate-limited' });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(3);
  });

  it('a made-up token is refused', async () => {
    expect((await reset(req({ token: 'inventado', newPassword: 'Qualquer#123' }))).status).toBe(400);
  });
});
