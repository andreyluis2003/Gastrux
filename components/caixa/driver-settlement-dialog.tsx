'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { reaisToCents, brl } from './money';
import type { DriverGroup } from '@/lib/caixa/driver-settlement';

const METHOD: Record<string, string> = { CASH: 'Dinheiro', CREDIT_ON_DELIVERY: 'Crédito', DEBIT_ON_DELIVERY: 'Débito', VOUCHER_ON_DELIVERY: 'Vale' };
const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);
const toInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/**
 * Acerto do entregador (spec 2026-10-26): pick a driver, check his orders paid at the door, type the cash he
 * brought, optionally pay him. The money goes to this open shift.
 */
export function DriverSettlementDialog({ sessionId, isManager, onClose, onDone }: { sessionId: string; isManager: boolean; onClose: () => void; onDone: () => void }) {
  const [drivers, setDrivers] = useState<DriverGroup[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [received, setReceived] = useState('');
  const [pay, setPay] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(newKey);

  useEffect(() => {
    fetch(`/api/caixa/sessions/${sessionId}/acerto-entregador`, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || 'Não foi possível carregar os pedidos');
        setDrivers(body.drivers);
      })
      .catch((e) => { toast.error(e.message); setDrivers([]); });
  }, [sessionId]);

  const choose = (i: number) => {
    const g = drivers![i];
    setPick(i);
    setSelected(new Set(g.orders.map((o) => o.id)));
    setReceived(toInput(g.cashCents));
    setPay('');
    setReason('');
    setKey(newKey());
  };

  const group = pick === null || !drivers ? null : drivers[pick];
  const chosen = group ? group.orders.filter((o) => selected.has(o.id)) : [];
  const sum = (m: string) => chosen.filter((o) => o.paymentMethod === m).reduce((s, o) => s + o.totalCents, 0);
  const cashCents = sum('CASH');
  const cardCents = sum('CREDIT_ON_DELIVERY') + sum('DEBIT_ON_DELIVERY');
  const otherCents = sum('VOUCHER_ON_DELIVERY');
  const feeCents = chosen.reduce((s, o) => s + o.deliveryFeeCents, 0);
  const receivedCents = received.trim() === '' ? 0 : reaisToCents(received, { allowZero: true });
  const difference = receivedCents === null ? 0 : receivedCents - cashCents;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const submit = async () => {
    if (!group || !chosen.length) return toast.error('Escolha os pedidos do acerto');
    if (receivedCents === null) return toast.error('Informe o dinheiro recebido');
    if (difference !== 0 && reason.trim().length < 3) return toast.error('O dinheiro não bate: informe o motivo da diferença');
    setSaving(true);
    try {
      const res = await fetch(`/api/caixa/sessions/${sessionId}/acerto-entregador`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          driverName: group.driverName, orderIds: chosen.map((o) => o.id), receivedCash: (receivedCents / 100).toFixed(2),
          driverPay: pay.trim() ? ((reaisToCents(pay) ?? 0) / 100).toFixed(2) : undefined, reason: reason.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível fazer o acerto'); setKey(newKey()); return; }
      toast.success(`Acerto de ${group.driverName ?? 'entregador sem nome'} lançado no caixa`);
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <Card role="dialog" aria-label="Acerto do entregador" className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 rounded-b-none sm:rounded-b-lg" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold">Acerto do entregador</h2>
          <p className="text-sm text-gray-600">Pedidos de delivery pagos na entrega que já saíram. O dinheiro e o cartão entram neste caixa.</p>
        </div>

        {drivers === null && <p className="text-sm text-gray-500">Carregando…</p>}
        {drivers && drivers.length === 0 && <p className="text-sm text-gray-600">Nenhum pedido pago na entrega esperando acerto.</p>}

        {drivers && drivers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {drivers.map((d, i) => (
              <Button key={d.driverName ?? '-'} size="sm" variant={pick === i ? 'default' : 'outline'} onClick={() => choose(i)}>
                {d.driverName ?? 'Sem nome'} · {d.orders.length}
              </Button>
            ))}
          </div>
        )}

        {group && (
          <>
            <ul className="divide-y border rounded-md">
              {group.orders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 p-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" aria-label={`Pedido ${o.number}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                  <span className="flex-1">
                    <span className="font-medium">{o.number}</span> · {o.customerName}
                    {o.status === 'PICKED_UP' && <span className="text-xs text-amber-700"> (ainda em entrega)</span>}
                  </span>
                  <span className="text-gray-600">{METHOD[o.paymentMethod] ?? o.paymentMethod}</span>
                  <span className="font-semibold w-20 text-right">{brl(o.totalCents)}</span>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md bg-gray-50 p-2"><p className="text-gray-500">Dinheiro</p><p className="font-semibold">{brl(cashCents)}</p></div>
              <div className="rounded-md bg-gray-50 p-2"><p className="text-gray-500">Cartão</p><p className="font-semibold">{brl(cardCents)}</p></div>
              <div className="rounded-md bg-gray-50 p-2"><p className="text-gray-500">Vale</p><p className="font-semibold">{brl(otherCents)}</p></div>
            </div>

            <div>
              <label htmlFor="acerto-received" className="text-sm font-medium">Dinheiro que o entregador entregou</label>
              <Input id="acerto-received" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />
              {receivedCents !== null && difference !== 0 && (
                <p className={`text-sm mt-1 ${difference < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                  {difference < 0 ? `Faltam ${brl(-difference)}` : `Sobram ${brl(difference)}`}
                </p>
              )}
            </div>
            {receivedCents !== null && difference !== 0 && (
              <div>
                <label htmlFor="acerto-reason" className="text-sm font-medium">Motivo da diferença</label>
                <Input id="acerto-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: cliente pagou a menos, troco errado" />
              </div>
            )}
            <div>
              <label htmlFor="acerto-pay" className="text-sm font-medium">Pagar ao entregador agora (opcional)</label>
              <Input id="acerto-pay" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} placeholder={feeCents ? `Taxas de entrega: ${toInput(feeCents)}` : '0,00'} />
              <p className="text-xs text-gray-500 mt-1">
                Sai da gaveta como despesa "Entregador".{!isManager && feeCents > 0 ? ` Acima de ${brl(feeCents)} (as taxas de entrega), só um gerente.` : ''}
              </p>
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          {group && <Button disabled={saving || !chosen.length} onClick={submit}>Lançar acerto</Button>}
        </div>
      </Card>
    </div>
  );
}
