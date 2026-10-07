import { clientAlerts, clientStage, type ClientSignals } from '../../lib/admin/client-health';

const now = new Date('2026-10-07T12:00:00Z');
const base: ClientSignals = {
  status: 'TRIAL', subscriptionStatus: 'trialing', trialEndsAt: new Date('2026-10-20T12:00:00Z'),
  createdAt: new Date('2026-10-06T12:00:00Z'), lastSignInAt: new Date('2026-10-07T10:00:00Z'),
  menuItems: 0, closedBills: 0, closedBills30d: 0, mpStatus: null, openTickets: 0,
};
const texts = (s: Partial<ClientSignals>) => clientAlerts({ ...base, ...s }, now).map((a) => a.text);

describe('client stage', () => {
  it('moves from sign-up to menu to selling; paying wins', () => {
    expect(clientStage(base)).toBe('SIGNED_UP');
    expect(clientStage({ ...base, menuItems: 3 })).toBe('MENU_READY');
    expect(clientStage({ ...base, menuItems: 3, closedBills: 1 })).toBe('SELLING');
    expect(clientStage({ ...base, status: 'ACTIVE', subscriptionStatus: 'active' })).toBe('PAYING');
  });
});

describe('client alerts', () => {
  it('a new, active client has nothing to flag', () => {
    expect(texts({})).toEqual([]);
  });

  it('flags the trial ending and an expired trial', () => {
    expect(texts({ trialEndsAt: new Date('2026-10-09T12:00:00Z') })).toContain('Teste acaba em 2 dias');
    expect(texts({ trialEndsAt: new Date('2026-10-07T20:00:00Z') })).toContain('Teste acaba em 1 dia');
    expect(texts({ trialEndsAt: new Date('2026-10-01T12:00:00Z') })).toContain('Teste vencido');
  });

  it('flags a client stuck at sign-up or who stopped coming back', () => {
    expect(texts({ createdAt: new Date('2026-10-04T12:00:00Z') })).toContain('Parado no cadastro: sem cardápio');
    expect(texts({ lastSignInAt: new Date('2026-09-28T12:00:00Z'), menuItems: 5, closedBills: 2 })).toEqual(['Sem entrar há 9 dias']);
    expect(texts({ createdAt: new Date('2026-09-20T12:00:00Z'), lastSignInAt: new Date('2026-10-07T09:00:00Z'), menuItems: 5 })).toEqual(['Montou o cardápio mas não vendeu']);
  });

  it('red alerts come first; cancelled accounts are not chased for inactivity', () => {
    const a = clientAlerts({ ...base, openTickets: 1, mpStatus: 'NEEDS_RECONNECT' }, now);
    expect(a.map((x) => x.level)).toEqual(['red', 'yellow']);
    expect(texts({ status: 'CANCELLED', createdAt: new Date('2026-08-01T12:00:00Z'), lastSignInAt: null })).toEqual([]);
  });
});

describe('whatsapp link', () => {
  it('takes a Brazilian phone typed any way', () => {
    const { whatsappLink } = require('../../lib/admin/client-health');
    expect(whatsappLink('(11) 98888-7777')).toBe('https://wa.me/5511988887777');
    expect(whatsappLink('+55 11 3333-4444')).toBe('https://wa.me/551133334444');
    expect(whatsappLink('(55) 99999-8888')).toBe('https://wa.me/5555999998888');
    expect(whatsappLink('1234')).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });
});
