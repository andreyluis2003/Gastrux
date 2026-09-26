'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { KitchenTicket } from '@/lib/print/tickets';
import { printWhenReady } from '@/lib/print/print-frame';
import '../../print.css';

/** Kitchen ticket ("comanda de produção") in 80 mm, printed by the browser. */
export default function KitchenTicketPage() {
  const { orderId } = useParams<{ orderId: string }>();
  // ?auto=1: opened by printInHiddenFrame, prints itself (read in the effect: same first render on
  // the server and in the browser, and no Suspense boundary needed as with useSearchParams)
  const [auto, setAuto] = useState(false);
  const [ticket, setTicket] = useState<KitchenTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isAuto = new URLSearchParams(window.location.search).get('auto') === '1';
    setAuto(isAuto);
    fetch(`/api/print/kitchen/${orderId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar o pedido');
        setTicket(data);
        if (isAuto) printWhenReady();
      })
      .catch((e) => setError(e.message));
  }, [orderId]);

  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!ticket) return <p className="p-4">Carregando...</p>;

  const time = new Date(ticket.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="p-4">
      {!auto && (
        <button type="button" className="no-print mb-4 px-4 py-2 rounded bg-blue-600 text-white" onClick={() => window.print()}>
          Imprimir
        </button>
      )}
      <div className="print-ticket">
        <h1>COZINHA</h1>
        <div className="center big">
          {ticket.kind}
          {ticket.where ? ` ${ticket.where}` : ''}
        </div>
        <div className="row muted">
          <span>{ticket.orderNumber}</span>
          <span>{time}</span>
        </div>
        <hr />
        {ticket.lines.map((line, i) => (
          <div key={i} style={{ marginBottom: '2mm' }}>
            <div className="big">
              {line.quantity}x {line.name}
            </div>
            {line.modifiers.map((m, j) => (
              <div key={j}>&nbsp;&nbsp;* {m}</div>
            ))}
            {line.notes && <div>&nbsp;&nbsp;OBS: {line.notes}</div>}
          </div>
        ))}
        {ticket.notes && (
          <>
            <hr />
            <div>OBS: {ticket.notes}</div>
          </>
        )}
        {ticket.deliveryAddress && (
          <>
            <hr />
            <div>Entrega: {ticket.deliveryAddress}</div>
          </>
        )}
        <hr />
        <div className="center muted">{ticket.restaurantName}</div>
      </div>
    </div>
  );
}
