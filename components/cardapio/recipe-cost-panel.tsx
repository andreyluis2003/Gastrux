'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { productMargin } from '@/lib/recipes/cost';

/**
 * The ficha técnica inside the product (2026-10-18 UX research, proposal 4; Consumer shows it as a tab of the
 * product): the cost of one item sold, the margin and the CMV % at this price, the insumos, and a way to edit it.
 */
interface CostOut {
  recipeName: string;
  editHref: string;
  cost: number;
  lines: Array<{ name: string; quantity: number; unit: string; cost: number }>;
  missingCost: string[];
}

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const toPrice = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function RecipeCostPanel({ recipeId, price }: { recipeId: string | null | undefined; price: unknown }) {
  const [data, setData] = useState<CostOut | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!recipeId) {
      setData(null);
      return;
    }
    let alive = true;
    setState('loading');
    fetch(`/api/recipes/${recipeId}/cost`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (alive) { setData(d); setState('idle'); } })
      .catch(() => { if (alive) { setData(null); setState('error'); } });
    return () => { alive = false; };
  }, [recipeId]);

  if (!recipeId) {
    return (
      <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
        Sem ficha técnica, a venda não baixa o estoque e o custo fica fora do CMV.{' '}
        <Link href="/receitas/nova" className="underline font-medium">Criar ficha técnica</Link>
      </p>
    );
  }
  if (state === 'loading') return <p className="mt-2 text-xs text-muted-foreground">Calculando o custo...</p>;
  if (state === 'error' || !data) return <p className="mt-2 text-xs text-muted-foreground">Não foi possível calcular o custo agora.</p>;

  const m = productMargin(toPrice(price), data.cost);
  return (
    <div className="mt-2 rounded-lg border bg-slate-50 dark:bg-slate-900 p-3 space-y-2 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Custo</p>
          <p className="font-semibold">{money(data.cost)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Margem</p>
          <p className={`font-semibold ${m && m.marginCents < 0 ? 'text-red-600' : ''}`}>{m ? `${money(m.marginCents / 100)} (${m.marginPct}%)` : '-'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">CMV</p>
          <p className={`font-semibold ${m && m.cmvPct > 40 ? 'text-amber-700' : ''}`}>{m ? `${m.cmvPct}%` : '-'}</p>
        </div>
      </div>
      {data.missingCost.length > 0 && (
        <p className="text-xs text-amber-800">Sem custo cadastrado: {data.missingCost.join(', ')}. O custo real é maior.</p>
      )}
      <div className="flex items-center justify-between">
        <button type="button" className="text-xs underline" onClick={() => setOpen(!open)}>
          {open ? 'Esconder insumos' : `Ver os ${data.lines.length} insumos`}
        </button>
        <Link href={data.editHref} className="text-xs font-medium underline">Editar ficha técnica</Link>
      </div>
      {open && (
        <ul className="text-xs divide-y">
          {data.lines.map((l) => (
            <li key={l.name} className="flex justify-between py-1">
              <span>{l.name} · {l.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {l.unit}</span>
              <span>{money(l.cost)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
