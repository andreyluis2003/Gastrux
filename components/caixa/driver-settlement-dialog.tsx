'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { reaisToCents, brl } from './money';
import type { DriverGroup } from '@/lib/caixa/driver-settlement';
import { driverNameKey } from '@/lib/delivery/driver-name';

const METHOD: Record<string, string> = { CASH: 'Dinheiro', CREDIT_ON_DELIVERY: 'Crédito', DEBIT_ON_DELIVERY: 'Débito', VOUCHER_ON_DELIVERY: 'Vale' };
const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);
type PayEntry = {
  key: string; driverId: string | null; driverName: string | null;
  quote: { deliveryCount: number; suggestedCents: number | null; feeCapCents: number; text: string };
  /** The deliveries this quote was computed from: sent back, the server refuses (409) if the list changed */
  expected: { orders: string[]; comandas: string[] };
};
type Card = { id: string; name: string | null; door: DriverGroup | null; pay: PayEntry | null };
/** The payment of a door group: the registered driver by id, a typed name by the same key as the server */
const pairs = (pe: PayEntry, door: DriverGroup) => (door.driverId ? pe.key === door.driverId : !pe.driverId && pe.key === driverNameKey(door.driverName));
const toInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/**
 * Acerto do entregador (spec 2026-10-26): pick a driver, check his orders paid at the door, type the cash he
 * brought, optionally pay him. The money goes to this open shift.
 */
export function DriverSettlementDialog({ sessionId, isManager, onClose, onDone }: { sessionId: string; isManager: boolean; onClose: () => void; onDone: () => void }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [received, setReceived] = useState('');
  const [pay, setPay] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(newKey);

  const load = useCallback(() => {
    fetch(`/api/caixa/sessions/${sessionId}/acerto-entregador`, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || 'Não foi possível carregar os pedidos');
        const doors: DriverGroup[] = body.drivers ?? [];
        const pays: PayEntry[] = body.pay ?? [];
        const used = new Set<PayEntry>();
        const list: Card[] = doors.map((door, i) => {
          const pe = pays.find((x) => !used.has(x) && pairs(x, door)) ?? null;
          if (pe) used.add(pe);
          return { id: `d${i}`, name: door.driverName, door, pay: pe };
        });
        pays.filter((x) => !used.has(x)).forEach((pe) => list.push({ id: `p${pe.key}`, name: pe.driverName, door: null, pay: pe }));
        list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR'));
        setCards(list);
      })
      .catch((e) => { toast.error(e.message); setCards([]); });
  }, [sessionId]);
  useEffect(load, [load]);

  /** After a 409 (list changed, paid meanwhile, settled meanwhile): load the list again, the dialog stays open */
  const reload = () => {
    setCards(null);
    setPick(null);
    setSelected(new Set());
    setReceived('');
    setPay('');
    setReason('');
    load();
  };

  const choose = (i: number) => {
    const c = cards![i];
    setPick(i);
    setSelected(new Set(c.door ? c.door.orders.map((o) => o.id) : []));
    setReceived(c.door ? toInput(c.door.cashCents) : '');
    const sug = c.pay?.quote.suggestedCents;
    setPay(sug ? toInput(sug) : '');
    setReason('');
    setKey(newKey());
  };

  const card = pick === null || !cards ? null : cards[pick];
  const group = card?.door ?? null;
  const payEntry = card?.pay ?? null;
  const chosen = group ? group.orders.filter((o) => selected.has(o.id)) : [];
  const sum = (m: string) => chosen.filter((o) => o.paymentMethod === m).reduce((s, o) => s + o.totalCents, 0);
  const cashCents = sum('CASH');
  const cardCents = sum('CREDIT_ON_DELIVERY') + sum('DEBIT_ON_DELIVERY');
  const otherCents = sum('VOUCHER_ON_DELIVERY');
  const receivedCents = received.trim() === '' ? 0 : reaisToCents(received, { allowZero: true });
  const difference = receivedCents === null ? 0 : receivedCents - cashCents;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const payCents = pay.trim() === '' ? 0 : reaisToCents(pay, { allowZero: true });
  const doorPart = !!group && chosen.length > 0;
  const payPart = !!payEntry && pay.trim() !== '' && payCents !== null && payCents > 0;

  const submit = async () => {
    if (!card) return;
    if (payEntry && pay.trim() !== '' && payCents === null) return toast.error('Valor do pagamento inválido');
    if (!doorPart && !payPart) return toast.error('Escolha os pedidos do acerto ou informe o pagamento');
    if (doorPart && receivedCents === null) return toast.error('Informe o dinheiro recebido');
    if (doorPart && difference !== 0 && reason.trim().length < 3) return toast.error('O dinheiro não bate: informe o motivo da diferença');
    setSaving(true);
    try {
      const res = await fetch(`/api/caixa/sessions/${sessionId}/acerto-entregador`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          ...(doorPart ? { driverName: group!.driverName, orderIds: chosen.map((o) => o.id), receivedCash: ((receivedCents ?? 0) / 100).toFixed(2), reason: reason.trim() || undefined } : {}),
          ...(payPart ? { pay: { key: payEntry!.key, amount: ((payCents ?? 0) / 100).toFixed(2), expected: payEntry!.expected } } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Não foi possível fazer o acerto');
        setKey(newKey());
        if (res.status === 409) reload();
        return;
      }
      toast.success(`Acerto de ${card.name ?? 'entregador sem nome'} lançado no caixa`);
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

        {cards === null && <p className="text-sm text-gray-500">Carregando…</p>}
        {cards && cards.length === 0 && <p className="text-sm text-gray-600">Nenhum entregador com acerto pendente.</p>}

        {cards && cards.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {cards.map((d, i) => (
              <Button key={d.id} size="sm" variant={pick === i ? 'default' : 'outline'} onClick={() => choose(i)}>
                {d.name ?? 'Sem nome'} · {d.door ? d.door.orders.length : d.pay?.quote.deliveryCount ?? 0}
              </Button>
            ))}
          </div>
        )}

        {card && (
          <>
            {group && (<>
            <p className="text-sm font-semibold">Dinheiro dos pedidos</p>
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
            </>)}
            {payEntry && (
              <div className="space-y-1 border-t pt-3">
                <p className="text-sm font-semibold">Pagamento</p>
                {payEntry.quote.text && <p className="text-sm text-gray-700">{payEntry.quote.text}</p>}
                <label htmlFor="acerto-pay" className="text-sm font-medium">Valor a pagar ao entregador</label>
                <Input id="acerto-pay" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} placeholder={payEntry.quote.suggestedCents === null && payEntry.quote.feeCapCents > 0 ? `até ${brl(payEntry.quote.feeCapCents)} (taxas de entrega)` : '0,00'} />
                <p className="text-xs text-gray-500">
                  Sai da gaveta como despesa "Entregador". Pode deixar o caixa negativo.{!isManager ? ' Acima do calculado (ou das taxas de entrega, se o nome foi digitado), só um gerente.' : ''}
                </p>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          {card && <Button disabled={saving || (!doorPart && !payPart)} onClick={submit}>Confirmar acerto</Button>}
        </div>
      </Card>
    </div>
  );
}
