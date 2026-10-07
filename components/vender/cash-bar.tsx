'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useDeviceShift } from '@/lib/caixa/use-device-shift';
import { OpenShiftCard } from '@/components/caixa/open-shift-card';
import { Button } from '@/components/ui/button';

/** Always-visible cash register status on the Vender screen (spec 2026-10-07, 4.1 item 1) */
export function CashBar() {
  const shift = useDeviceShift();
  const { data } = useSession();
  const [opening, setOpening] = useState(false);
  const role = (data?.user as any)?.role as string | undefined;
  const canOpen = ['OWNER', 'MANAGER', 'CASHIER', 'ADMIN'].includes(role ?? '');

  if (shift.loading || !shift.register) return null;
  if (shift.shiftId) {
    const since = shift.shiftOpenedAt ? new Date(shift.shiftOpenedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    return (
      <Link href="/caixa" className="block rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-800">
        Caixa aberto · {shift.register.name}{since ? ` · desde ${since}` : ''}
      </Link>
    );
  }
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-900 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span>Caixa fechado{canOpen ? '' : ': peça para abrir o caixa antes de receber'}</span>
        {canOpen && !opening && <Button size="sm" onClick={() => setOpening(true)}>Abrir caixa</Button>}
      </div>
      {opening && (
        <OpenShiftCard registerId={shift.register.id} registerName={shift.register.name} onOpened={() => { setOpening(false); shift.refresh(); }} />
      )}
    </div>
  );
}
