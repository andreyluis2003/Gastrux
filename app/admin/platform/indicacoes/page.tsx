'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Status = 'TRIAL' | 'CONFIRMING' | 'EARNED' | 'APPLIED' | 'CANCELLED';
interface Row {
  id: string; status: Status; referrerName: string; referredName: string; gateway: string | null;
  createdAt: string; firstChargeAt: string | null; earnedAt: string | null; appliedAt: string | null;
  amountCents: number | null; cancelReason: string | null;
}
interface Data { month: { ym: string; earned: number; estimatedCostCents: number }; referrals: Row[] }

const LABEL: Record<Status, string> = {
  TRIAL: 'Em teste', CONFIRMING: 'Pagou: 7 dias', EARNED: 'Mês ganho (guardado)', APPLIED: 'Mês usado', CANCELLED: 'Cancelada',
};
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

/** Plataforma Gastrux > Indicações (plan 2026-10-24 indicacao, Task 8) */
export default function PlatformReferralsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/platform/referrals', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || 'Não foi possível carregar'); return; }
    setData(body);
  }, []);
  useEffect(() => { load(); }, [load]);

  const cancel = async (r: Row) => {
    const reason = window.prompt(`Cancelar a indicação de "${r.referredName}" por "${r.referrerName}"? Diga o motivo:`);
    if (reason === null) return;
    const res = await fetch(`/api/admin/platform/referrals/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', reason }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || 'Não foi possível cancelar'); return; }
    toast.success('Indicação cancelada');
    load();
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Indicações</h1>
        <p className="text-sm text-muted-foreground">
          Quem indicou quem e os meses grátis. O mês é ganho 7 dias depois da primeira mensalidade do indicado.
        </p>
      </div>

      {error && <Card className="p-4 text-sm text-red-600">{error}</Card>}
      {!data && !error && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Meses ganhos no mês</p><p className="text-2xl font-bold">{data.month.earned}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Custo estimado no mês</p><p className="text-2xl font-bold">{brl(data.month.estimatedCostCents)}</p></Card>
          </div>

          {data.referrals.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">Nenhuma indicação ainda.</Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Quem indicou</th><th className="px-3 py-2">Indicado</th><th className="px-3 py-2">Situação</th>
                    <th className="px-3 py-2">Cadastro</th><th className="px-3 py-2">1ª cobrança</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.referrals.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">{r.referrerName}</td>
                      <td className="px-3 py-2">{r.referredName}</td>
                      <td className="px-3 py-2">
                        {LABEL[r.status]}
                        {r.cancelReason && <span className="block text-xs text-muted-foreground">{r.cancelReason}</span>}
                      </td>
                      <td className="px-3 py-2">{day(r.createdAt)}</td>
                      <td className="px-3 py-2">{day(r.firstChargeAt)}{r.gateway ? ` (${r.gateway === 'STRIPE' ? 'Stripe' : 'Mercado Pago'})` : ''}</td>
                      <td className="px-3 py-2">{r.amountCents ? brl(r.amountCents) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {['TRIAL', 'CONFIRMING', 'EARNED'].includes(r.status) && (
                          <Button size="sm" variant="outline" onClick={() => cancel(r)}>Cancelar</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
