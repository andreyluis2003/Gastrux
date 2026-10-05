import { panelState } from '../../components/caixa/panel-state';

describe('panelState', () => {
  it('remaining while underpaid', () => expect(panelState(8000, [{ method: 'pix', amount: '50' }])).toMatchObject({ remainingCents: 3000, valid: false }));
  it('change from cash', () => expect(panelState(3750, [{ method: 'dinheiro', amount: '50' }])).toMatchObject({ changeCents: 1250, valid: true }));
  it('card over the total is invalid', () => expect(panelState(1000, [{ method: 'cartao de debito', amount: '11' }]).valid).toBe(false));
  it('mixed exact', () => expect(panelState(8000, [{ method: 'dinheiro', amount: '50' }, { method: 'cartao de credito', amount: '30' }])).toMatchObject({ remainingCents: 0, changeCents: 0, valid: true }));
});
