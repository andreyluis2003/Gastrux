'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { reaisToCents } from './money';

/** "Caixa X está fechado" + Troco inicial + Abrir caixa. Also used inside the payment panel (Task 12). */
export function OpenShiftCard({ registerId, registerName, onOpened }: { registerId: string; registerName: string; onOpened: (sessionId: string) => void }) {
  const [float, setFloat] = useState('');
  const [saving, setSaving] = useState(false);
  const open = async () => {
    const cents = float.trim() ? reaisToCents(float, { allowZero: true }) : 0;
    if (cents === null) { toast.error('Troco inicial inválido'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/caixa/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ cashRegisterId: registerId, openingFloat: (cents / 100).toFixed(2) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Erro ao abrir o caixa'); return; }
      if (data.alreadyOpen) toast.info('Este caixa já estava aberto');
      else toast.success(`${registerName} aberto`);
      onOpened(data.session.id);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="p-6 max-w-md mx-auto text-center space-y-4">
      <h2 className="text-xl font-bold">{registerName} está fechado</h2>
      <div className="text-left">
        <label htmlFor="opening-float" className="text-sm font-semibold block mb-1">Troco inicial (R$)</label>
        <Input id="opening-float" inputMode="decimal" placeholder="0,00" value={float} onChange={(e) => setFloat(e.target.value)} disabled={saving} />
      </div>
      <Button size="lg" className="w-full" onClick={open} disabled={saving}>{saving ? 'Abrindo...' : 'Abrir caixa'}</Button>
    </Card>
  );
}
