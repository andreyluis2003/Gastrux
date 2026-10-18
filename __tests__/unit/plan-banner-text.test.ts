/** The trial / locked bar (spec 2026-10-18 §6) */
import { bannerFor } from '@/lib/billing/plan-banner-text';

it('texts and tones', () => {
  expect(bannerFor('trial', 12)).toEqual({ tone: 'info', text: 'Teste grátis: faltam 12 dias' });
  expect(bannerFor('trial', 3)).toEqual({ tone: 'warn', text: 'Teste grátis: faltam 3 dias' });
  expect(bannerFor('trial', 1)).toEqual({ tone: 'warn', text: 'Teste grátis: último dia' });
  expect(bannerFor('locked', 0)).toEqual({ tone: 'danger', text: 'Teste encerrado: escolha um plano para voltar a vender' });
  expect(bannerFor('locked', null)).toEqual({ tone: 'danger', text: 'Teste encerrado: escolha um plano para voltar a vender' });
});

it('no bar for paid, internal or unknown', () => {
  expect(bannerFor('paid', null)).toBeNull();
  expect(bannerFor('internal', null)).toBeNull();
  expect(bannerFor(null, null)).toBeNull();
  expect(bannerFor(undefined, undefined)).toBeNull();
});
