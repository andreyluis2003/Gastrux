'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Category { id: string; name: string; active?: boolean; items: { id: string; name: string; price: string | number; available?: boolean }[] }

/**
 * Product picker of the weekly menu (spec 2026-11-10 cardapio-da-semana): search, checkbox per
 * product and an optional "Porções" limit per checked product. selected: menuItemId -> limit text.
 */
export function ProductPicker({
  selected,
  onChange,
  lockedIds = [],
}: {
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** Products that cannot be unchecked (they already have orders) */
  lockedIds?: string[];
}) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/cardapio/categorias', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => setCategories([]));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (categories ?? [])
      .filter((c) => c.active !== false || c.items.some((i) => i.id in selected))
      // Unavailable products are listed too: the weekly menu sells them by design (spec 2026-11-10 cardapio-da-semana).
      // Inactive ones never come from the endpoint
      .map((c) => ({ ...c, items: c.items.filter((i) => !q || i.name.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0);
  }, [categories, search, selected]);

  const toggle = (id: string) => {
    const next = { ...selected };
    if (id in next) delete next[id];
    else next[id] = '';
    onChange(next);
  };

  if (categories === null) return <p className="text-sm text-muted-foreground">Carregando produtos...</p>;

  return (
    <div className="space-y-3">
      <Input placeholder="Buscar produto" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar produto" />
      <p className="text-xs text-muted-foreground">{Object.keys(selected).length} produto(s) no cardápio da semana</p>
      <div className="max-h-96 overflow-y-auto space-y-4 border rounded-md p-3">
        {visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
        {visible.map((c) => (
          <div key={c.id} className="space-y-1">
            <h4 className="text-sm font-semibold">{c.name}</h4>
            {c.items.map((i) => {
              const checked = i.id in selected;
              const locked = lockedIds.includes(i.id);
              return (
                <div key={i.id} className="flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <input type="checkbox" checked={checked} disabled={locked && checked} onChange={() => toggle(i.id)} />
                    <span className="truncate">{i.name}</span>
                    {i.available === false && <span className="text-xs text-amber-700">esgotado no cardápio normal</span>}
                    {c.active === false && <span className="text-xs text-red-600">indisponível</span>}
                    <span className="text-muted-foreground">{money(Number(i.price))}</span>
                  </label>
                  {checked && (
                    <Input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="Porções"
                      aria-label={`Porções de ${i.name}`}
                      className="w-24 h-8"
                      value={selected[i.id]}
                      onChange={(e) => onChange({ ...selected, [i.id]: e.target.value })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
