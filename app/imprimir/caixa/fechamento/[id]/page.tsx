'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CashCloseTicket } from '@/lib/caixa/print';
import { printWhenReady } from '@/lib/print/print-frame';
import '../../../print.css';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-');

/** 80 mm closing report of a cash shift: expected x counted x difference per method. */
export default function CashCloseTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [auto, setAuto] = useState(false);
  const [t, setT] = useState<CashCloseTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isAuto = new URLSearchParams(window.location.search).get('auto') === '1';
    setAuto(isAuto);
    fetch(`/api/print/cash-session/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar o fechamento');
        setT(data);
        if (isAuto) printWhenReady();
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!t) return <p className="p-4">Carregando...</p>;
  return (
    <div className="p-4">
      {!auto && (
        <div className="no-print mb-4">
          <button type="button" className="border rounded px-3 py-1" onClick={() => window.print()}>Imprimir</button>
        </div>
      )}
      <div className="print-ticket">
        <p className="center bold">{t.restaurantName}</p>
        <p className="center bold">FECHAMENTO DE CAIXA</p>
        <p className="center">{t.registerName}</p>
        <hr />
        <p>Abertura: {when(t.openedAt)} ({t.openedByName ?? '-'})</p>
        <p>Fechamento: {when(t.closedAt)} ({t.closedByName ?? '-'})</p>
        <p>Troco inicial: {money(t.openingFloatCents)}</p>
        <p>Vendas: {t.sales.salesCount} · {money(t.sales.totalCents)}</p>
        <hr />
        <table className="w-full">
          <thead><tr><th className="left">Forma</th><th>Esperado</th><th>Contado</th><th>Dif.</th></tr></thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.label}><td>{r.label}</td><td className="right">{money(r.expected)}</td><td className="right">{money(r.counted)}</td><td className="right">{money(r.difference)}</td></tr>
            ))}
          </tbody>
        </table>
        {t.lateEntries > 0 && <p className="bold">{t.lateEntries} venda(s) lançada(s) após o fechamento</p>}
        {t.notes && <p>Obs.: {t.notes}</p>}
        <hr />
        <p className="signature">Operador</p>
        <p className="signature">Gerente</p>
      </div>
    </div>
  );
}
