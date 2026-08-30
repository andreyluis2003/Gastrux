'use client';

import { useRouter } from 'next/navigation';
import { useTransition, useState, useEffect, useRef } from 'react';
import { Search, Loader2, X } from 'lucide-react';

interface EstoqueFilterClientProps {
  initialSearch: string;
  initialCategory: string;
  initialStockStatus: string;
  initialUnit: string;
  initialQuantityMin: string;
  initialQuantityMax: string;
}

export function EstoqueFilterClient({
  initialSearch,
  initialCategory,
  initialStockStatus,
  initialUnit,
  initialQuantityMin,
  initialQuantityMax,
}: EstoqueFilterClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushedRef = useRef<string>(initialSearch);

  // Keep local state in sync with external URL changes (e.g., back/forward)
  useEffect(() => {
    setSearch(initialSearch);
    lastPushedRef.current = initialSearch;
  }, [initialSearch]);

  const pushSearch = (value: string) => {
    if (value === lastPushedRef.current) return;
    lastPushedRef.current = value;
    startTransition(() => {
      const params = new URLSearchParams();
      if (value) params.set('search', value);
      if (initialCategory) params.set('category', initialCategory);
      if (initialStockStatus) params.set('stockStatus', initialStockStatus);
      if (initialUnit) params.set('unit', initialUnit);
      if (initialQuantityMin) params.set('quantityMin', initialQuantityMin);
      if (initialQuantityMax) params.set('quantityMax', initialQuantityMax);

      const queryString = params.toString();
      router.push(`/estoque${queryString ? '?' + queryString : ''}`);
    });
  };

  const handleChange = (value: string) => {
    // Immediately reflect what user typed in the input (responsive UX)
    setSearch(value);

    // Debounce the URL update so we only query after typing pause
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      pushSearch(value.trim());
    }, 300);
  };

  const handleClear = () => {
    setSearch('');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    pushSearch('');
  };

  // Cleanup the debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" aria-hidden="true" />
      <input
        type="text"
        placeholder="Buscar por nome ou código..."
        value={search}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Buscar insumos no estoque"
        className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-800"
      />
      {isPending ? (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" aria-hidden="true" />
      ) : search ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Limpar busca"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
