'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { brtInputToIso, computeExpiry, daysFor, isoToBrtInput, STORAGE_LABEL, STORAGES, type ShelfLife, type Storage } from '@/lib/labels/rules';
import { TapKey } from '@/lib/labels/tap-key';

interface Item {
  type: 'RECIPE' | 'INGREDIENT';
  id: string;
  name: string;
  unit: string;
  storages: Storage[];
  shelfLife: ShelfLife;
  batches: Array<{ id: string; batchNumber: string; expirationDate: string }>;
}
interface Recent {
  id: string;
  itemName: string;
  storage: Storage;
  expiresAt: string;
  createdAt: string;
  printedBy: { name: string | null } | null;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = (d: Date | string) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Print food labels (spec 2026-10-09 etiquetas, 5.1): pick the item, the storage, print. The expiry
 * comes from the item's days; it can be changed. Printing needs the internet (the label is recorded).
 */
export default function LabelsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const manager = ['OWNER', 'MANAGER', 'ADMIN'].includes(role ?? '');
  const [items, setItems] = useState<Item[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [query, setQuery] = useState('');
  const [item, setItem] = useState<Item | null>(null);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [manualExpiry, setManualExpiry] = useState<string>('');
  const [changing, setChanging] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [copies, setCopies] = useState('1');
  const [batchId, setBatchId] = useState('');
  const [saveDefault, setSaveDefault] = useState(false);
  const [defaultDays, setDefaultDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const tapKey = useRef(new TapKey());
  // Any change to the request makes the next tap a new attempt (lib/labels/tap-key.ts)
  useEffect(() => { tapKey.current.reset(); }, [item, storage, manualExpiry, changing, quantity, copies, batchId, saveDefault, defaultDays]);

  const load = async () => {
    const [i, r] = await Promise.all([fetch('/api/labels/items'), fetch('/api/labels')]);
    if (i.ok) setItems(await i.json());
    else toast.error((await i.json().catch(() => ({}))).error || 'Não foi possível carregar os itens');
    if (r.ok) setRecent(await r.json());
  };
  useEffect(() => {
    load();
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const shown = useMemo(() => {
    const q = norm(query.trim());
    return q ? items.filter((i) => norm(i.name).includes(q)).slice(0, 30) : items.slice(0, 12);
  }, [items, query]);

  // Without days for any storage, every storage is offered with a manual date
  const storages = item ? (item.storages.length ? item.storages : STORAGES) : [];
  const days = item && storage ? daysFor(item.shelfLife, storage) : null;
  const needsDate = !!item && !!storage && days === null;
  const computed = days !== null ? computeExpiry(new Date(), days) : null;

  const reset = () => {
    setItem(null); setStorage(null); setManualExpiry(''); setChanging(false);
    setQuantity(''); setCopies('1'); setBatchId(''); setSaveDefault(false); setDefaultDays('');
    tapKey.current.reset();
  };

  const print = async () => {
    if (!item || !storage || busy) return;
    const typedExpiry = needsDate || changing ? brtInputToIso(manualExpiry) : null;
    if ((needsDate || changing) && !typedExpiry) { toast.error('Informe a validade'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': tapKey.current.get() },
        body: JSON.stringify({
          itemType: item.type,
          itemId: item.id,
          storage,
          expiresAt: typedExpiry,
          quantity: quantity || null,
          batchId: batchId || null,
          copies: Number(copies) || 1,
          saveAsDefaultDays: needsDate && saveDefault && defaultDays !== '' ? Number(defaultDays) : null,
        }),
      });
      tapKey.current.answered();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível imprimir'); return; }
      printInHiddenFrame(`/imprimir/etiquetas?ids=${body.ids.join(',')}`);
      toast.success(body.ids.length > 1 ? `${body.ids.length} etiquetas enviadas para a impressora` : 'Etiqueta enviada para a impressora');
      reset();
      load();
    } catch {
      tapKey.current.lost();
      toast.error('Sem resposta do servidor: confira o histórico antes de imprimir de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Etiquetas</h1>
        <Link href="/etiquetas/validades" className="text-sm font-medium text-blue-600 hover:underline">Validades</Link>
      </div>

      {!item ? (
        <Card className="p-4 space-y-3">
          <Input placeholder="Buscar preparo ou insumo" value={query} onChange={(e) => setQuery(e.target.value)} />
          {shown.length === 0 && <p className="text-sm text-gray-500">Nenhum item encontrado. Cadastre fichas técnicas ou insumos.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {shown.map((i) => (
              <button
                key={`${i.type}-${i.id}`}
                type="button"
                onClick={() => { setItem(i); setStorage(i.storages.length === 1 ? i.storages[0] : null); }}
                className="text-left rounded-md border p-3 hover:bg-slate-50"
              >
                <p className="font-medium">{i.name}</p>
                <p className="text-xs text-gray-500">{i.type === 'RECIPE' ? 'Preparo' : 'Insumo'}</p>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-lg font-semibold">{item.name}</p>
              <p className="text-xs text-gray-500">{item.type === 'RECIPE' ? 'Preparo' : 'Insumo aberto'}</p>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>Trocar item</Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {storages.map((s) => (
              <Button key={s} type="button" variant={storage === s ? 'default' : 'outline'} className="h-14 text-base" onClick={() => { setStorage(s); setChanging(false); setManualExpiry(''); }}>
                {STORAGE_LABEL[s]}
              </Button>
            ))}
          </div>

          {storage && (computed && !changing ? (
            <div className="flex items-center justify-between rounded-md bg-slate-50 p-3">
              <p className="text-lg font-bold">Validade: {fmt(computed)}</p>
              <Button variant="outline" size="sm" onClick={() => { setChanging(true); setManualExpiry(isoToBrtInput(computed)); }}>Mudar</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="expiry">Validade (horário de Brasília)</Label>
              <Input id="expiry" type="datetime-local" value={manualExpiry} onChange={(e) => setManualExpiry(e.target.value)} />
              {needsDate && manager && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} />
                  Salvar como padrão deste item:
                  <Input className="w-20" type="number" min={0} max={365} value={defaultDays} onChange={(e) => setDefaultDays(e.target.value)} disabled={!saveDefault} />
                  dias ({STORAGE_LABEL[storage].toLowerCase()})
                </label>
              )}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qty">Quantidade ({item.unit}, opcional)</Label>
              <Input id="qty" type="number" min={0} step="any" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="copies">Etiquetas</Label>
              <Input id="copies" type="number" min={1} max={20} step={1} inputMode="numeric" value={copies} onChange={(e) => setCopies(e.target.value)} />
            </div>
          </div>

          {item.type === 'INGREDIENT' && item.batches.length > 0 && (
            <div>
              <Label htmlFor="batch">Lote (opcional)</Label>
              <select id="batch" className="mt-1 w-full border rounded-md px-3 py-2 text-sm" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">Sem lote</option>
                {item.batches.map((b) => (
                  <option key={b.id} value={b.id}>Lote {b.batchNumber} · vence {new Date(b.expirationDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</option>
                ))}
              </select>
            </div>
          )}

          {!online && <p className="rounded-md bg-amber-50 p-3 text-sm">Sem internet: imprimir etiqueta precisa de conexão.</p>}
          <Button className="w-full h-12 text-base" disabled={!storage || busy || !online} onClick={print}>Imprimir</Button>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold">Impressas nos últimos 30 dias</h2>
        {recent.length === 0 && <p className="text-sm text-gray-500">Nenhuma etiqueta ainda.</p>}
        <ul className="divide-y">
          {recent.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{l.itemName}</p>
                <p className="text-xs text-gray-500">{STORAGE_LABEL[l.storage]} · validade {fmt(l.expiresAt)} · {l.printedBy?.name?.split(' ')[0] ?? ''}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => printInHiddenFrame(`/imprimir/etiquetas?ids=${l.id}`)}>Reimprimir</Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
