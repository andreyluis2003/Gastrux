'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TapKey } from '@/lib/labels/tap-key';

/**
 * Used / Discarded for one food label (spec 2026-10-09 etiquetas, 5.3, 5.4). Discarding asks a
 * second tap (no browser confirm); one Idempotency-Key per action, so a retried tap settles once.
 */
export function SettleButtons({ labelId, onDone }: { labelId: string; onDone: () => void }) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const keys = useRef({ USED: new TapKey(), DISCARDED: new TapKey() });

  const settle = async (action: 'USED' | 'DISCARDED') => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/labels/${labelId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': keys.current[action].get() },
        body: JSON.stringify({ action }),
      });
      keys.current[action].answered();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Não foi possível dar baixa');
        return;
      }
      toast.success(action === 'USED' ? 'Marcada como usada' : body.wasteLogs ? 'Descartada e lançada no desperdício' : 'Descartada');
      onDone();
    } catch {
      keys.current[action].lost();
      toast.error('Sem resposta do servidor: confira antes de tentar de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => settle('USED')}>Usado</Button>
      {confirmDiscard ? (
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => settle('DISCARDED')}>Confirmar descarte</Button>
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDiscard(true)}>Descartado</Button>
      )}
    </div>
  );
}
