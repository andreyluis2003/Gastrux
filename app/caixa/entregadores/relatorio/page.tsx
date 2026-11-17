'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';

interface Row {
  key: string;
  driverName: string;
  active: boolean | null;
  deliveries: number;
  dailies: number;
  paidCents: number;
  unpaidDeliveries: number;
}

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
/** First day of this month and today, in São Paulo */
function currentMonth() {
  const today = dayFormat.format(new Date());
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** Relatório de entregadores por período (spec 2026-11-17): entregas, diárias, pago e a pagar. */
export default function EntregadoresRelatorioPage() {
  const [period, setPeriod] = useState(currentMonth);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/delivery/drivers/report?from=${from}&to=${to}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Erro ao carregar o relatório'); setRows([]); return; }
      setRows(data.rows);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(period.from, period.to); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const total = (rows ?? []).reduce(
    (t, r) => ({ deliveries: t.deliveries + r.deliveries, dailies: t.dailies + r.dailies, paidCents: t.paidCents + r.paidCents, unpaid: t.unpaid + r.unpaidDeliveries }),
    { deliveries: 0, dailies: 0, paidCents: 0, unpaid: 0 },
  );

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Entregadores</h1>
        <Link href="/caixa/entregadores" className="underline text-sm">Cadastro de entregadores</Link>
      </div>
      <p className="text-sm text-gray-600">
        Relatório por período. Entregas e diárias contam pelo dia de trabalho (o dia vira às 5h); pago é o que saiu do caixa no período.
      </p>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">De<Input type="date" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} /></label>
        <label className="text-sm">Até<Input type="date" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} /></label>
        <Button onClick={() => load(period.from, period.to)} disabled={loading || !period.from || !period.to}>{loading ? 'Carregando...' : 'Ver relatório'}</Button>
        <Button variant="outline" disabled={loading} onClick={() => { const m = currentMonth(); setPeriod(m); load(m.from, m.to); }}>Mês atual</Button>
      </Card>

      {rows === null ? <p>Carregando...</p> : rows.length === 0 ? (
        <p className="text-gray-500">Nenhuma entrega nem pagamento neste período.</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="p-2">Entregador</th>
                <th className="p-2 text-right">Entregas</th>
                <th className="p-2 text-right">Diárias</th>
                <th className="p-2 text-right">Pago</th>
                <th className="p-2 text-right">A pagar (entregas)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  <td className="p-2 break-words">
                    {r.driverName}
                    {r.active === false && <span className="ml-2 text-xs text-gray-500">(desativado)</span>}
                    {r.active === null && <span className="ml-2 text-xs text-gray-500">(nome digitado)</span>}
                  </td>
                  <td className="p-2 text-right">{r.deliveries}</td>
                  <td className="p-2 text-right">{r.dailies}</td>
                  <td className="p-2 text-right">{brl(r.paidCents)}</td>
                  <td className="p-2 text-right">{r.unpaidDeliveries}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="p-2">Total</td>
                <td className="p-2 text-right">{total.deliveries}</td>
                <td className="p-2 text-right">{total.dailies}</td>
                <td className="p-2 text-right">{brl(total.paidCents)}</td>
                <td className="p-2 text-right">{total.unpaid}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </main>
  );
}
