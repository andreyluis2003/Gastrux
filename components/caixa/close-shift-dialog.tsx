'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { exceedsAlert } from '@/lib/caixa/rules';
import { CashCounter } from './cash-counter';
import { brl } from './money';
import { buildCountedPayload, COUNT_FIELDS, type CountKey } from './counted';

export { buildCountedPayload };

type Key = CountKey;
const FIELDS = COUNT_FIELDS;

/** Blind close in 3 steps (spec §8.2): count without seeing the expected, confirm, then see the difference. */
export function CloseShiftDialog({ sessionId, registerName, onClose, onClosed }: { sessionId: string; registerName: string; onClose: () => void; onClosed: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fields, setFields] = useState<Record<Key, string>>({ dinheiro: '', pix: '', credito: '', debito: '', outros: '' });
  const [notes, setNotes] = useState('');
  const [showCounter, setShowCounter] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  const confirm = async () => {
    const { counted, invalid } = buildCountedPayload(fields);
    if (invalid.length) { toast.error(`Valor inválido: ${invalid.join(', ')}`); setStep(1); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/caixa/sessions/${sessionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `close-${sessionId}` },
        body: JSON.stringify({ counted, notes: notes.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Erro ao fechar o caixa'); return; }
      setResult(data.result);
      setStep(3);
      onClosed();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="close-title">
      <Card className="max-w-lg w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 id="close-title" className="text-xl font-bold">Fechar {registerName}</h2>
        {step === 1 && (
          <>
            <p className="text-sm text-gray-600">Conte o dinheiro da gaveta e confira no relatório da maquininha o total de cada forma. O valor esperado aparece só depois de confirmar.</p>
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label htmlFor={`count-${key}`} className="text-sm font-semibold block mb-1">{label} (R$)</label>
                <Input id={`count-${key}`} inputMode="decimal" placeholder="0,00" value={fields[key]} onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))} />
                {key === 'dinheiro' && (
                  <button type="button" className="text-xs underline mt-1" onClick={() => setShowCounter((v) => !v)}>{showCounter ? 'Esconder' : 'Contar cédulas e moedas'}</button>
                )}
                {key === 'dinheiro' && showCounter && <CashCounter onTotal={(c) => setFields((p) => ({ ...p, dinheiro: (c / 100).toFixed(2).replace('.', ',') }))} />}
              </div>
            ))}
            <label htmlFor="close-notes" className="text-sm font-semibold block">Observação (opcional)</label>
            <Input id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose}>Voltar</Button>
              <Button onClick={() => setStep(2)}>Continuar</Button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p>Depois de confirmar, os valores não podem ser alterados.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Corrigir</Button>
              <Button className="bg-red-600" onClick={confirm} disabled={saving}>{saving ? 'Fechando...' : 'Confirmar fechamento'}</Button>
            </div>
          </>
        )}
        {step === 3 && result && (
          <>
            <table className="w-full text-sm">
              <thead><tr className="text-left"><th>Forma</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferença</th></tr></thead>
              <tbody>
                {FIELDS.map(({ key, label }) => {
                  const exp = result.expected[key] ?? 0; const cnt = result.counted[key] ?? 0; const diff = result.difference[key] ?? 0;
                  if (!exp && !cnt && key !== 'dinheiro') return null;
                  const color = diff === 0 ? 'text-green-700' : exceedsAlert(exp, diff) ? 'text-red-700 font-bold' : 'text-amber-700';
                  return <tr key={key}><td>{label}</td><td className="text-right">{brl(exp)}</td><td className="text-right">{brl(cnt)}</td><td className={`text-right ${color}`}>{brl(diff)}</td></tr>;
                })}
              </tbody>
            </table>
            {result.alreadyClosed && <p className="text-sm text-amber-700">Este caixa já tinha sido fechado; estes são os valores do primeiro fechamento.</p>}
            {result.alertMethods?.length > 0 && <p className="text-sm text-red-700">Diferença acima do limite: o dono foi avisado.</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => printInHiddenFrame(`/imprimir/caixa/fechamento/${sessionId}`)}>Imprimir fechamento</Button>
              <Button onClick={onClose}>Concluir</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
