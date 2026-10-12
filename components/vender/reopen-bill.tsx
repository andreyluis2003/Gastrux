'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeviceShift } from '@/lib/caixa/use-device-shift';

/**
 * "Reabrir conta" on a closed comanda (2026-10-12: a test receipt "Crédito" recorded by mistake had no way back).
 * A manager, with a reason (rule of the API): the money received in the drawer goes back in this device's
 * shift and the bill is open again, so items can be removed and it can be received again. Online payments
 * stay on the bill. Refused while the table has another open comanda.
 */
export function ReopenBill({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const { data } = useSession();
  const role = (data?.user as any)?.role as string | undefined;
  const shift = useDeviceShift();
  const [busy, setBusy] = useState(false);
  if (!['OWNER', 'MANAGER', 'ADMIN'].includes(role ?? '')) return null;

  async function reopen() {
    const reason = window.prompt('Reabrir esta conta (exige gerente). O valor recebido no caixa volta para a gaveta. Motivo:');
    if (reason === null) return;
    if (reason.trim().length < 3) { toast.error('Informe o motivo da reabertura'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/comanda/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OPEN', reason: reason.trim(), cashSessionId: shift.shiftId ?? undefined }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || 'Não foi possível reabrir a conta'); return; }
      toast.success('Conta reaberta');
      onDone();
    } catch {
      toast.error('Sem conexão: tente de novo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" className="gap-2" disabled={busy} onClick={reopen}>
      <RotateCcw className="h-4 w-4" /> Reabrir conta
    </Button>
  );
}
