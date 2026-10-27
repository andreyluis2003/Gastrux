/**
 * The delivery storefront is where the restaurant's customers order and pay: they have no Gastrux
 * account, so the page must open without login. It sent everyone to /auth/signin (found in the
 * Mercado Pago homologation test of 2026-10-04), while the dashboard must stay protected.
 */
import { NextRequest } from 'next/server';

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn().mockResolvedValue(null) }));

import { middleware } from '../../middleware';

async function visit(path: string) {
  return middleware(new NextRequest(new URL(path, 'https://homolog.gastrux.com')));
}

function redirectsToSignIn(res: Response): boolean {
  return (res.headers.get('location') || '').includes('/auth/signin');
}

describe('middleware: public pages without login', () => {
  it.each([
    '/delivery/cmushbbri0001nx0klhijo24p',
    '/delivery/cmushbbri0001nx0klhijo24p?payment=abc&result=success',
    '/menu/qr-token',
    // The brand files and app icons of the public site (2026-10-13: the new logo did not show to visitors)
    '/brand/gastrux.svg',
    '/brand/helpflow-negativa.svg',
    '/favicon.svg',
    '/icon-192.png',
    '/og-image.png',
    // The home page video and its poster (2026-10-25: the video went to the sign-in page)
    '/videos/gastrux-em-1-minuto.mp4',
    '/videos/gastrux-em-1-minuto-capa.jpg',
    // The tutorial videos (spec 2026-10-25 tutoriais-em-video)
    '/videos/tutoriais/caixa.mp4',
    '/videos/tutoriais/caixa.jpg',
    // The ad files the Meta API fetches by URL (2026-10-27)
    '/videos/anuncios/B-faltou-dinheiro-no-caixa-9x16.mp4',
    '/videos/anuncios/1-custo-do-prato-feed-4x5.png',
  ])('%s opens for a visitor', async (path) => {
    expect(redirectsToSignIn(await visit(path))).toBe(false);
  });

  it.each(['/dashboard', '/dashboard/pagamentos/conectar', '/deliveryx', '/videos/../dashboard', '/videos/x.mp4/dashboard', '/tutoriais', '/videos/tutoriais/../../dashboard', '/videos/anuncios/../../dashboard', '/videos/anuncios/x.png/dashboard'])(
    '%s still requires login',
    async (path) => {
      expect(redirectsToSignIn(await visit(path))).toBe(true);
    }
  );
});
