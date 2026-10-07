'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { pickRegister, readRemembered, remember, type RegisterOption } from '@/lib/caixa/device-register';
import { OpenShiftCard } from '@/components/caixa/open-shift-card';
import { EntryDialog } from '@/components/caixa/entry-dialog';
import { CloseShiftDialog } from '@/components/caixa/close-shift-dialog';
import { brl } from '@/components/caixa/money';
import { CASH_METHODS, METHOD_KEY, METHOD_LABEL } from '@/lib/caixa/payment-methods';
import { ENTRY_TYPE_LABEL } from '@/lib/caixa/labels';
import type { SessionView } from '@/lib/caixa/sessions';

const MANAGER = ['OWNER', 'MANAGER', 'ADMIN'];
const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Cash register screen (spec §8.1): open the shift, see what came in, sangria/suprimento/despesa, close. */
export default function CaixaPage() {
  const [registers, setRegisters] = useState<RegisterOption[]>([]);
  const [register, setRegister] = useState<RegisterOption | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<null | 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE'>(null);
  const [closing, setClosing] = useState(false);
  const [role, setRole] = useState<string>('CASHIER');

  const loadView = useCallback(async (reg: RegisterOption) => {
    const res = await fetch(`/api/caixa/sessions/current?cashRegisterId=${reg.id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Erro ao carregar o caixa'); return; }
    setView(data.view);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/caixa/registers');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(data.error || 'Sem acesso ao caixa'); return; }
        setRegisters(data.registers);
        if (data.role) setRole(data.role);
        const chosen = pickRegister(data.registers, readRemembered());
        setRegister(chosen);
        if (chosen) { remember(chosen.id); await loadView(chosen); }
      } finally {
        setLoading(false);
      }
    })();
  }, [loadView]);

  const isManager = MANAGER.includes(role);
  if (loading) return <p className="p-6">Carregando caixa...</p>;
  if (!register) return <p className="p-6">Nenhum caixa disponível.</p>;

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Caixa</h1>
        <div className="flex items-center gap-2">
          {registers.length > 1 && (
            <label className="text-sm flex items-center gap-2">
              Este aparelho usa:
              <select className="border rounded-md h-9 px-2 bg-background" value={register.id}
                onChange={async (e) => { const r = registers.find((x) => x.id === e.target.value)!; setRegister(r); remember(r.id); await loadView(r); }}>
                {registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}
          {isManager && <Link href="/caixa/historico" className="text-sm underline">Histórico</Link>}
        </div>
      </div>

      {!view ? (
        <OpenShiftCard registerId={register.id} registerName={register.name} onOpened={() => loadView(register)} />
      ) : (
        <>
          {view.hoursOpen >= 16 && (
            <div className="rounded-md bg-amber-100 text-amber-900 p-3 text-sm">Turno aberto há {view.hoursOpen} horas: feche o caixa antes de continuar o dia.</div>
          )}
          <Card className="p-4">
            <p className="text-sm text-gray-600">{view.register.name} · aberto por {view.openedByName ?? '-'} às {time(view.session.openedAt)}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <Button size="lg" variant="outline" onClick={() => setDialog('WITHDRAWAL')}>Sangria</Button>
              <Button size="lg" variant="outline" onClick={() => setDialog('SUPPLY')}>Suprimento</Button>
              {isManager && <Button size="lg" variant="outline" onClick={() => setDialog('EXPENSE')}>Despesa</Button>}
              <Button size="lg" className="bg-red-600 hover:bg-red-700" onClick={() => setClosing(true)}>Fechar caixa</Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-2">Vendas do turno</h2>
            <p className="text-sm text-gray-600 mb-2">{view.sales.salesCount} venda(s) · ticket médio {brl(view.sales.averageTicketCents)}</p>
            <ul className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
              {CASH_METHODS.map((m) => (
                <li key={m} className="rounded border p-2"><span className="block text-gray-500">{METHOD_LABEL[m]}</span><strong>{brl(view.sales.byMethod[m])}</strong></li>
              ))}
            </ul>
            {view.expected && (
              <p className="text-sm mt-3">Dinheiro esperado na gaveta: <strong>{brl(view.expected[METHOD_KEY.CASH])}</strong> <span className="text-gray-500">(visível só para gerente)</span></p>
            )}
            <p className="text-xs text-gray-500 mt-2">Recebido online no período (não entra na gaveta): {view.online.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-2">Lançamentos</h2>
            {view.entries.length === 0 ? <p className="text-sm text-gray-500">Nenhum lançamento ainda.</p> : (
              <ul className="divide-y text-sm">
                {view.entries.map((e) => (
                  <li key={e.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span>{time(e.createdAt)} · {ENTRY_TYPE_LABEL[e.type]} · {METHOD_LABEL[e.method]}{e.description ? ` · ${e.description}` : ''}{e.afterClose ? ' · após o fechamento' : ''}</span>
                    <span className="flex items-center gap-3">
                      {e.orderSessionId && <Link className="underline" href={`/vender/${e.orderSessionId}`}>venda</Link>}
                      <span className="text-gray-500">{e.createdByName}</span>
                      <strong className={['CHANGE', 'WITHDRAWAL', 'EXPENSE', 'REFUND'].includes(e.type) || e.direction === 'OUT' ? 'text-red-700' : ''}>{brl(e.amountCents)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {dialog && <EntryDialog sessionId={view.session.id} type={dialog} open onClose={() => setDialog(null)} onDone={() => loadView(register)} />}
          {closing && <CloseShiftDialog sessionId={view.session.id} registerName={view.register.name} onClose={() => setClosing(false)} onClosed={() => loadView(register)} />}
        </>
      )}
    </main>
  );
}
