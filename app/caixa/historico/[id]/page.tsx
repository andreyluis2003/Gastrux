'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { ENTRY_TYPE_LABEL } from '@/lib/caixa/labels';
import { METHOD_LABEL } from '@/lib/caixa/payment-methods';
import { exceedsAlert } from '@/lib/caixa/rules';
import type { SessionView } from '@/lib/caixa/sessions';

const ROWS = [['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['credito', 'Cartão de crédito'], ['debito', 'Cartão de débito'], ['outros', 'Outros']] as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-');

export default function CaixaTurnoPage() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/caixa/sessions/${id}`).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setView(d.view); }).catch((e) => setError(e.message || 'Erro'));
  }, [id]);
  if (error) return <p className="p-6 text-red-700">{error}</p>;
  if (!view) return <p className="p-6">Carregando...</p>;
  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{view.register.name}</h1>
        <div className="flex gap-2">
          {view.session.status === 'CLOSED' && <Button variant="outline" onClick={() => printInHiddenFrame(`/imprimir/caixa/fechamento/${id}`)}>Imprimir</Button>}
          <Link href="/caixa/historico" className="underline text-sm self-center">Voltar</Link>
        </div>
      </div>
      <Card className="p-4 text-sm space-y-1">
        <p>Aberto em {when(view.session.openedAt)} por {view.openedByName ?? '-'} · troco inicial {brl(view.session.openingFloatCents)}</p>
        <p>Fechado em {when(view.session.closedAt)} por {view.closedByName ?? '-'}</p>
        {view.session.closingNotes && <p>Obs.: {view.session.closingNotes}</p>}
        {view.session.lateEntries > 0 && <p className="text-amber-700">{view.session.lateEntries} venda(s) lançada(s) após o fechamento</p>}
      </Card>
      {view.expected && view.counted && view.difference && (
        <Card className="p-4">
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th>Forma</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferença</th></tr></thead>
            <tbody>{ROWS.map(([k, label]) => {
              const exp = view.expected![k] ?? 0; const cnt = view.counted![k] ?? 0; const diff = view.difference![k] ?? 0;
              const color = diff === 0 ? 'text-green-700' : exceedsAlert(exp, diff) ? 'text-red-700 font-bold' : 'text-amber-700';
              return <tr key={k}><td>{label}</td><td className="text-right">{brl(exp)}</td><td className="text-right">{brl(cnt)}</td><td className={`text-right ${color}`}>{brl(diff)}</td></tr>;
            })}</tbody>
          </table>
        </Card>
      )}
      <Card className="p-4">
        <h2 className="font-semibold mb-2">Lançamentos</h2>
        <ul className="divide-y text-sm">
          {view.entries.map((e) => (
            <li key={e.id} className="py-2 flex justify-between gap-2">
              <span>{when(e.createdAt)} · {ENTRY_TYPE_LABEL[e.type]} · {METHOD_LABEL[e.method]}{e.description ? ` · ${e.description}` : ''}{e.afterClose ? ' · após o fechamento' : ''}</span>
              <span>{e.createdByName} · <strong>{brl(e.amountCents)}</strong></span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
