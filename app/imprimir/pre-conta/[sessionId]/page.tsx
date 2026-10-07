'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { printWhenReady } from '@/lib/print/print-frame';
import { splitEqually } from '@/lib/comanda/bill';
import type { Bill } from '@/lib/comanda/bill-service';
import '../../print.css';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** The pre-bill in 80 mm (spec 2026-10-07, 4.3): items, subtotal, service charge, total, per person */
export default function PreBillPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [bill, setBill] = useState<Bill | null>(null);
  const [people, setPeople] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setPeople(Number(q.get('people')) || 0);
    fetch(`/api/comanda/sessions/${sessionId}/bill`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar a conta');
        setBill(data);
        if (q.get('auto') === '1') printWhenReady();
      })
      .catch((e) => setError(e.message));
  }, [sessionId]);

  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!bill) return <p className="p-4">Carregando...</p>;
  const shares = people >= 2 && people <= 20 ? splitEqually(bill.totalCents, people) : null;

  return (
    <div className="p-4">
      <div className="print-ticket">
        <h1>{bill.label}</h1>
        <div className="center" style={{ fontWeight: 700 }}>NÃO É DOCUMENTO FISCAL</div>
        <div className="center muted">Pré-conta · {new Date().toLocaleString('pt-BR')}</div>
        <hr />
        {bill.items.map((i) => (
          <div key={i.id} className="row"><span>{i.quantity} x {i.name}</span><span>{money(i.totalCents)}</span></div>
        ))}
        <hr />
        <div className="row"><span>Subtotal</span><span>{money(bill.subtotalCents)}</span></div>
        {bill.serviceCents > 0 && <div className="row"><span>Taxa de serviço ({bill.percent}%)</span><span>{money(bill.serviceCents)}</span></div>}
        <div className="row big"><span>TOTAL</span><span>{money(bill.totalCents)}</span></div>
        {bill.paidCents > 0 && (
          <>
            <div className="row"><span>Já pago</span><span>{money(bill.paidCents)}</span></div>
            <div className="row big"><span>FALTA</span><span>{money(bill.remainingCents)}</span></div>
          </>
        )}
        {shares && <div className="row"><span>Dividido por {people}</span><span>{money(shares[0])} cada</span></div>}
      </div>
    </div>
  );
}
