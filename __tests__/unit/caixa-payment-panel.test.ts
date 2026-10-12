import { finishHint, panelState } from '../../components/caixa/panel-state';
import { brl } from '../../components/caixa/money';

describe('panelState', () => {
  it('remaining while underpaid', () => expect(panelState(8000, [{ method: 'pix', amount: '50' }])).toMatchObject({ remainingCents: 3000, valid: false }));
  it('change from cash', () => expect(panelState(3750, [{ method: 'dinheiro', amount: '50' }])).toMatchObject({ changeCents: 1250, valid: true }));
  it('card over the total is invalid', () => expect(panelState(1000, [{ method: 'cartao de debito', amount: '11' }]).valid).toBe(false));
  it('mixed exact', () => expect(panelState(8000, [{ method: 'dinheiro', amount: '50' }, { method: 'cartao de credito', amount: '30' }])).toMatchObject({ remainingCents: 0, changeCents: 0, valid: true }));
});

describe('finishHint (2026-10-12: "Finalizar venda" was disabled with no reason on screen)', () => {
  it('asks for the payment method when none was chosen', () => {
    expect(finishHint(3200, [])).toBe('Escolha a forma de pagamento');
  });
  it('says nothing when the sale can be finished', () => {
    expect(finishHint(3200, [{ method: 'dinheiro', amount: '32,00' }])).toBeNull();
  });
  it('says what is missing when the payments do not cover the total', () => {
    expect(finishHint(3200, [{ method: 'pix', amount: '20' }])).toBe(`Falta ${brl(1200)}`) // brl writes R$ with a no-break space;
  });
  it('repeats the panel error otherwise', () => {
    expect(finishHint(1000, [{ method: 'cartao de debito', amount: '11' }])).toBe('Cartão e PIX não podem passar do total');
  });
});
