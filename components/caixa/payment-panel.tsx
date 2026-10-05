'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { brl } from './money';
import { panelState, type PanelPayment } from './panel-state';

export { panelState };
export type { PanelPayment };

const QUICK: Array<{ method: PanelPayment['method']; label: string }> = [
  { method: 'dinheiro', label: 'Dinheiro' }, { method: 'pix', label: 'PIX' },
  { method: 'cartao de credito', label: 'Crédito' }, { method: 'cartao de debito', label: 'Débito' },
];

/** Payment of a sale (spec §8.3): quick method buttons, several methods, change from cash. */
export function PaymentPanel({ totalCents, payments, onChange, disabled }: { totalCents: number; payments: PanelPayment[]; onChange: (p: PanelPayment[]) => void; disabled?: boolean }) {
  const state = panelState(totalCents, payments);
  const fill = (method: PanelPayment['method']) => {
    const rest = state.remainingCents || (payments.length ? 0 : totalCents);
    onChange([...payments, { method, amount: (rest / 100).toFixed(2).replace('.', ',') }]);
  };
  return (
    <div className="space-y-3">
      <p className="text-2xl font-bold text-center">{brl(totalCents)}</p>
      {payments.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-24 text-sm">{QUICK.find((q) => q.method === p.method)?.label}</span>
          <Input aria-label={`Valor em ${p.method}`} inputMode="decimal" value={p.amount} disabled={disabled}
            onChange={(e) => onChange(payments.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          <button type="button" className="text-red-600 text-sm" onClick={() => onChange(payments.filter((_, j) => j !== i))} disabled={disabled} aria-label="Remover forma">✕</button>
        </div>
      ))}
      {(state.remainingCents > 0 || payments.length === 0) && (
        <div>
          <p className="text-sm mb-1">{payments.length ? `Falta ${brl(state.remainingCents)}: adicionar outra forma` : 'Forma de pagamento'}</p>
          <div className="grid grid-cols-4 gap-2">
            {QUICK.map((q) => <Button key={q.method} type="button" variant="outline" onClick={() => fill(q.method)} disabled={disabled}>{q.label}</Button>)}
          </div>
        </div>
      )}
      {state.changeCents > 0 && <p className="text-lg font-semibold text-green-700">Troco: {brl(state.changeCents)}</p>}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </div>
  );
}
