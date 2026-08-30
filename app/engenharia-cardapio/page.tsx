'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { FadeIn } from '@/components/ui/animate';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Star, HelpCircle, XCircle, TrendingUp, ArrowUpRight, ArrowDownRight, Save, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';

const CLASS_CONFIG: Record<string, { label: string; labelPt: string; emoji: string; icon: any; color: string; bg: string; description: string }> = {
  STAR: { label: 'Estrela', labelPt: '⭐ Estrela', emoji: '⭐', icon: Star, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200', description: 'Popular + Lucrativo. Manter e promover!' },
  HORSE: { label: 'Cavalo de Batalha', labelPt: '🐎 Cavalo', emoji: '🐎', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200', description: 'Popular mas baixa margem. Renegocie custos.' },
  PUZZLE: { label: 'Enigma', labelPt: '🧩 Enigma', emoji: '🧩', icon: HelpCircle, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200', description: 'Lucrativo mas pouco vendido. Promova mais!' },
  DOG: { label: 'Abacaxi', labelPt: '🍍 Abacaxi', emoji: '🍍', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200', description: 'Baixa venda + baixa margem. Considere remover.' },
};

const CLASS_ORDER = ['STAR', 'HORSE', 'PUZZLE', 'DOG'];

export default function EngenhariaCardapioPage() {
  const [data, setData] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>('ALL');
  const [period, setPeriod] = useState('30');
  const [tab, setTab] = useState<'list' | 'recommendations'>('list');

  useEffect(() => { fetchAll(); }, [period]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [meRes, histRes] = await Promise.all([
        fetch(`/api/menu-engineering?period=${period}`),
        fetch('/api/menu-engineering/history'),
      ]);
      if (!meRes.ok) throw new Error();
      setData(await meRes.json());
      if (histRes.ok) {
        const h = await histRes.json();
        setTrends(h.trends || []);
      }
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  };

  const createSnapshot = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/menu-engineering/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: parseInt(period) }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      toast.success(`${result.count} snapshots salvos!`);
      fetchAll();
    } catch {
      toast.error('Erro ao salvar snapshot');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const filtered = data?.recipes?.filter((r: any) => filter === 'ALL' || r.classification === filter) || [];

  const byClass = CLASS_ORDER.reduce((acc, c) => {
    acc[c] = data?.recipes?.filter((r: any) => r.classification === c) || [];
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Engenharia de Cardápio' }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <BackButton href="/dashboard" label="Voltar" />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Engenharia de Cardápio</h1>
            <p className="text-sm text-muted-foreground">
              Classificação BCG · {data?.dataSource === 'SALES' ? 'Baseado em vendas reais' : 'Baseado em produção'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={createSnapshot} disabled={saving || !data} size="sm" variant="outline">
            <Save className="h-4 w-4 mr-1" />
            {saving ? 'Salvando...' : 'Snapshot'}
          </Button>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="15">15 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Trends banner */}
      {trends.length > 0 && (
        <Card className="p-4 border-l-4 border-l-indigo-500 bg-indigo-50 dark:bg-indigo-900/20">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-sm">Mudanças recentes de classificação</p>
              <div className="mt-2 space-y-1">
                {trends.slice(0, 5).map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{t.recipeName}</span>
                    <span className="text-muted-foreground">{CLASS_CONFIG[t.from]?.emoji} {CLASS_CONFIG[t.from]?.label}</span>
                    <ArrowDownRight className="h-3 w-3" />
                    <span className="font-semibold">{CLASS_CONFIG[t.to]?.emoji} {CLASS_CONFIG[t.to]?.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <LoadingSkeleton key={i} variant="card" height="h-24" />)}
          </div>
        </div>
      ) : data ? (
        <FadeIn>
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(CLASS_CONFIG).map(([key, config]) => {
                const count = data.summary[key.toLowerCase() + 's'] || 0;
                return (
                  <button key={key} onClick={() => setFilter(filter === key ? 'ALL' : key)} className="text-left">
                    <Card className={`p-4 transition-all cursor-pointer ${filter === key ? 'ring-2 ring-primary scale-105' : ''} ${config.bg}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{config.emoji}</span>
                        <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
                      </div>
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{config.description}</p>
                    </Card>
                  </button>
                );
              })}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setTab('list')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  tab === 'list'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Lista completa
              </button>
              <button
                onClick={() => setTab('recommendations')}
                className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1 ${
                  tab === 'recommendations'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Lightbulb className="h-4 w-4" />
                Recomendações
              </button>
            </div>

            {tab === 'list' && (
              <>
                {filter !== 'ALL' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Filtrando:</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${CLASS_CONFIG[filter]?.bg} ${CLASS_CONFIG[filter]?.color}`}>
                      {CLASS_CONFIG[filter]?.labelPt}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setFilter('ALL')}>Limpar</Button>
                  </div>
                )}

                {/* Recipe List */}
                <div className="space-y-3">
                  {filtered.length === 0 ? (
                    <Card className="p-8 text-center">
                      <p className="text-muted-foreground">Nenhuma receita encontrada. {!data.recipes?.length ? 'Cadastre receitas para começar.' : ''}</p>
                    </Card>
                  ) : (
                    filtered.map((recipe: any) => {
                      const config = CLASS_CONFIG[recipe.classification];
                      return (
                        <Card key={recipe.id} className={`p-4 border-l-4 ${config.bg}`}>
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-lg">{config.emoji}</span>
                                <h3 className="font-semibold">{recipe.name}</h3>
                                <span className="text-xs text-muted-foreground">({recipe.code})</span>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">{config.description}</p>
                              {recipe.recommendation && (
                                <div className="flex items-start gap-1.5 text-xs bg-white/60 dark:bg-slate-900/60 rounded p-2">
                                  <Lightbulb className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                                  <span>{recipe.recommendation}</span>
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-4 gap-3 sm:gap-5 text-sm shrink-0">
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">Custo</p>
                                <p className="font-bold text-xs sm:text-sm">{fmt(recipe.costPerPortion)}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">Venda</p>
                                <p className="font-bold text-xs sm:text-sm">{recipe.sellingPrice ? fmt(recipe.sellingPrice) : '—'}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">Food Cost</p>
                                <p className={`font-bold text-xs sm:text-sm ${recipe.foodCostPercent > 35 ? 'text-red-600' : recipe.foodCostPercent > 28 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {recipe.sellingPrice ? `${recipe.foodCostPercent.toFixed(1)}%` : '—'}
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">Vendido</p>
                                <p className="font-bold text-xs sm:text-sm">{recipe.qtySold || 0}</p>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {tab === 'recommendations' && (
              <div className="space-y-4">
                {CLASS_ORDER.map((cls) => {
                  const items = byClass[cls];
                  if (items.length === 0) return null;
                  const config = CLASS_CONFIG[cls];
                  return (
                    <Card key={cls} className={`p-4 border-l-4 ${config.bg}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">{config.emoji}</span>
                        <h3 className="font-bold">{config.label}</h3>
                        <span className="text-xs text-muted-foreground">({items.length} prato{items.length > 1 ? 's' : ''})</span>
                      </div>
                      <div className="space-y-2">
                        {items.map((recipe: any) => (
                          <div key={recipe.id} className="bg-white/80 dark:bg-slate-900/60 rounded p-3">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="font-semibold text-sm">{recipe.name}</p>
                              <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                                <span>Margem: <strong className={recipe.profitMargin > 60 ? 'text-emerald-600' : recipe.profitMargin > 40 ? 'text-blue-600' : 'text-red-600'}>{recipe.profitMargin.toFixed(1)}%</strong></span>
                                <span>Vendas: <strong>{recipe.qtySold}</strong></span>
                              </div>
                            </div>
                            {recipe.recommendation && (
                              <div className="flex items-start gap-1.5 text-xs mt-2">
                                <Lightbulb className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                                <span className="text-muted-foreground">{recipe.recommendation}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <Card className="p-6 border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-900/20">
              <h3 className="font-semibold mb-3">📊 Como funciona a Engenharia de Cardápio</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
                <div><strong>⭐ Estrela</strong>: Muito vendido + alta margem → Mantenha e destaque</div>
                <div><strong>🐎 Cavalo</strong>: Muito vendido + baixa margem → Renegocie preços ou ajuste porção</div>
                <div><strong>🧩 Enigma</strong>: Pouco vendido + alta margem → Promova e destaque no cardápio</div>
                <div><strong>🍍 Abacaxi</strong>: Pouco vendido + baixa margem → Reformule ou remova</div>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                {data.dataSource === 'SALES'
                  ? 'Classificação baseada em vendas reais (OrderSession) dos últimos ' + period + ' dias.'
                  : 'Sem vendas registradas no período. Usando dados de produção como fallback.'}
              </p>
            </Card>
          </div>
        </FadeIn>
      ) : null}
    </div>
  );
}
