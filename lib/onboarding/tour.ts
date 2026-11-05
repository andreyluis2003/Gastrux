/**
 * The guided test order (spec 2026-11-05 §3): the steps over the real screens. Each target is a
 * data-tour attribute on the screen; the tour never covers the page, the owner taps the real button.
 * Pure rules here (tested); components/onboarding/guided-tour.tsx draws them.
 */
export type TourScreen = 'vender' | 'comanda' | 'cozinha' | 'any';

export interface TourStep {
  id: string;
  screen: TourScreen;
  /** CSS selector of what to highlight; none = a card in the corner */
  target?: string;
  text: string;
  /** How the step ends: a tap on the target, a selector appearing, reaching a screen, or the card's button */
  advance: { on: 'click' } | { on: 'appears'; selector: string } | { on: 'screen'; screen: TourScreen } | { on: 'button'; label: string };
  /** Skipped when this selector is on the screen (the register was already open) */
  skipWhen?: string;
  /** Skipped when the target never shows (no register on this device yet) */
  skipWhenMissing?: boolean;
  /** A card button that goes to another screen */
  goTo?: { label: string; screen: TourScreen };
}

export const TEST_ORDER_NAME = 'Pedido de teste';
export const TEST_ORDER_CANCEL_REASON = 'Pedido de teste do primeiro acesso';
/**
 * Kitchen orders still open (the same list as OPEN_STATUSES in lib/kds/order-status.ts, which imports
 * prisma and cannot load in the browser): the comanda is only cancelled once they are cancelled.
 */
export const KITCHEN_OPEN = ['PENDING', 'PREPARING', 'READY', 'ON_HOLD'];

export const TOUR: TourStep[] = [
  {
    id: 'caixa', screen: 'vender', target: '[data-tour="caixa-bar"]',
    text: 'Primeiro, abra o caixa. Pode deixar o troco em R$ 0,00.',
    advance: { on: 'appears', selector: '[data-tour="caixa-aberto"]' },
    skipWhen: '[data-tour="caixa-aberto"]', skipWhenMissing: true,
  },
  { id: 'comanda', screen: 'vender', target: '[data-tour="comanda-nome"]', text: 'Toque em Comanda por nome.', advance: { on: 'click' } },
  {
    id: 'nome', screen: 'vender', target: '[data-tour="comanda-nome-form"]',
    text: `Escreva ${TEST_ORDER_NAME} e toque em Abrir.`, advance: { on: 'screen', screen: 'comanda' },
  },
  { id: 'produto', screen: 'comanda', target: '[data-tour="produto"]', text: 'Toque num produto para lançar na comanda.', advance: { on: 'click' } },
  { id: 'enviar', screen: 'comanda', target: '[data-tour="enviar"]', text: 'Agora envie para a cozinha.', advance: { on: 'click' } },
  {
    id: 'ir-cozinha', screen: 'any', text: 'Veja como o pedido chega na cozinha.',
    advance: { on: 'screen', screen: 'cozinha' }, goTo: { label: 'Abrir a cozinha', screen: 'cozinha' },
  },
  {
    id: 'cozinha', screen: 'cozinha', target: '[data-tour="kds-card"]',
    text: 'O pedido chegou. A cozinha toca para avançar: em preparo, pronto.', advance: { on: 'button', label: 'Entendi' },
  },
  {
    id: 'voltar', screen: 'any', text: 'Volte à comanda para ver a conta.',
    advance: { on: 'screen', screen: 'comanda' }, goTo: { label: 'Voltar à comanda', screen: 'comanda' },
  },
  {
    id: 'conta', screen: 'comanda', target: '[data-tour="conta"]',
    text: 'Em Conta você recebe e fecha a venda: dinheiro, PIX, cartão e dividir a conta.', advance: { on: 'button', label: 'Entendi' },
  },
  {
    id: 'fim', screen: 'any',
    text: 'Pronto! Você fez um pedido completo. Cancele o pedido de teste para ele não entrar no seu faturamento.',
    advance: { on: 'button', label: 'Cancelar o pedido de teste' },
  },
];

export interface TourState { step: number; sessionId?: string }
export const TOUR_KEY = 'gx-tour';

/** Which screen a path is (the comanda carries its id) */
export function screenOf(pathname: string): { screen: TourScreen | null; sessionId?: string } {
  if (pathname === '/vender') return { screen: 'vender' };
  const m = /^\/vender\/([^/]+)$/.exec(pathname);
  if (m) return { screen: 'comanda', sessionId: m[1] };
  if (pathname === '/cozinha') return { screen: 'cozinha' };
  return { screen: null };
}

export function screenHref(screen: TourScreen, sessionId?: string): string {
  if (screen === 'comanda') return sessionId ? `/vender/${sessionId}` : '/vender';
  if (screen === 'cozinha') return '/cozinha';
  return '/vender';
}

/** Whether this page is where the step happens */
export function onStepScreen(step: TourStep, pathname: string, state: TourState): boolean {
  if (step.screen === 'any') return true;
  const here = screenOf(pathname);
  if (here.screen !== step.screen) return false;
  // The comanda steps are on the test order, not on another table
  return step.screen !== 'comanda' || !state.sessionId || here.sessionId === state.sessionId;
}

/**
 * The state after the page changed: a step that ends on reaching a screen moves on (and the test
 * comanda is remembered when it opens).
 */
export function afterNavigation(state: TourState, pathname: string): TourState {
  const step = TOUR[state.step];
  if (!step || step.advance.on !== 'screen') return state;
  const here = screenOf(pathname);
  if (here.screen !== step.advance.screen) return state;
  if (step.advance.screen === 'comanda') {
    // Coming back must be to the same comanda; the first time, this one is the test order
    if (state.sessionId && here.sessionId !== state.sessionId) return state;
    return { step: state.step + 1, sessionId: state.sessionId ?? here.sessionId };
  }
  return { ...state, step: state.step + 1 };
}

export const nextStep = (state: TourState): TourState => ({ ...state, step: state.step + 1 });
export const isLastStep = (state: TourState) => state.step >= TOUR.length - 1;

/** The saved state, or null when there is none or it does not make sense any more */
export function parseTourState(raw: string | null): TourState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!Number.isInteger(v?.step) || v.step < 0 || v.step >= TOUR.length) return null;
    return { step: v.step, ...(typeof v.sessionId === 'string' && v.sessionId ? { sessionId: v.sessionId } : {}) };
  } catch {
    return null;
  }
}
