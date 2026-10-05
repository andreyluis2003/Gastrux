'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';

const KEYS = ['dinheiro', 'pix', 'credito', 'debito', 'outros'] as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'aberto');
const isoDay = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/** Shift history for the manager (spec §8.4). */
export default function CaixaHistoricoPage() {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 30 * 86400_000)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [rows, setRows] = useState<any[] | null>(null);

  const load = async () => {
    const res = await fetch(`/api/caixa/sessions?from=${from}&to=${to}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Erro ao carregar o histórico'); setRows([]); return; }
    setRows(data.sessions);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDiff = (d: Record<string, number> | null) => (d ? KEYS.reduce((s, k) => s + (d[k] ?? 0), 0) : null);

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Histórico de caixas</h1><Link href="/caixa" className="underline text-sm">Voltar ao caixa</Link></div>
      <Card className="p-3 flex flex-wrap gap-2 items-end">
        <label className="text-sm">De<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Até<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Button onClick={load}>Filtrar</Button>
      </Card>
      {rows === null ? <p>Carregando...</p> : rows.length === 0 ? <p className="text-gray-500">Nenhum turno no período.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const diff = totalDiff(r.differenceCents);
            const color = diff === null ? '' : diff === 0 ? 'text-green-700' : Math.abs(diff) > 2000 ? 'text-red-700 font-bold' : 'text-amber-700';
            return (
              <li key={r.id}>
                <Link href={`/caixa/historico/${r.id}`}>
                  <Card className="p-3 flex flex-wrap justify-between gap-2 hover:bg-gray-50">
                    <span><strong>{r.registerName}</strong> · {when(r.openedAt)} → {when(r.closedAt)} · {r.openedByName ?? '-'}{r.closedByName ? ` / ${r.closedByName}` : ''}{r.lateEntries ? ` · ${r.lateEntries} após o fechamento` : ''}</span>
                    <span className="flex gap-4"><span>Vendas {brl(r.salesCents)}</span>{diff !== null && <span className={color}>Diferença {brl(diff)}</span>}</span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
