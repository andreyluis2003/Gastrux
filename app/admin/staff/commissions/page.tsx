'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, DollarSign, Loader2 } from 'lucide-react';
import { brtDay, periodContaining, shiftPeriod, type CommissionPeriodType } from '@/lib/staff/commission-rules';

/**
 * Commissions (2026-10-06): the team's sales and commission by week, fortnight or month, live; a
 * manager closes the pay period, then approves, pays, adjusts or cancels each record. Rules in
 * lib/staff/commission-rules.ts (items of closed bills each person opened; no service charge).
 */

interface Row { staffMemberId: string; userId: string; name: string; ruleLabel: string; bills: number; salesCents: number; commissionCents: number }
interface RecordRow { id: string; name: string; label: string; bills: number; totalSales: number; commissionEarned: number; bonusEarned: number; totalEarned: number; status: string; notes: string | null }
interface Data {
  view: CommissionPeriodType;
  period: { firstDay: string; lastDay: string; label: string };
  payPeriod: CommissionPeriodType;
  canManage: boolean;
  rows: Row[];
  totals: { bills: number; salesCents: number; commissionCents: number };
  records: RecordRow[];
}

const VIEWS: Array<{ value: CommissionPeriodType; label: string }> = [
  { value: 'WEEKLY', label: 'Semana' },
  { value: 'BIWEEKLY', label: 'Quinzena' },
  { value: 'MONTHLY', label: 'Mês' },
];
const PAY_LABEL: Record<CommissionPeriodType, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quinzenal', MONTHLY: 'Mensal' };
const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
  APPROVED: { label: 'Aprovada', color: 'bg-blue-100 text-blue-800' },
  PAID: { label: 'Paga', color: 'bg-green-100 text-green-800' },
  PARTIALLY_PAID: { label: 'Parcial', color: 'bg-orange-100 text-orange-800' },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
};

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlReais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CommissionsPage() {
  const [view, setView] = useState<CommissionPeriodType>('MONTHLY');
  const [day, setDay] = useState(() => brtDay(new Date()));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; kind: 'adjust' | 'cancel' } | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/staff/commissions?view=${view}&date=${day}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error('Erro ao carregar comissões');
    } finally {
      setLoading(false);
    }
  }, [view, day]);

  useEffect(() => { load(); }, [load]);

  const bounds = periodContaining(view, day);
  const today = brtDay(new Date());
  const isRunning = bounds.lastDay >= today;
  const canClose = data?.canManage && view === data.payPeriod && !isRunning;

  async function send(url: string, method: string, body: unknown, ok: string) {
    setBusy(url + method);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Não foi possível concluir');
      toast.success(ok);
      setEditing(null);
      setAmount('');
      setReason('');
      await load();
      return out;
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-7 w-7 text-green-600" /> Comissões
          </h1>
          <p className="text-sm text-gray-500 mt-1">Sobre o valor dos itens das contas fechadas que cada pessoa abriu. Taxa de serviço não entra.</p>
        </div>
        {data?.canManage && (
          <label className="text-sm text-gray-600 flex items-center gap-2">
            Pagamento
            <select
              className="border rounded-md px-2 py-1.5 text-sm"
              value={data.payPeriod}
              onChange={(e) => send('/api/admin/staff/commissions', 'PATCH', { payPeriod: e.target.value }, 'Período de pagamento atualizado')}
            >
              {VIEWS.map((v) => <option key={v.value} value={v.value}>{PAY_LABEL[v.value]}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border bg-white p-1">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => setView(v.value)}
              className={`px-3 py-1.5 text-sm rounded-md ${view === v.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDay(shiftPeriod(bounds, -1).firstDay)} aria-label="Período anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[13rem] text-center font-medium">{data?.period.label ?? '...'}{isRunning ? ' (em andamento)' : ''}</span>
          <Button variant="outline" size="sm" onClick={() => setDay(shiftPeriod(bounds, 1).firstDay)} aria-label="Próximo período"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4"><p className="text-xs text-gray-500">Vendas</p><p className="text-xl font-bold">{brl(data.totals.salesCents)}</p></Card>
            <Card className="p-4"><p className="text-xs text-gray-500">Contas fechadas</p><p className="text-xl font-bold">{data.totals.bills}</p></Card>
            <Card className="p-4"><p className="text-xs text-gray-500">Comissão do período</p><p className="text-xl font-bold text-green-700">{brl(data.totals.commissionCents)}</p></Card>
          </div>

          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Pessoa</th>
                  <th className="text-left px-4 py-2 hidden sm:table-cell">Regra</th>
                  <th className="text-right px-4 py-2">Contas</th>
                  <th className="text-right px-4 py-2">Vendas</th>
                  <th className="text-right px-4 py-2">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Nenhum funcionário cadastrado em Equipe e acessos.</td></tr>
                ) : data.rows.map((r) => (
                  <tr key={r.staffMemberId} className="border-t">
                    <td className="px-4 py-2 font-medium">{r.name}<div className="sm:hidden text-xs text-gray-500">{r.ruleLabel}</div></td>
                    <td className="px-4 py-2 hidden sm:table-cell text-gray-600">{r.ruleLabel}</td>
                    <td className="px-4 py-2 text-right">{r.bills}</td>
                    <td className="px-4 py-2 text-right">{brl(r.salesCents)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{brl(r.commissionCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-gray-500">A regra de cada pessoa (percentual ou valor por conta) é definida em Equipe e acessos.</p>

          {data.canManage && (
            <Card className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-700">
                {canClose
                  ? `Feche ${data.period.label.toLowerCase()} para pagamento: as comissões viram pendentes para aprovar e pagar.`
                  : `O pagamento é ${PAY_LABEL[data.payPeriod].toLowerCase()}. Para fechar, escolha "${VIEWS.find((v) => v.value === data.payPeriod)?.label}" e um período já terminado.`}
              </p>
              <Button
                disabled={!canClose || !!busy}
                onClick={() => send('/api/admin/staff/commissions', 'POST', { action: 'close', date: bounds.firstDay, periodType: data.payPeriod }, 'Período fechado')}
              >
                Fechar período
              </Button>
            </Card>
          )}

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Fechamentos</h2>
            {data.records.length === 0 ? (
              <Card className="p-6 text-center text-gray-500">Nenhum período fechado ainda.</Card>
            ) : data.records.map((c) => {
              const st = STATUS[c.status] || STATUS.PENDING;
              const editingThis = editing?.id === c.id;
              return (
                <Card key={c.id} className="p-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-sm text-gray-500">{c.label} · {c.bills} contas · vendas {brlReais(c.totalSales)}</p>
                      {c.bonusEarned !== 0 && <p className="text-xs text-gray-500">Ajuste {brlReais(c.bonusEarned)}{c.notes ? `: ${c.notes}` : ''}</p>}
                      {c.status === 'CANCELLED' && c.notes && <p className="text-xs text-red-600">Motivo: {c.notes}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-lg font-bold">{brlReais(c.totalEarned)}</p>
                      <Badge className={st.color}>{st.label}</Badge>
                    </div>
                  </div>
                  {data.canManage && ['PENDING', 'APPROVED'].includes(c.status) && (
                    <div className="flex flex-wrap gap-2">
                      {c.status === 'PENDING' && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => send(`/api/admin/staff/commissions/${c.id}`, 'PATCH', { action: 'approve' }, 'Comissão aprovada')}>Aprovar</Button>}
                      <Button size="sm" disabled={!!busy} onClick={() => send(`/api/admin/staff/commissions/${c.id}`, 'PATCH', { action: 'pay' }, 'Comissão marcada como paga')}>Marcar como paga</Button>
                      {c.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => setEditing({ id: c.id, kind: 'adjust' })}>Ajustar</Button>}
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => setEditing({ id: c.id, kind: 'cancel' })}>Cancelar</Button>
                    </div>
                  )}
                  {editingThis && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      {editing!.kind === 'adjust' && (
                        <Input className="sm:w-40" inputMode="decimal" placeholder="Ajuste (R$, use - para desconto)" value={amount} onChange={(e) => setAmount(e.target.value)} />
                      )}
                      <Input className="flex-1" placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
                      <Button
                        size="sm"
                        disabled={!!busy}
                        onClick={() => send(
                          `/api/admin/staff/commissions/${c.id}`,
                          'PATCH',
                          editing!.kind === 'adjust'
                            ? { action: 'adjust', bonusCents: Math.round(Number(amount.replace(',', '.')) * 100), reason }
                            : { action: 'cancel', reason },
                          editing!.kind === 'adjust' ? 'Ajuste salvo' : 'Comissão cancelada',
                        )}
                      >
                        Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Voltar</Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
