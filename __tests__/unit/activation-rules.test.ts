/**
 * Activation agent rules (spec 2026-10-27): when a trial account gets a nudge, and which one.
 * `now` is 2026-10-28T15:00Z, 11:00 in Sinop (America/Cuiaba, UTC-4).
 */
import { decide, type ActivationSignals } from '../../lib/agents/activation/rules';
import type { FirstStep, FirstStepKey } from '../../lib/onboarding/first-steps';

const now = new Date('2026-10-28T15:00:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(now.getTime() - ms);

const STEP_KEYS: FirstStepKey[] = ['caixa', 'venda', 'cardapio', 'mesas', 'endereco', 'nfce'];
function steps(done: FirstStepKey[] = []): FirstStep[] {
  return STEP_KEYS.map((key) => ({ key, label: key, href: key === 'cardapio' ? '/admin/cardapio' : '/vender', done: done.includes(key) }));
}

function make(o: Partial<ActivationSignals> & { done?: FirstStepKey[] } = {}): ActivationSignals {
  const { done = [], ...rest } = o;
  const st = steps(done);
  return {
    restaurantId: 'r1', restaurantName: 'Pizzaria Teste', ownerId: 'u1', ownerName: 'Maria Silva',
    email: 'maria@x.test', whatsapp: '5566999998888', businessType: 'pizzaria', timezone: 'America/Cuiaba',
    createdAt: ago(6 * MIN), trialEndsAt: new Date(now.getTime() + 14 * DAY), status: 'TRIAL', stage: 'SIGNED_UP',
    lastActivityAt: ago(MIN), steps: st, stepsDone: st.filter((s) => s.done).length, excluded: false, sent: [],
    ...rest,
  };
}
const welcomed = (when = DAY + HOUR) => [{ trigger: 'boas_vindas', createdAt: ago(when), stepsDone: 0 }];

describe('decide', () => {
  it('waits 5 minutes after sign-up, then welcomes', () => {
    expect(decide(make({ createdAt: ago(4 * MIN) }), now)).toBeNull();
    expect(decide(make(), now)?.trigger).toBe('boas_vindas');
  });

  it('day 1 with the menu still to do: cardapio_parado pointing at the menu', () => {
    const d = decide(make({ createdAt: ago(DAY + 2 * HOUR), sent: welcomed() }), now);
    expect(d?.trigger).toBe('cardapio_parado');
    expect(d?.nextStep?.key).toBe('cardapio');
  });

  it('day 2, menu done, no cash shift: sem_caixa', () => {
    expect(decide(make({ createdAt: ago(2 * DAY + HOUR), done: ['cardapio'], sent: welcomed() }), now)?.trigger).toBe('sem_caixa');
  });

  it('day 3, cash opened, no sale: sem_venda', () => {
    const d = decide(make({ createdAt: ago(3 * DAY + HOUR), done: ['cardapio', 'caixa'], sent: welcomed(2 * DAY) }), now);
    expect(d?.trigger).toBe('sem_venda');
    expect(d?.nextStep?.key).toBe('venda');
  });

  it('nobody came back in 3 days and no sale yet: sumiu', () => {
    const sent = [
      { trigger: 'cardapio_parado', createdAt: ago(2 * DAY), stepsDone: 1 },
      { trigger: 'boas_vindas', createdAt: ago(4 * DAY), stepsDone: 0 },
    ];
    expect(decide(make({ createdAt: ago(4 * DAY), lastActivityAt: ago(3 * DAY + HOUR), done: ['mesas'], stepsDone: 2, sent }), now)?.trigger).toBe('sumiu');
  });

  it('first sale gets a congratulation once', () => {
    const s = make({ createdAt: ago(2 * DAY), done: ['cardapio', 'caixa', 'venda'], sent: welcomed() });
    expect(decide(s, now)?.trigger).toBe('primeira_venda');
    const after = { ...s, sent: [{ trigger: 'primeira_venda', createdAt: ago(DAY + HOUR), stepsDone: 3 }, ...welcomed(2 * DAY)] };
    expect(decide(after, now)?.trigger).not.toBe('primeira_venda');
  });

  it('trial ending in 4 days: selling gets a client nudge, not selling alerts the owner', () => {
    const base = { createdAt: ago(10 * DAY), trialEndsAt: new Date(now.getTime() + 4 * DAY) };
    const selling = decide(make({ ...base, done: ['cardapio', 'caixa', 'venda'], sent: [{ trigger: 'primeira_venda', createdAt: ago(5 * DAY), stepsDone: 3 }] }), now);
    expect(selling).toMatchObject({ trigger: 'fim_teste_vendendo', ownerAlert: false });
    const notSelling = decide(make({ ...base, sent: welcomed(9 * DAY) }), now);
    expect(notSelling).toMatchObject({ trigger: 'fim_teste_sem_venda', ownerAlert: true });
  });

  it('the trial-end alert starts with 5 days left (spec §5), not before', () => {
    const s = (left: number) => make({ createdAt: ago(25 * DAY), trialEndsAt: new Date(now.getTime() + left), sent: welcomed(24 * DAY) });
    expect(decide(s(5 * DAY - HOUR), now)?.trigger).toBe('fim_teste_sem_venda');
    expect(decide(s(5 * DAY + HOUR), now)?.trigger).not.toBe('fim_teste_sem_venda');
  });

  it('two messages and no step moved, the last one 3 days old: travou alerts the owner', () => {
    const sent = [
      { trigger: 'cardapio_parado', createdAt: ago(3 * DAY + HOUR), stepsDone: 1 },
      { trigger: 'boas_vindas', createdAt: ago(5 * DAY), stepsDone: 1 },
    ];
    expect(decide(make({ createdAt: ago(5 * DAY), done: ['mesas'], sent }), now)).toMatchObject({ trigger: 'travou', ownerAlert: true });
  });

  it('trial ended yesterday without paying: o_que_faltou', () => {
    const d = decide(make({ createdAt: ago(15 * DAY), trialEndsAt: ago(DAY), sent: welcomed(14 * DAY) }), now);
    expect(d).toMatchObject({ trigger: 'o_que_faltou', ownerAlert: false });
  });

  describe('limits', () => {
    it('one client message a day', () => {
      expect(decide(make({ createdAt: ago(2 * DAY), sent: welcomed(20 * HOUR) }), now)).toBeNull();
    });

    it('an owner alert is not held by the daily limit', () => {
      const s = make({ createdAt: ago(10 * DAY), trialEndsAt: new Date(now.getTime() + 3 * DAY), sent: welcomed(20 * HOUR) });
      expect(decide(s, now)?.trigger).toBe('fim_teste_sem_venda');
    });

    it('three client messages in 7 days', () => {
      const sent = [
        { trigger: 'sem_caixa', createdAt: ago(DAY + HOUR), stepsDone: 1 },
        { trigger: 'cardapio_parado', createdAt: ago(3 * DAY), stepsDone: 0 },
        { trigger: 'boas_vindas', createdAt: ago(5 * DAY), stepsDone: 0 },
      ];
      expect(decide(make({ createdAt: ago(6 * DAY), done: ['cardapio', 'caixa'], lastActivityAt: ago(HOUR), sent }), now)).toBeNull();
    });

    it('two rows of the same trigger (e-mail and WhatsApp) count as one message', () => {
      const sent = [
        { trigger: 'boas_vindas', createdAt: ago(DAY + HOUR), stepsDone: 0 },
        { trigger: 'boas_vindas', createdAt: ago(DAY + HOUR), stepsDone: 0 },
      ];
      expect(decide(make({ createdAt: ago(DAY + 2 * HOUR), sent }), now)?.trigger).toBe('cardapio_parado');
    });

    it('only between 08:00 and 20:00 local time', () => {
      expect(decide(make({ createdAt: new Date('2026-10-28T00:00:00Z') }), new Date('2026-10-29T01:00:00Z'))).toBeNull(); // 21:00 in Sinop
      expect(decide(make({ createdAt: new Date('2026-10-28T00:00:00Z') }), new Date('2026-10-28T11:59:00Z'))).toBeNull(); // 07:59
      expect(decide(make({ createdAt: new Date('2026-10-28T00:00:00Z') }), new Date('2026-10-28T12:00:00Z'))?.trigger).toBe('boas_vindas'); // 08:00
    });

    it('signed up at 22:00 local: the welcome waits for 08:00 and is not lost', () => {
      const s = make({ createdAt: new Date('2026-10-29T02:00:00Z') }); // 22:00 in Sinop
      expect(decide(s, new Date('2026-10-29T02:10:00Z'))).toBeNull();
      expect(decide(s, new Date('2026-10-29T12:05:00Z'))?.trigger).toBe('boas_vindas');
    });

    it('never for an excluded account', () => {
      expect(decide(make({ excluded: true }), now)).toBeNull();
    });

    it('never for a paying account', () => {
      expect(decide(make({ stage: 'PAYING' }), now)).toBeNull();
    });

    it('a trigger already used never repeats', () => {
      expect(decide(make({ createdAt: ago(10 * MIN), sent: [{ trigger: 'boas_vindas', createdAt: ago(10 * DAY), stepsDone: 0 }] }), now)).toBeNull();
    });
  });

  it('priority: an owner alert comes first, then the first-sale congratulation', () => {
    const stuck = make({
      createdAt: ago(10 * DAY), trialEndsAt: new Date(now.getTime() + 2 * DAY),
      sent: [
        { trigger: 'cardapio_parado', createdAt: ago(4 * DAY), stepsDone: 0 },
        { trigger: 'boas_vindas', createdAt: ago(9 * DAY), stepsDone: 0 },
      ],
    });
    expect(decide(stuck, now)?.trigger).toBe('fim_teste_sem_venda');
    const selling = make({ createdAt: ago(10 * DAY), trialEndsAt: new Date(now.getTime() + 2 * DAY), done: ['cardapio', 'caixa', 'venda'], sent: welcomed(9 * DAY) });
    expect(decide(selling, now)?.trigger).toBe('primeira_venda');
  });

  it('priority: welcome before the step nudges', () => {
    expect(decide(make({ createdAt: ago(3 * DAY), done: ['cardapio', 'caixa'] }), now)?.trigger).toBe('boas_vindas');
  });
});
