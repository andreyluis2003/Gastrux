import { TOUR, afterNavigation, isLastStep, nextStep, onStepScreen, parseTourState, screenHref, screenOf } from '@/lib/onboarding/tour';

const idx = (id: string) => TOUR.findIndex((s) => s.id === id);

describe('primeiro acesso guiado: the test order tour', () => {
  it('goes caixa, comanda, product, send, kitchen, back, conta, end', () => {
    expect(TOUR.map((s) => s.id)).toEqual(['caixa', 'comanda', 'nome', 'produto', 'enviar', 'ir-cozinha', 'cozinha', 'voltar', 'conta', 'fim']);
    // Every highlighted step points at a data-tour attribute
    for (const s of TOUR) if (s.target) expect(s.target).toMatch(/^\[data-tour="[a-z-]+"\]$/);
  });

  it('knows the screens and their links', () => {
    expect(screenOf('/vender')).toEqual({ screen: 'vender' });
    expect(screenOf('/vender/abc')).toEqual({ screen: 'comanda', sessionId: 'abc' });
    expect(screenOf('/cozinha')).toEqual({ screen: 'cozinha' });
    expect(screenOf('/vender/abc/x')).toEqual({ screen: null });
    expect(screenOf('/dashboard')).toEqual({ screen: null });
    expect(screenHref('comanda', 'abc')).toBe('/vender/abc');
    expect(screenHref('comanda')).toBe('/vender');
    expect(screenHref('cozinha')).toBe('/cozinha');
  });

  it('opening the comanda moves on and remembers it as the test order', () => {
    const s = afterNavigation({ step: idx('nome') }, '/vender/s1');
    expect(s).toEqual({ step: idx('produto'), sessionId: 's1' });
    // Still on Vender: nothing changes
    expect(afterNavigation({ step: idx('nome') }, '/vender')).toEqual({ step: idx('nome') });
  });

  it('going to the kitchen and back to the same comanda moves on; another comanda does not', () => {
    expect(afterNavigation({ step: idx('ir-cozinha'), sessionId: 's1' }, '/cozinha')).toEqual({ step: idx('cozinha'), sessionId: 's1' });
    expect(afterNavigation({ step: idx('voltar'), sessionId: 's1' }, '/vender/s2')).toEqual({ step: idx('voltar'), sessionId: 's1' });
    expect(afterNavigation({ step: idx('voltar'), sessionId: 's1' }, '/vender/s1')).toEqual({ step: idx('conta'), sessionId: 's1' });
  });

  it('a step that ends with a tap does not move on by changing page', () => {
    expect(afterNavigation({ step: idx('produto'), sessionId: 's1' }, '/cozinha')).toEqual({ step: idx('produto'), sessionId: 's1' });
  });

  it('the comanda steps only show on the test comanda', () => {
    const produto = TOUR[idx('produto')];
    expect(onStepScreen(produto, '/vender/s1', { step: idx('produto'), sessionId: 's1' })).toBe(true);
    expect(onStepScreen(produto, '/vender/s2', { step: idx('produto'), sessionId: 's1' })).toBe(false);
    expect(onStepScreen(produto, '/vender', { step: idx('produto'), sessionId: 's1' })).toBe(false);
    expect(onStepScreen(TOUR[idx('fim')], '/dashboard', { step: idx('fim') })).toBe(true);
  });

  it('reads the saved state safely', () => {
    expect(parseTourState(null)).toBeNull();
    expect(parseTourState('nope')).toBeNull();
    expect(parseTourState('{"step":99}')).toBeNull();
    expect(parseTourState('{"step":-1}')).toBeNull();
    expect(parseTourState('{"step":3,"sessionId":"s1"}')).toEqual({ step: 3, sessionId: 's1' });
    expect(parseTourState('{"step":0,"sessionId":5}')).toEqual({ step: 0 });
    expect(isLastStep({ step: TOUR.length - 1 })).toBe(true);
    expect(nextStep({ step: 0, sessionId: 'x' })).toEqual({ step: 1, sessionId: 'x' });
  });
});

describe('the test order cancel', () => {
  it('waits for the same kitchen statuses the comanda cancel refuses', () => {
    jest.isolateModules(() => {
      jest.doMock('@/lib/prisma', () => ({ prisma: {} }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OPEN_STATUSES } = require('@/lib/kds/order-status');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { KITCHEN_OPEN } = require('@/lib/onboarding/tour');
      expect([...KITCHEN_OPEN].sort()).toEqual([...OPEN_STATUSES].sort());
    });
  });
});
