'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { AdvancedFilter } from '@/components/ui/advanced-filter';
import { FilterPresetManager } from '@/components/ui/filter-preset';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/translations';

export default function InsumosPage() {
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const { t } = useI18n();

  useEffect(() => {
    fetchIngredients();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [search, filters, ingredients]);

  async function fetchIngredients() {
    try {
      const res = await fetch('/api/ingredients');
      if (!res.ok) throw new Error('Erro ao buscar insumos');
      const data = await res.json();
      setIngredients(data);
      
      // Extract categories
      const cats = Array.from(
        new Map(data.map((ing: any) => [ing.category?.id, ing.category])).values()
      ).filter(Boolean);
      setCategories(cats as any[]);
    } catch (error) {
      toast.error('Erro ao carregar insumos');
    } finally {
      setLoading(false);
    }
  }

  const applyFilters = () => {
    let result = ingredients;

    // Text search
    if (search) {
      result = result.filter(
        (ing) =>
          ing.name.toLowerCase().includes(search.toLowerCase()) ||
          ing.code?.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Category filter
    if (filters.category) {
      result = result.filter((ing) => ing.category?.id === filters.category);
    }

    // Unit filter
    if (filters.unit) {
      result = result.filter((ing) => ing.standardUnit === filters.unit);
    }

    // Has suppliers filter
    if (filters.hasSuppliers) {
      result = result.filter((ing) => ing.suppliers && ing.suppliers.length > 0);
    }

    // Price range filter
    if (filters.priceRange) {
      const [min, max] = filters.priceRange;
      result = result.filter(
        (ing) => ing.referenceCost >= min && ing.referenceCost <= max
      );
    }

    setFiltered(result);
  };

  const filterFields = [
    {
      key: 'category',
      label: 'Categoria',
      type: 'select' as const,
      options: categories.map((cat) => ({ label: cat.name, value: cat.id })),
    },
    {
      key: 'unit',
      label: 'Unidade',
      type: 'select' as const,
      options: [
        { label: 'kg', value: 'kg' },
        { label: 'g', value: 'g' },
        { label: 'L', value: 'L' },
        { label: 'ml', value: 'ml' },
        { label: 'un', value: 'un' },
      ],
    },
    {
      key: 'hasSuppliers',
      label: 'Com fornecedores',
      type: 'checkbox' as const,
    },
    {
      key: 'priceRange',
      label: 'Preço (R$)',
      type: 'range' as const,
      minValue: 0,
      maxValue: 1000,
      step: 10,
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <BackButton href="/dashboard" label={t('common.back')} />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold">{t('ingredients.title')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('ingredients.subtitle')}</p>
          </div>
        </div>
        <Link href="/insumos/novo" className="w-full sm:w-auto">
          <Button aria-label="Criar novo insumo" className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('ingredients.new')}
          </Button>
        </Link>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          placeholder={t('ingredients.search')}
          aria-label={t('ingredients.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-800"
        />
      </div>

      {/* Advanced Filters */}
      <AdvancedFilter
        filters={filterFields}
        onFilterChange={setFilters}
        onReset={() => setFilters({})}
      >
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {filtered.length} {filtered.length === 1 ? 'insumo' : 'insumos'} encontrado(s)
          </p>
          <FilterPresetManager
            currentFilters={filters}
            onLoadPreset={setFilters}
          />
        </div>
      </AdvancedFilter>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" height="h-40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center">
          <p className="text-slate-600">{t('ingredients.noData')}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ingredient) => (
            <Link key={ingredient.id} href={`/insumos/${ingredient.id}`}>
              <Card className="cursor-pointer p-4 transition-all hover:shadow-lg">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{ingredient.name}</h3>
                    <p className="text-xs text-slate-500">{ingredient.code}</p>
                  </div>
                  <span className="inline-block rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {ingredient.category?.name || 'Sem categoria'}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{ingredient.description || '-'}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {ingredient.standardUnit} • R$ {ingredient.referenceCost?.toFixed(2) || '0,00'}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}