'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  Calendar,
  Star,
  HelpCircle,
  XCircle,
  BarChart3,
  History,
  RefreshCw,
} from 'lucide-react';

const CLASS_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string; textColor: string }> = {
  STAR: { label: 'Estrela', emoji: '⭐', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', textColor: 'text-amber-900 dark:text-amber-100' },
  HORSE: { label: 'Cavalo', emoji: '🐎', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', textColor: 'text-blue-900 dark:text-blue-100' },
  PUZZLE: { label: 'Enigma', emoji: '🧩', color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', textColor: 'text-purple-900 dark:text-purple-100' },
  DOG: { label: 'Abacaxi', emoji: '🍍', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', textColor: 'text-red-900 dark:text-red-100' },
};

interface Trend {
  recipeId: string;
  recipeName: string;
  recipeCode: string;
  from: string;
  to: string;
  marginChange: number;
  quantityChange: number;
  changedAt: string;
}

interface Snapshot {
  id: string;
  recipeId: string;
  classification: string;
  quantitySold: number;
  profitMargin: number;
  foodCostPercent: number;
  periodStart: string;
  periodEnd: string;
  recipe?: { name: string; code: string };
}

interface RecipeHistory {
  recipeId: string;
  recipeName: string;
  snapshots: Snapshot[];
}

export default function CardapioTemporalPage() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [allSnapshots, setAllSnapshots] = useState<Snapshot[]>([]);
  const [recipes, setRecipes] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<string>('all');
  const [recipeHistory, setRecipeHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [view, setView] = useState<'trends' | 'timeline'>('trends');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [trendRes, meRes] = await Promise.all([
        fetch('/api/menu-engineering/history?limit=50'),
        fetch('/api/menu-engineering?period=30'),
      ]);

      if (trendRes.ok) {
        const data = await trendRes.json();
        setTrends(data.trends || []);
      }
      if (meRes.ok) {
        const data = await meRes.json();
        setRecipes((data.recipes || []).map((r: any) => ({ id: r.id, name: r.name, code: r.code })));
      }
    } catch {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipeHistory = async (recipeId: string) => {
    if (recipeId === 'all') {
      setRecipeHistory([]);
      return;
    }
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/menu-engineering/history?recipeId=${recipeId}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setRecipeHistory(data.snapshots || []);
      }
    } catch {
      toast.error('Erro ao carregar histórico');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (selectedRecipe !== 'all') {
      fetchRecipeHistory(selectedRecipe);
    } else {
      setRecipeHistory([]);
    }
  }, [selectedRecipe]);

  const isPositiveChange = (from: string, to: string) => {
    const rank: Record<string, number> = { STAR: 4, PUZZLE: 3, HORSE: 2, DOG: 1 };
    return (rank[to] || 0) > (rank[from] || 0);
  };

  // Group snapshots by classification over time for summary
  const classDistribution = useMemo(() => {
    if (recipes.length === 0) return null;
    // Current from menu engineering
    return null; // We'll use the recipes data from current state
  }, [recipes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="w-6 h-6 text-primary" />
              Análise Temporal do Cardápio
            </h1>
            <p className="text-muted-foreground text-sm">Evolução das classificações ao longo do tempo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === 'trends' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('trends')}
          >
            <TrendingUp className="w-4 h-4 mr-1" /> Mudanças
          </Button>
          <Button
            variant={view === 'timeline' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('timeline')}
          >
            <Calendar className="w-4 h-4 mr-1" /> Histórico
          </Button>
        </div>
      </div>

      {/* Trend Changes View */}
      {view === 'trends' && (
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Migrações de Classe Recentes
            </h2>
            {trends.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma migração detectada ainda</p>
                <p className="text-xs mt-1">Crie snapshots periódicos em Engenharia de Cardápio para rastrear mudanças</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trends.map((trend, i) => {
                  const positive = isPositiveChange(trend.from, trend.to);
                  const fromCfg = CLASS_CONFIG[trend.from] || CLASS_CONFIG['DOG'];
                  const toCfg = CLASS_CONFIG[trend.to] || CLASS_CONFIG['DOG'];
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                      <div className={`p-2 rounded-lg ${positive ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
                        {positive ? (
                          <TrendingUp className="w-5 h-5 text-green-600" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-red-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{trend.recipeName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${fromCfg.bg} ${fromCfg.textColor}`}>
                            {fromCfg.emoji} {fromCfg.label}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span className={`text-xs px-2 py-0.5 rounded-full ${toCfg.bg} ${toCfg.textColor}`}>
                            {toCfg.emoji} {toCfg.label}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-medium ${trend.marginChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Margem: {trend.marginChange >= 0 ? '+' : ''}{trend.marginChange.toFixed(1)}pp
                        </p>
                        <p className={`text-xs ${trend.quantityChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Qtd: {trend.quantityChange >= 0 ? '+' : ''}{trend.quantityChange}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(trend.changedAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Timeline / History View */}
      {view === 'timeline' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Histórico por Receita
              </h2>
              <Select value={selectedRecipe} onValueChange={setSelectedRecipe}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Selecione uma receita" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as receitas</SelectItem>
                  {recipes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRecipe === 'all' ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Selecione uma receita para ver o histórico de classificações</p>
              </div>
            ) : loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : recipeHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Nenhum snapshot encontrado para esta receita</p>
              </div>
            ) : (
              <div className="space-y-1">
                {/* Timeline */}
                <div className="relative">
                  {recipeHistory.map((snap, i) => {
                    const cfg = CLASS_CONFIG[snap.classification] || CLASS_CONFIG['DOG'];
                    const prevSnap = i > 0 ? recipeHistory[i - 1] : null;
                    const changed = prevSnap && prevSnap.classification !== snap.classification;
                    return (
                      <div key={snap.id || i} className="flex items-start gap-3 pb-4">
                        {/* Timeline dot */}
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full mt-1.5 ${changed ? 'ring-2 ring-primary ring-offset-2' : ''} ${
                            snap.classification === 'STAR' ? 'bg-amber-500' :
                            snap.classification === 'HORSE' ? 'bg-blue-500' :
                            snap.classification === 'PUZZLE' ? 'bg-purple-500' :
                            'bg-red-500'
                          }`} />
                          {i < recipeHistory.length - 1 && (
                            <div className="w-0.5 h-full bg-border min-h-[20px]" />
                          )}
                        </div>
                        <div className={`flex-1 rounded-lg p-3 ${changed ? 'border-2 border-primary/30 bg-primary/5' : 'border bg-card'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.textColor} font-medium`}>
                                {cfg.emoji} {cfg.label}
                              </span>
                              {changed && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                  MUDOU!
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(snap.periodEnd).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            <span>Qtd: <strong className="text-foreground">{snap.quantitySold}</strong></span>
                            <span>Margem: <strong className="text-foreground">{snap.profitMargin?.toFixed(1)}%</strong></span>
                            <span>Food Cost: <strong className="text-foreground">{snap.foodCostPercent?.toFixed(1)}%</strong></span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
