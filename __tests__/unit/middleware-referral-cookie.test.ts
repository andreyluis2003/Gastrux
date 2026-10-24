/** The referral link keeps its code for 60 days (plan 2026-10-24 indicacao, Task 3) */
import { NextRequest } from 'next/server';

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn().mockResolvedValue(null) }));

import { middleware } from '../../middleware';

const visit = (path: string) => middleware(new NextRequest(new URL(path, 'https://gastrux.com')));

describe('middleware: referral cookie', () => {
  it('?ref= on the site sets gx_ref for 60 days, normalized', async () => {
    const res = await visit('/?ref=abc23d');
    const cookie = res.cookies.get('gx_ref');
    expect(cookie?.value).toBe('ABC23D');
    expect(cookie?.maxAge).toBe(60 * 24 * 3600);
  });

  it('works on any public page, like /pricing', async () => {
    expect((await visit('/pricing?ref=ABC23D')).cookies.get('gx_ref')?.value).toBe('ABC23D');
  });

  it('an invalid code sets nothing', async () => {
    expect((await visit('/?ref=nope')).cookies.get('gx_ref')).toBeUndefined();
    expect((await visit('/')).cookies.get('gx_ref')).toBeUndefined();
  });
});
