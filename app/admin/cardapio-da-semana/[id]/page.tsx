'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Printer, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BackButton } from '@/components/ui/back-button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ProductPicker } from '@/components/cardapio-da-semana/product-picker';
import { dayLabel } from '@/lib/weekly-menu/rules';
import { buildItems, deadlineToIso, isoToLocalInput, summaryLine } from '@/lib/weekly-menu/ui-helpers';

interface Detail {
  menu: { id: string; serviceDate: string; orderDeadline: string | null };
  items: { menuItemId: string; name: string; price: number; portionLimit: number | null; ordered: number; remaining: number | null }[];
  summary: { menuItemId: string; name: string; quantity: number; notes: { text: string; quantity: number }[] }[];
  orders: {
    id: string; orderNumber: string; status: string; customerName: string; customerPhone: string; isPickup: boolean;
    deliveryAddress: string | null; paymentNote: string; total: number; cancelReason: string | null;
    items: { id: string; name: string; quantity: number; specialInstructions: string | null }[];
  }[];
}

const STATUS: Record<string, string> = { PLACED: 'Aguardando o dia', RELEASING: 'Entrando no dia', RELEASED: 'Virou pedido', CANCELLED: 'Cancelada' };
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** One weekly menu (spec 2026-11-10 cardapio-da-semana): products and limits, "O que fazer", orders. */
export default function CardapioDaSemanaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/cardapio/semana/${id}`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(body.error || 'Não foi possível carregar o cardápio da semana');
    setData(body);
    setSelected(Object.fromEntries(body.items.map((i: Detail['items'][number]) => [i.menuItemId, i.portionLimit ? String(i.portionLimit) : ''])));
    setDeadline(isoToLocalInput(body.menu.orderDeadline));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/cardapio/semana/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderDeadline: deadlineToIso(deadline), items: buildItems(selected) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(body.error || 'Não foi possível salvar');
      toast.success('Cardápio da semana salvo');
      load();
    } finally {
      setSaving(false);
    }
  };

  const cancelOrder = async () => {
    if (!cancelId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cardapio/semana/${id}/encomendas/${cancelId}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(body.error || 'Não foi possível cancelar a encomenda');
      toast.success('Encomenda cancelada');
      setCancelId(null);
      setReason('');
      load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/cardapio/semana/${id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(body.error || 'Não foi possível apagar o cardápio');
      toast.success('Cardápio da semana apagado');
      window.location.href = '/admin/cardapio-da-semana';
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  const limitOf = (menuItemId: string) => data.items.find((i) => i.menuItemId === menuItemId)?.portionLimit ?? null;
  const lockedIds = data.items.filter((i) => i.ordered > 0).map((i) => i.menuItemId);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Print: only the "O que fazer" block */}
      <style>{`@media print { body * { visibility: hidden !important; } #o-que-fazer, #o-que-fazer * { visibility: visible !important; } #o-que-fazer { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>

      <BackButton href="/admin/cardapio-da-semana" label="Cardápios da semana" />
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-2xl font-bold capitalize">{dayLabel(data.menu.serviceDate)}</h1>
        <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4 mr-1" /> Apagar</Button>
      </div>

      <Card className="p-4 space-y-3" id="o-que-fazer">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">O que fazer</h2>
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Imprimir</Button>
        </div>
        <p className="hidden print:block text-sm">{dayLabel(data.menu.serviceDate)}</p>
        {data.summary.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há encomendas.</p>
        ) : (
          <ul className="space-y-2">
            {data.summary.map((s) => (
              <li key={s.menuItemId}>
                <p className="font-medium">{summaryLine(s.name, s.quantity, limitOf(s.menuItemId))}</p>
                {s.notes.map((n) => (
                  <p key={n.text} className="text-sm text-muted-foreground pl-3">{n.quantity}x {n.text}</p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Produtos e porções</h2>
        <div className="space-y-1 max-w-xs">
          <Label htmlFor="dl">Prazo para pedir (opcional)</Label>
          <Input id="dl" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <ProductPicker selected={selected} onChange={setSelected} lockedIds={lockedIds} />
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Encomendas</h2>
        {data.orders.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma encomenda ainda.</p>}
        {data.orders.map((o) => (
          <div key={o.id} className="border rounded-md p-3 space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{o.customerName} · {o.customerPhone}</p>
              <span className="text-xs rounded-full bg-muted px-2 py-0.5">{STATUS[o.status] ?? o.status}</span>
            </div>
            <p>{o.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</p>
            <p className="text-muted-foreground">
              {o.isPickup ? 'Retirada no local' : `Entrega: ${o.deliveryAddress ?? ''}`} · {o.paymentNote} · {money(o.total)}
            </p>
            {o.cancelReason && <p className="text-muted-foreground">Motivo: {o.cancelReason}</p>}
            {o.status === 'PLACED' && (
              <Button variant="outline" size="sm" onClick={() => { setCancelId(o.id); setReason(''); }}>Cancelar</Button>
            )}
          </div>
        ))}
      </Card>

      <AlertDialog open={!!cancelId} onOpenChange={(open) => { if (!open && !busy) setCancelId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta encomenda?</AlertDialogTitle>
            <AlertDialogDescription>As porções voltam para o cardápio. Avise o cliente.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="Motivo" aria-label="Motivo do cancelamento" value={reason} onChange={(e) => setReason(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); cancelOrder(); }}>Cancelar encomenda</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={(open) => { if (!busy) setConfirmDelete(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este cardápio da semana?</AlertDialogTitle>
            <AlertDialogDescription>As encomendas canceladas dele também somem. Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); remove(); }}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
