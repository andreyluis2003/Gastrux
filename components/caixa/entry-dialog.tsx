'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOutbox } from '@/components/offline/outbox-provider';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { OfflineUnavailableError } from '@/lib/offline/outbox';
import { reaisToCents, brl } from './money';

const TITLE = { WITHDRAWAL: 'Sangria', SUPPLY: 'Suprimento', EXPENSE: 'Despesa' } as const;
const HELP = {
  WITHDRAWAL: 'Retirada de dinheiro da gaveta (depósito, cofre).',
  SUPPLY: 'Dinheiro colocado na gaveta (troco extra).',
  EXPENSE: 'Conta paga com o dinheiro do caixa.',
} as const;

/** Sangria / suprimento / despesa: value, reason (category for an expense), receipt printed on confirm. */
export function EntryDialog({ sessionId, type, open, onClose, onDone }: { sessionId: string; type: 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE'; open: boolean; onClose: () => void; onDone: () => void }) {
  const { send } = useOutbox();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('compras');
  const [saving, setSaving] = useState(false);
  const [needsForce, setNeedsForce] = useState(false);
  if (!open) return null;

  const submit = async (force = false) => {
    const cents = reaisToCents(amount);
    if (!cents) { toast.error('Informe um valor válido'); return; }
    if (type !== 'SUPPLY' && !description.trim()) { toast.error('Informe o motivo'); return; }
    setSaving(true);
    try {
      const result = await send({
        method: 'POST',
        url: `/api/caixa/sessions/${sessionId}/entries`,
        label: `${TITLE[type]} ${brl(cents)}`,
        scope: 'cash-entry',
        queueable: false,
        body: { type, amount: (cents / 100).toFixed(2), description: description.trim() || undefined, category: type === 'EXPENSE' ? category : undefined, force },
      });
      if (result.queued) return;
      const data = await result.response.json().catch(() => ({}));
      if (result.response.status === 409 && data.code === 'CASH_NOT_ENOUGH') { setNeedsForce(true); toast.warning(data.error); return; }
      if (!result.response.ok) { toast.error(data.error || 'Erro ao lançar'); return; }
      if (data.warning) toast.warning(data.warning);
      toast.success(`${TITLE[type]} lançada`, { action: { label: 'Imprimir de novo', onClick: () => printInHiddenFrame(`/imprimir/caixa/lancamento/${data.entry.id}`) }, duration: 10000 });
      printInHiddenFrame(`/imprimir/caixa/lancamento/${data.entry.id}`);
      setAmount(''); setDescription(''); setNeedsForce(false);
      onDone();
      onClose();
    } catch (error) {
      // Cash entries are not queued offline: say so instead of failing silently
      toast.error(error instanceof OfflineUnavailableError ? error.message : 'Erro ao lançar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="entry-title">
      <Card className="max-w-sm w-full p-6 space-y-3">
        <h2 id="entry-title" className="text-xl font-bold">{TITLE[type]}</h2>
        <p className="text-sm text-gray-600">{HELP[type]}</p>
        <label htmlFor="entry-amount" className="text-sm font-semibold block">Valor (R$)</label>
        <Input id="entry-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" disabled={saving} />
        {type === 'EXPENSE' && (
          <>
            <label htmlFor="entry-category" className="text-sm font-semibold block">Categoria</label>
            <select id="entry-category" className="w-full border rounded-md h-10 px-3 bg-background" value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
              <option value="compras">Compras</option>
              <option value="entregador">Entregador</option>
              <option value="outros">Outros</option>
            </select>
          </>
        )}
        <label htmlFor="entry-description" className="text-sm font-semibold block">{type === 'SUPPLY' ? 'Observação (opcional)' : 'Motivo'}</label>
        <Input id="entry-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} disabled={saving} />
        {needsForce && <p className="text-sm text-amber-700">O caixa não tem esse valor em dinheiro. Só um gerente pode confirmar mesmo assim.</p>}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Voltar</Button>
          {needsForce ? (
            <Button onClick={() => submit(true)} disabled={saving} className="bg-amber-600">Confirmar mesmo assim</Button>
          ) : (
            <Button onClick={() => submit(false)} disabled={saving}>{saving ? 'Lançando...' : 'Confirmar'}</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
