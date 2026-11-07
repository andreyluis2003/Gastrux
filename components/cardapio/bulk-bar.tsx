'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DayPicker } from './day-picker';

type Mode = null | 'ajuste' | 'categoria' | 'dias';

/**
 * The bar that shows while items are ticked (spec 2026-11-06 cardapio-rapido §3): sold out, back on sale, price
 * change in %, another category, QR and site, weekdays. `run` sends one POST /api/cardapio/itens/lote.
 */
export function BulkBar({
  count,
  categories,
  busy,
  run,
  clear,
}: {
  count: number;
  categories: { id: string; name: string }[];
  busy: boolean;
  run: (body: Record<string, unknown>) => Promise<boolean>;
  clear: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [pct, setPct] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const pctNum = Number(pct.replace(',', '.'));
  const pctOk = pct.trim() !== '' && Number.isFinite(pctNum) && pctNum !== 0 && pctNum >= -50 && pctNum <= 50;
  const done = async (body: Record<string, unknown>) => { if (await run(body)) { setMode(null); setPct(''); } };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur lg:left-64">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{count} {count === 1 ? 'item marcado' : 'itens marcados'}</span>
          <Button size="sm" variant="ghost" className="gap-1" onClick={() => { setMode(null); clear(); }}>
            <X className="h-4 w-4" /> Limpar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => done({ acao: 'esgotar' })}>Esgotar</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => done({ acao: 'voltar' })}>Voltar a vender</Button>
          <Button size="sm" variant={mode === 'ajuste' ? 'default' : 'outline'} disabled={busy} onClick={() => setMode(mode === 'ajuste' ? null : 'ajuste')}>Ajustar preço</Button>
          <Button size="sm" variant={mode === 'categoria' ? 'default' : 'outline'} disabled={busy} onClick={() => setMode(mode === 'categoria' ? null : 'categoria')}>Mover</Button>
          <Button size="sm" variant={mode === 'dias' ? 'default' : 'outline'} disabled={busy} onClick={() => setMode(mode === 'dias' ? null : 'dias')}>Dias da semana</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => done({ acao: 'canais', mostrar: false })}>Ocultar no QR e site</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => done({ acao: 'canais', mostrar: true })}>Mostrar no QR e site</Button>
        </div>

        {mode === 'ajuste' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            Mudar os preços em
            <Input className="h-8 w-20" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="10" aria-label="Ajuste em porcentagem" autoFocus />
            % <span className="text-xs text-muted-foreground">(-50 a 50; -10 baixa 10%)</span>
            <Button size="sm" disabled={busy || !pctOk} onClick={() => done({ acao: 'ajuste', pct: pctNum })}>Aplicar</Button>
          </div>
        )}
        {mode === 'categoria' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            Mover para
            <select className="h-8 rounded border px-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria">
              <option value="">Escolha a categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Button size="sm" disabled={busy || !categoryId} onClick={() => done({ acao: 'categoria', categoryId })}>Mover</Button>
          </div>
        )}
        {mode === 'dias' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            Aparece para o cliente em
            <DayPicker value={days} onChange={setDays} />
            <Button size="sm" disabled={busy} onClick={() => done({ acao: 'dias', dias: days.length ? days : [0, 1, 2, 3, 4, 5, 6] })}>Aplicar</Button>
          </div>
        )}
      </div>
    </div>
  );
}
