import { buildGuide, defaultChannels, parseGuideState } from '@/lib/onboarding/guide';
import type { FirstStep } from '@/lib/onboarding/first-steps';

const steps = (done: Partial<Record<FirstStep['key'], boolean>> = {}): FirstStep[] => [
  { key: 'caixa', label: 'Abrir o caixa', href: '/vender', done: !!done.caixa },
  { key: 'venda', label: 'Fazer a primeira venda', href: '/vender', done: !!done.venda },
  { key: 'cardapio', label: 'Cadastrar seus produtos e preços', href: '/admin/cardapio', done: !!done.cardapio },
  { key: 'mesas', label: 'Cadastrar as mesas', href: '/admin/tables', done: !!done.mesas },
  { key: 'equipe', label: 'Cadastrar a equipe', href: '/admin/staff', done: !!done.equipe, optional: true },
  { key: 'endereco', label: 'Completar o endereço', href: '/admin/settings', done: !!done.endereco },
  { key: 'nfce', label: 'Configurar a nota fiscal (NFC-e)', href: '/admin/fiscal', done: !!done.nfce },
];

const keys = (g: ReturnType<typeof buildGuide>) => g.groups.map((x) => [x.id, x.steps.map((s) => s.key)]);

describe('primeiro acesso guiado: the guide', () => {
  it('channels default by the business type', () => {
    expect(defaultChannels('espetaria')).toEqual(['balcao', 'mesas']);
    expect(defaultChannels('bar')).toEqual(['balcao', 'mesas']);
    expect(defaultChannels('restaurantes')).toEqual(['balcao', 'mesas']);
    expect(defaultChannels('pizzaria')).toEqual(['balcao', 'delivery']);
    expect(defaultChannels('marmitaria')).toEqual(['balcao', 'delivery']);
    expect(defaultChannels('padaria')).toEqual(['balcao']);
    expect(defaultChannels(null)).toEqual(['balcao']);
    expect(defaultChannels('algo-novo')).toEqual(['balcao']);
  });

  it('reads only what it knows from the stored JSON', () => {
    expect(parseGuideState(null)).toEqual({});
    expect(parseGuideState('x')).toEqual({});
    expect(parseGuideState({ channels: ['mesas', 'drone', 'mesas', 'delivery'], marks: { testOrder: '2026-11-05T10:00:00.000Z', hacked: 'y', qrcodes: 3 } }))
      .toEqual({ channels: ['mesas', 'delivery'], marks: { testOrder: '2026-11-05T10:00:00.000Z' } });
  });

  it('balcão only: just the first group, test order first', () => {
    const g = buildGuide({ steps: steps(), state: {}, businessType: 'padaria', deliveryOrders: 0 });
    expect(g.channels).toEqual(['balcao']);
    expect(g.channelsChosen).toBe(false);
    expect(keys(g)).toEqual([['inicio', ['teste', 'cardapio', 'caixa', 'venda', 'endereco', 'nfce']]]);
    expect(g.groups[0].steps[0]).toMatchObject({ label: 'Fazer o pedido de teste guiado', minutes: 3, done: false });
    expect(g).toMatchObject({ done: 0, total: 6 });
  });

  it('mesas and delivery add their groups; team stays optional and out of the count', () => {
    const g = buildGuide({ steps: steps({ mesas: true, equipe: true }), state: { channels: ['balcao', 'mesas', 'delivery'] }, businessType: 'padaria', deliveryOrders: 0 });
    expect(g.channelsChosen).toBe(true);
    expect(keys(g)).toEqual([
      ['inicio', ['teste', 'cardapio', 'caixa', 'venda', 'endereco', 'nfce']],
      ['mesas', ['mesas', 'qrcodes', 'equipe']],
      ['delivery', ['deliveryLink', 'deliveryOrder']],
    ]);
    expect(g.groups[1].steps[2]).toMatchObject({ optional: true, done: true });
    expect(g).toMatchObject({ done: 1, total: 10 });
  });

  it('the new steps are done by the marks and by a site order', () => {
    const g = buildGuide({
      steps: steps(),
      state: { channels: ['mesas', 'delivery'], marks: { testOrder: '2026-11-05T10:00:00.000Z', qrcodes: '2026-11-05T10:00:00.000Z', deliveryLink: '2026-11-05T10:00:00.000Z' } },
      businessType: null,
      deliveryOrders: 1,
    });
    const all = Object.fromEntries(g.groups.flatMap((x) => x.steps).map((s) => [s.key, s.done]));
    expect(all).toMatchObject({ teste: true, qrcodes: true, deliveryLink: true, deliveryOrder: true });
    // An empty or balcão-less choice still shows the first group
    expect(g.groups[0].id).toBe('inicio');
  });

  it('every step says how long it takes and where to go', () => {
    const g = buildGuide({ steps: steps(), state: { channels: ['balcao', 'mesas', 'delivery'] }, businessType: null, deliveryOrders: 0 });
    for (const s of g.groups.flatMap((x) => x.steps)) {
      expect(s.minutes).toBeGreaterThan(0);
      expect(s.href.startsWith('/')).toBe(true);
    }
  });
});
