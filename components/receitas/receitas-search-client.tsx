'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Search } from 'lucide-react';

interface ReceitasSearchClientProps {
  initialSearch: string;
}

export function ReceitasSearchClient({ initialSearch }: ReceitasSearchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSearch = (value: string) => {
    startTransition(() => {
      if (value) {
        router.push(`/receitas?search=${encodeURIComponent(value)}&page=1`);
      } else {
        router.push('/receitas');
      }
    });
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
      <input
        type="text"
        placeholder="Buscar por nome ou código..."
        defaultValue={initialSearch}
        onChange={(e) => handleSearch(e.target.value)}
        disabled={isPending}
        className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-800 disabled:opacity-50"
      />
    </div>
  );
}
