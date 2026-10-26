'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CakeSlice, Phone, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { brl } from '@/components/caixa/money';
import { quantityLabel } from '@/lib/comanda/weight';
import { agenda, pickupLabel } from '@/lib/encomendas/agenda';
import type { EncomendaView } from '@/lib/encomendas/service';

// Same fallback as the offline outbox (lib/offline/outbox.ts): randomUUID needs a secure context
const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);

/**
 * Vender > Encomendas (spec 2026-10-26 encomendas): the agenda of orders for later, a new one, and
 * "Cliente retirou". The items and the deposit go on the comanda screen (/vender/[id]).
 */
export default function EncomendasPage() {
  const router = useRouter();
  const [list, setList] = useState<EncomendaView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/encomendas', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error || 'Não foi possível carregar as encomendas');
    setError(null);
    setList(body.encomendas);
  }, []);
  useEffect(() => { load(); }, [load]);

  const pickUp = async (e: EncomendaView) => {
    setBusy(e.id);
    try {
      const res = await fetch(`/api/encomendas/${e.id}/retirar`, { method: 'POST', headers: { 'Idempotency-Key': newKey() } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(body.error || 'Não foi possível registrar a retirada');
      if (body.status === 'CLOSED') {
        toast.success(`Encomenda de ${e.customerName ?? 'cliente'} entregue: venda registrada`);
        load();
      } else {
        toast.info('Receba o que falta em Conta para fechar a venda');
        router.push(`/vender/${e.id}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const now = new Date();
  const groups = agenda(list ?? [], now);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CakeSlice className="h-6 w-6" /> Encomendas</h1>
          <p className="text-sm text-muted-foreground">Bolos, salgados e tortas para retirar depois. O sinal entra no caixa do dia; a venda fecha na retirada.</p>
        </div>
        <Button className="gap-2" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nova encomenda</Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {list && groups.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma encomenda para retirar. Toque em Nova encomenda para anotar a primeira.</Card>
      )}

      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h2 className={`text-sm font-semibold uppercase tracking-wide ${g.key === 'atrasadas' ? 'text-red-600' : 'text-muted-foreground'}`}>
            {g.label} ({g.items.length})
          </h2>
          {g.items.map((e) => (
            <Card key={e.id} className={`p-4 space-y-2 ${g.key === 'atrasadas' ? 'border-red-200' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{e.customerName ?? 'Cliente'} · <span className="font-normal">{e.pickupAt ? pickupLabel(e.pickupAt, now) : 'sem data'}</span></p>
                  {e.customerPhone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {e.customerPhone}</p>}
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{brl(e.totalCents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.paidCents > 0 ? `Pago ${brl(e.paidCents)} · ` : ''}{e.remainingCents > 0 ? `falta ${brl(e.remainingCents)}` : e.totalCents > 0 ? 'pago' : ''}
                  </p>
                </div>
              </div>
              {e.items.length ? (
                <p className="text-sm">{e.items.map((i) => `${quantityLabel(i)} ${i.name}`).join(' · ')}</p>
              ) : (
                <p className="text-sm text-amber-700">Sem itens: abra para lançar.</p>
              )}
              {e.notes && <p className="text-sm italic text-slate-700">“{e.notes}”</p>}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => router.push(`/vender/${e.id}`)}>Abrir</Button>
                <Button size="sm" disabled={busy === e.id || e.items.length === 0} onClick={() => pickUp(e)}>Cliente retirou</Button>
              </div>
            </Card>
          ))}
        </section>
      ))}

      {creating && <NewEncomenda onClose={() => setCreating(false)} onCreated={(id) => router.push(`/vender/${id}`)} />}
    </div>
  );
}

function NewEncomenda({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pickup, setPickup] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [key] = useState(newKey);

  const save = async () => {
    if (!name.trim()) return toast.error('Informe o nome do cliente');
    if (!pickup) return toast.error('Informe a data e a hora da retirada');
    setSaving(true);
    try {
      const res = await fetch('/api/encomendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        // datetime-local is the device's local time (Brasília at the counter)
        body: JSON.stringify({ customerName: name, customerPhone: phone || undefined, pickupAt: new Date(pickup).toISOString(), notes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(body.error || 'Não foi possível criar a encomenda');
      toast.success('Encomenda criada: lance os itens e, se houver, receba o sinal em Conta');
      onCreated(body.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label="Nova encomenda" className="bg-white w-full lg:max-w-md rounded-t-2xl lg:rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Nova encomenda</h2>
        <div>
          <label htmlFor="enc-name" className="text-xs font-semibold text-slate-500">Cliente *</label>
          <Input id="enc-name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="enc-phone" className="text-xs font-semibold text-slate-500">Celular (opcional, entra no cadastro de clientes)</label>
          <Input id="enc-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label htmlFor="enc-pickup" className="text-xs font-semibold text-slate-500">Retirada *</label>
          <Input id="enc-pickup" type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} />
        </div>
        <div>
          <label htmlFor="enc-notes" className="text-xs font-semibold text-slate-500">Observação</label>
          <textarea id="enc-notes" maxLength={500} className="w-full border rounded-md p-2 text-sm" placeholder="Ex.: escrever Parabéns, Ana; vela de número 30" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button disabled={saving} onClick={save}>Criar e lançar itens</Button>
        </div>
      </div>
    </div>
  );
}
