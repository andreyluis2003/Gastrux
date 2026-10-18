'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CATEGORIES, CATEGORY_LABEL, METHOD_LABEL, type PayMethod } from '@/lib/payables/rules';
import { br, brl, EditDialog, NewPayableDialog, PayDialog, ReasonDialog, send, type PayableItem } from '@/components/payables/payable-dialogs';

/** Contas a pagar (spec 2026-10-18 contas a pagar §8): what is overdue, due today, this week and this month */

type Summary = Record<'overdue' | 'today' | 'week' | 'month', { count: number; cents: number }>;
interface Screen { summary: Summary; items: PayableItem[]; features: { series: boolean; alerts: boolean; nfe: boolean } }

const STATE: Record<PayableItem['state'], { label: string; css: string }> = {
  OVERDUE: { label: 'Atrasada', css: 'bg-red-100 text-red-800' },
  TODAY: { label: 'Vence hoje', css: 'bg-amber-100 text-amber-900' },
  WEEK: { label: 'Esta semana', css: 'bg-sky-100 text-sky-900' },
  LATER: { label: 'A vencer', css: 'bg-slate-100 text-slate-700' },
  PAID: { label: 'Paga', css: 'bg-emerald-100 text-emerald-800' },
  CANCELED: { label: 'Cancelada', css: 'bg-slate-100 text-slate-500 line-through' },
};

const FILTERS = [
  { value: 'OPEN', label: 'A pagar' },
  { value: 'OVERDUE', label: 'Atrasadas' },
  { value: 'PAID', label: 'Pagas' },
  { value: 'CANCELED', label: 'Canceladas' },
  { value: '', label: 'Todas' },
];

export default function ContasAPagarPage() {
  const [data, setData] = useState<Screen | null>(null);
  const [status, setStatus] = useState('OPEN');
  const [category, setCategory] = useState('');
  const [month, setMonth] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'pay' | 'edit' | 'undo' | 'cancel'; item: PayableItem } | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (category) q.set('category', category);
    if (month) q.set('month', month);
    const res = await fetch(`/api/payables?${q}`);
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(out.error || 'Não foi possível carregar as contas');
    setData(out);
  }, [status, category, month]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch('/api/suppliers').then((r) => (r.ok ? r.json() : [])).then((d) => setSuppliers((Array.isArray(d) ? d : d.suppliers ?? []).map((s: any) => ({ id: s.id, name: s.name })))).catch(() => {});
  }, []);

  const done = () => { setDialog(null); void load(); };
  const card = (title: string, v: { count: number; cents: number } | undefined, css: string) => (
    <Card className={`p-4 ${css}`}>
      <p className="text-xs font-medium opacity-80">{title}</p>
      <p className="text-xl font-bold mt-1">{brl(v?.cents ?? 0)}</p>
      <p className="text-xs opacity-80">{v?.count ?? 0} {v?.count === 1 ? 'conta' : 'contas'}</p>
    </Card>
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Contas a pagar</h1>
          <p className="text-sm text-slate-600">Na DRE, cada conta entra no mês a que se refere. Compras de mercadoria ficam fora (o custo já está no CMV).</p>
        </div>
        <Button onClick={() => setDialog({ kind: 'new' })}>Nova conta</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {card('Atrasadas', data?.summary.overdue, (data?.summary.overdue.count ?? 0) > 0 ? 'border-red-300 bg-red-50 text-red-900' : '')}
        {card('Vencem hoje', data?.summary.today, (data?.summary.today.count ?? 0) > 0 ? 'border-amber-300 bg-amber-50 text-amber-900' : '')}
        {card('Próximos 7 dias', data?.summary.week, '')}
        {card('Total do mês', data?.summary.month, '')}
      </div>

      {data && !data.features.alerts && (
        <p className="text-xs text-slate-600"><span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 mr-1">Business</span>Aviso no sino e no e-mail antes de vencer, contas que se repetem sozinhas e boletos da nota de compra.</p>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)} className={`rounded-full border px-3 py-1 text-sm ${status === f.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-white dark:bg-slate-900'}`}>{f.label}</button>
        ))}
        <select className="rounded-lg border px-2 py-1 text-sm bg-white dark:bg-slate-900" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas as categorias</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <input type="month" className="rounded-lg border px-2 py-1 text-sm bg-white dark:bg-slate-900" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <div className="space-y-2">
        {data?.items.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">Nenhuma conta aqui.</p>}
        {data?.items.map((i) => (
          <Card key={i.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{i.description}</span>
                <span className={`text-xs rounded px-1.5 py-0.5 ${STATE[i.state].css}`}>{STATE[i.state].label}</span>
                {i.seriesId && <span className="text-xs text-slate-500">repete todo mês</span>}
                {i.installment && <span className="text-xs text-slate-500">parcela {i.installment}</span>}
              </div>
              <p className="text-xs text-slate-500">
                {i.categoryLabel}{i.supplierName ? ` · ${i.supplierName}` : ''} · vence {br(i.dueDate)}
                {i.state === 'PAID' && i.paidAt ? ` · paga em ${br(i.paidAt)} (${METHOD_LABEL[i.paidMethod as PayMethod] ?? i.paidMethod}${i.paidFrom === 'DRAWER' ? ', gaveta' : ''})` : ''}
              </p>
            </div>
            <p className="font-semibold sm:w-32 sm:text-right">{brl(i.amountCents)}</p>
            <div className="flex gap-2 flex-wrap">
              {['OVERDUE', 'TODAY', 'WEEK', 'LATER'].includes(i.state) && (
                <>
                  <Button size="sm" onClick={() => setDialog({ kind: 'pay', item: i })}>Pagar</Button>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'edit', item: i })}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'cancel', item: i })}>Cancelar</Button>
                </>
              )}
              {i.state === 'PAID' && <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'undo', item: i })}>Desfazer pagamento</Button>}
            </div>
          </Card>
        ))}
      </div>

      {dialog?.kind === 'new' && <NewPayableDialog seriesAllowed={!!data?.features.series} suppliers={suppliers} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'pay' && <PayDialog item={dialog.item} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'edit' && <EditDialog item={dialog.item} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'cancel' && (
        <ReasonDialog
          title="Cancelar conta" confirm="Cancelar conta" help="A conta sai dos totais e fica no histórico."
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => { const r = await send(`/api/payables/${dialog.item.id}`, 'DELETE', { reason }); if (!r.ok) toast.error(r.out.error || 'Não foi possível cancelar'); else done(); return r.ok; }}
        />
      )}
      {dialog?.kind === 'undo' && (
        <ReasonDialog
          title="Desfazer pagamento" confirm="Desfazer" help={dialog.item.paidFrom === 'DRAWER' ? 'O dinheiro volta para o caixa aberto.' : 'A conta volta a ficar a pagar.'}
          onClose={() => setDialog(null)}
          onConfirm={async (reason, cashSessionId) => {
            const r = await send(`/api/payables/${dialog.item.id}/pay`, 'DELETE', { reason, cashSessionId });
            if (!r.ok) toast.error(r.out.error || 'Não foi possível desfazer');
            if (!r.ok && Array.isArray(r.out.shifts)) return r.out.shifts;
            if (r.ok) done();
            return r.ok;
          }}
        />
      )}
    </div>
  );
}
