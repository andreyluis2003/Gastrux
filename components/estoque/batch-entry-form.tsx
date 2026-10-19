'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatQuantity } from '@/lib/formatters';

/** The form of the Entrada em lote: one row per insumo, a sticky confirm bar (2026-10-18 UX research, proposal 3) */
export interface BatchRow { id: string; name: string; unit: string; quantity: number; minimum: number; hasStock: boolean; cost: number; below: boolean }

const newBatchId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const money = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BatchEntryForm({ rows }: { rows: BatchRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, { quantity: string; unitCost: string }>>({});
  const [search, setSearch] = useState('');
  const [onlyBelow, setOnlyBelow] = useState(false);
  const [batchId, setBatchId] = useState(newBatchId);
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => (!s || r.name.toLowerCase().includes(s)) && (!onlyBelow || r.below));
  }, [rows, search, onlyBelow]);
  const filled = Object.entries(values).filter(([, v]) => v.quantity.trim() !== '');
  const set = (id: string, key: 'quantity' | 'unitCost', v: string) => setValues((cur) => ({ ...cur, [id]: { ...(cur[id] ?? { quantity: '', unitCost: '' }), [key]: v } }));

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch('/api/stock/batch-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, items: filled.map(([ingredientId, v]) => ({ ingredientId, quantity: v.quantity, unitCost: v.unitCost })) }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(out.error || 'Não foi possível dar entrada no estoque');
        return;
      }
      toast.success(out.entered === 1 ? '1 insumo entrou no estoque' : `${out.entered} insumos entraram no estoque`);
      setValues({});
      setBatchId(newBatchId());
      router.push('/estoque');
      router.refresh();
    } catch {
      toast.error('Sem conexão. Nada foi salvo; tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum insumo cadastrado ainda. Cadastre em Cardápio e produtos &gt; Insumos.</Card>;
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          className="flex-1 rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-900"
          placeholder="Buscar insumo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyBelow} onChange={(e) => setOnlyBelow(e.target.checked)} />
          Só os abaixo do mínimo
        </label>
      </div>

      <Card className="divide-y">
        <div className="hidden sm:grid grid-cols-[1fr_9rem_9rem] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Insumo</span><span>Quantidade que chegou</span><span>Custo por unidade (R$)</span>
        </div>
        {shown.map((r) => (
          <div key={r.id} className="grid grid-cols-2 sm:grid-cols-[1fr_9rem_9rem] gap-2 sm:gap-3 px-4 py-3 items-center">
            <div className="col-span-2 sm:col-span-1">
              <p className="font-medium text-sm">{r.name}</p>
              <p className={`text-xs ${r.below ? 'text-orange-600' : 'text-muted-foreground'}`}>
                {r.hasStock ? `Tem ${formatQuantity(r.quantity, r.unit)}` : 'Sem entrada ainda'}
                {r.minimum ? ` · mínimo ${r.minimum} ${r.unit}` : ''}
              </p>
            </div>
            <label className="text-xs text-muted-foreground sm:text-sm">
              <span className="sm:hidden">Chegou ({r.unit})</span>
              <div className="flex items-center gap-1">
                <input
                  inputMode="decimal"
                  aria-label={`Quantidade de ${r.name} em ${r.unit}`}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm text-foreground bg-white dark:bg-slate-900"
                  placeholder="0"
                  value={values[r.id]?.quantity ?? ''}
                  onChange={(e) => set(r.id, 'quantity', e.target.value)}
                />
                <span className="text-xs">{r.unit}</span>
              </div>
            </label>
            <label className="text-xs text-muted-foreground sm:text-sm">
              <span className="sm:hidden">Custo por {r.unit} (R$)</span>
              <input
                inputMode="decimal"
                aria-label={`Custo de ${r.name} por ${r.unit}`}
                className="w-full rounded-lg border px-2 py-1.5 text-sm text-foreground bg-white dark:bg-slate-900"
                placeholder={r.cost > 0 ? money(r.cost) : 'opcional'}
                value={values[r.id]?.unitCost ?? ''}
                onChange={(e) => set(r.id, 'unitCost', e.target.value)}
              />
            </label>
          </div>
        ))}
        {shown.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum insumo com esse filtro.</p>}
      </Card>

      {/* Sticky inside the page column: a fixed bar covered the side menu (Sair) */}
      <div className="sticky bottom-0 z-30 rounded-xl border bg-white/95 dark:bg-slate-950/95 backdrop-blur px-4 py-3 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <p className="text-sm">{filled.length === 1 ? '1 insumo preenchido' : `${filled.length} insumos preenchidos`}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/estoque')}>Cancelar</Button>
            <Button onClick={confirm} disabled={busy || filled.length === 0}>{busy ? 'Salvando...' : 'Confirmar entrada'}</Button>
          </div>
        </div>
      </div>
    </>
  );
}
