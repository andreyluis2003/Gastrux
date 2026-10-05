'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CashEntryTicket } from '@/lib/caixa/print';
import { printWhenReady } from '@/lib/print/print-frame';
import '../../../print.css';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** 80 mm receipt of a cash register entry (sangria, suprimento, despesa, ajuste), with a signature line. */
export default function CashEntryTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [auto, setAuto] = useState(false);
  const [t, setT] = useState<CashEntryTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isAuto = new URLSearchParams(window.location.search).get('auto') === '1';
    setAuto(isAuto);
    fetch(`/api/print/cash-entry/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar o lançamento');
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
        <p className="center">{t.registerName}</p>
        <hr />
        <p className="center bold big">{t.typeLabel.toUpperCase()}</p>
        <p className="center bold big">{money(t.amountCents)}</p>
        <p>Forma: {t.methodLabel}</p>
        {t.category && <p>Categoria: {t.category}</p>}
        {t.description && <p>Motivo: {t.description}</p>}
        <p>Por: {t.createdByName ?? '-'}</p>
        <p>{when(t.createdAt)}</p>
        <hr />
        <p className="signature">Assinatura</p>
        <p className="small">Lançamento {t.entryId.slice(-8)}</p>
      </div>
    </div>
  );
}
