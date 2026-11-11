'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Copy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProductPicker } from '@/components/cardapio-da-semana/product-picker';
import { dayLabel } from '@/lib/weekly-menu/rules';
import { buildItems, deadlineToIso } from '@/lib/weekly-menu/ui-helpers';

interface MenuRow { id: string; serviceDate: string; orderDeadline: string | null; itemCount: number; orderCount: number }

/** Cardápio e produtos > Cardápio da semana (spec 2026-11-10 cardapio-da-semana): list, new and copy. */
export default function CardapioDaSemanaPage() {
  const router = useRouter();
  const [menus, setMenus] = useState<MenuRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [copyFromId, setCopyFromId] = useState<string | undefined>();
  const [serviceDate, setServiceDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/cardapio/semana', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(body.error || 'Não foi possível carregar os cardápios da semana');
    setMenus(body.menus);
  }, []);
  useEffect(() => { load(); }, [load]);

  const startNew = () => { setCopyFromId(undefined); setServiceDate(''); setDeadline(''); setSelected({}); setCreating(true); };

  // Copy: the server takes the products of the source menu; the form only asks for the new date
  const startCopy = (m: MenuRow) => { setCopyFromId(m.id); setServiceDate(''); setDeadline(''); setSelected({}); setCreating(true); };

  const save = async () => {
    if (!serviceDate) return toast.error('Escolha a data do atendimento');
    setSaving(true);
    try {
      const res = await fetch('/api/cardapio/semana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceDate,
          orderDeadline: deadlineToIso(deadline),
          items: copyFromId ? undefined : buildItems(selected),
          copyFromId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(body.error || 'Não foi possível criar o cardápio da semana');
      toast.success('Cardápio da semana criado');
      router.push(`/admin/cardapio-da-semana/${body.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Cardápio da semana</h1>
          <p className="text-sm text-muted-foreground">Venda por encomenda para um dia: o cliente pede pelo link e o pedido entra no dia.</p>
        </div>
        <Button className="shrink-0 whitespace-nowrap" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> Novo cardápio da semana</Button>
      </div>

      {creating && (
        <Card className="p-4 space-y-4">
          <h2 className="font-semibold">{copyFromId ? 'Copiar de uma semana anterior' : 'Novo cardápio da semana'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sd">Data do atendimento</Label>
              <Input id="sd" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dl">Prazo para pedir (opcional)</Label>
              <Input id="dl" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          {copyFromId ? (
            <p className="text-sm text-muted-foreground">Os produtos e as porções da semana escolhida vêm junto. Depois de criar, troque só o que muda.</p>
          ) : (
            <ProductPicker selected={selected} onChange={setSelected} />
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Criar cardápio'}</Button>
          </div>
        </Card>
      )}

      {menus === null ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : menus.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum cardápio da semana ainda. Crie o primeiro.</Card>
      ) : (
        <div className="space-y-2">
          {menus.map((m) => (
            <Card key={m.id} className="p-4 flex items-center gap-3">
              <Link href={`/admin/cardapio-da-semana/${m.id}`} className="flex-1 min-w-0">
                <p className="font-semibold capitalize">{dayLabel(m.serviceDate)}</p>
                <p className="text-xs text-muted-foreground">
                  {m.itemCount} produto(s) · {m.orderCount} encomenda(s)
                  {m.orderDeadline ? ` · prazo ${new Date(m.orderDeadline).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                </p>
              </Link>
              <Button variant="outline" size="sm" onClick={() => startCopy(m)}><Copy className="h-3 w-3 mr-1" /> Copiar</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
