'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BackButton } from '@/components/ui/back-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { GlassCard } from '@/components/ui/glass-card';
import { FadeIn } from '@/components/ui/animate';
import { CheckCircle, AlertTriangle, Search, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface CountItem {
  id: string;
  name: string;
  code: string;
  category: string;
  categoryColor: string;
  unit: string;
  systemQuantity: number;
  minimumStock: number;
  countedQuantity: string;
  counted: boolean;
}

export default function ContagemPage() {
  const [items, setItems] = useState<CountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('ALL');

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/stock-count');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.map((item: any) => ({ ...item, countedQuantity: '', counted: false })));
    } catch { toast.error('Erro ao carregar itens'); }
    finally { setLoading(false); }
  };

  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category));
    return ['ALL', ...Array.from(cats).sort()];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || item.code.toLowerCase().includes(search.toLowerCase());
      const matchCat = activeCategory === 'ALL' || item.category === activeCategory;
      return matchSearch && matchCat;
    });
  }, [items, search, activeCategory]);

  const updateCount = (id: string, value: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, countedQuantity: value, counted: value !== '' } : item
    ));
  };

  const handleSave = async () => {
    const counted = items.filter(i => i.counted && i.countedQuantity !== '');
    if (counted.length === 0) {
      toast.error('Nenhum item contado');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/stock-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counts: counted.map(i => ({
            ingredientId: i.id,
            countedQuantity: parseFloat(i.countedQuantity),
          })),
        }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      toast.success(result.message);
      fetchItems();
    } catch { toast.error('Erro ao salvar contagem'); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    setItems(prev => prev.map(item => ({ ...item, countedQuantity: '', counted: false })));
    toast.info('Contagem reiniciada');
  };

  const countedCount = items.filter(i => i.counted).length;
  const totalItems = items.length;
  const progress = totalItems > 0 ? (countedCount / totalItems) * 100 : 0;

  // Differences preview
  const differences = items.filter(i => {
    if (!i.counted || i.countedQuantity === '') return false;
    return Math.abs(parseFloat(i.countedQuantity) - i.systemQuantity) > 0.01;
  });

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Contagem Rápida' }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <BackButton href="/dashboard" label="Voltar" />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Contagem Rápida de Estoque</h1>
            <p className="text-sm text-muted-foreground">Checklist para contagem física</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} disabled={saving}>
            <RotateCcw className="h-4 w-4 mr-2" /> Limpar
          </Button>
          <Button onClick={handleSave} disabled={saving || countedCount === 0} loading={saving}>
            <Save className="h-4 w-4 mr-2" /> Salvar ({countedCount})
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <LoadingSkeleton key={i} variant="card" height="h-16" />)}
        </div>
      ) : (
        <FadeIn>
          <div className="space-y-4">
            {/* Progress */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progresso: {countedCount} de {totalItems} itens</span>
                <span className="text-sm font-bold">{progress.toFixed(0)}%</span>
              </div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </GlassCard>

            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar insumo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <Button
                    key={cat}
                    variant={activeCategory === cat ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveCategory(cat)}
                    className="text-xs"
                  >
                    {cat === 'ALL' ? 'Todos' : cat}
                  </Button>
                ))}
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const diff = item.counted && item.countedQuantity !== ''
                  ? parseFloat(item.countedQuantity) - item.systemQuantity
                  : null;
                const hasDiff = diff !== null && Math.abs(diff) > 0.01;

                return (
                  <Card key={item.id} className={`p-3 transition-all ${item.counted ? 'border-l-4 border-l-primary bg-primary/5' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.counted ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        {item.counted ? <CheckCircle className="h-4 w-4" /> : <span className="text-xs font-medium">{item.code.slice(0, 2)}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Sistema: <strong>{item.systemQuantity.toFixed(2)} {item.unit}</strong>
                          <span className="mx-1">•</span>
                          <span style={{ color: item.categoryColor }}>{item.category}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Input
                          type="number"
                          placeholder="Qtd"
                          value={item.countedQuantity}
                          onChange={(e) => updateCount(item.id, e.target.value)}
                          className="w-24 h-9 text-center text-sm"
                          step="0.01"
                          min="0"
                        />
                        <span className="text-xs text-muted-foreground w-8">{item.unit}</span>
                        {hasDiff && (
                          <span className={`text-xs font-bold whitespace-nowrap ${diff! > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {diff! > 0 ? '+' : ''}{diff!.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Differences Summary */}
            {differences.length > 0 && (
              <Card className="p-4 border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <h3 className="font-semibold text-sm">Diferenças Encontradas ({differences.length})</h3>
                </div>
                <div className="space-y-1">
                  {differences.map(item => {
                    const diff = parseFloat(item.countedQuantity) - item.systemQuantity;
                    return (
                      <p key={item.id} className="text-xs">
                        <strong>{item.name}</strong>: {item.systemQuantity.toFixed(2)} → {parseFloat(item.countedQuantity).toFixed(2)} {item.unit}
                        <span className={`ml-1 font-bold ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          ({diff > 0 ? '+' : ''}{diff.toFixed(2)})
                        </span>
                      </p>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </FadeIn>
      )}
    </div>
  );
}
