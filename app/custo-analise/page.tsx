'use client';

import { useState, useEffect, Suspense, lazy } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layouts/page-header';
import { BackButton } from '@/components/ui/back-button';
import { CostFilters } from '@/components/cost-analysis/cost-filters';
import { IngredientCostTable } from '@/components/cost-analysis/ingredient-cost-table';
import { PriceTrendChart } from '@/components/cost-analysis/price-trend-chart';
import { SupplierComparison } from '@/components/cost-analysis/supplier-comparison';
import { RecipeCostTable } from '@/components/cost-analysis/recipe-cost-table';
import { GlassCard } from '@/components/ui/glass-card';
import { GradientSection } from '@/components/ui/gradient-section';
import { Sparkline } from '@/components/ui/sparkline';
import { FadeIn } from '@/components/ui/animate';
import { LoadingFallback } from '@/components/ui/loading-fallback';
import { toast } from 'sonner';
import { TrendingUp, DollarSign, AlertCircle } from 'lucide-react';

const PriceAlertManager = lazy(() =>
  import('@/components/cost-analysis/price-alert-manager').then((mod) => ({
    default: mod.PriceAlertManager,
  }))
);

export default function CostAnalysisPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();

  // Data states
  const [ingredientSummary, setIngredientSummary] = useState<any>(null);
  const [selectedIngredient, setSelectedIngredient] = useState<string>('');
  const [priceTrends, setPriceTrends] = useState<any>(null);
  const [supplierComparison, setSupplierComparison] = useState<any>(null);
  const [recipeCosts, setRecipeCosts] = useState<any>(null);

  // Loading states
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(false);

  // Filter states
  const [filters, setFilters] = useState({
    days: 30,
    ingredientIds: [],
    supplierIds: [],
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // Initial data load (must be before early returns to respect React hooks rules)
  useEffect(() => {
    if (session) {
      fetchIngredientSummary(filters);
      fetchRecipeCosts(filters.days);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  // Fetch ingredient cost summary
  const fetchIngredientSummary = async (filterParams: any) => {
    setLoadingSummary(true);
    try {
      const params = new URLSearchParams();
      params.append('days', filterParams.days.toString());
      if (filterParams.ingredientIds?.length > 0) {
        params.append('ingredientIds', filterParams.ingredientIds.join(','));
      }
      if (filterParams.supplierIds?.length > 0) {
        params.append('supplierIds', filterParams.supplierIds.join(','));
      }

      const res = await fetch(`/api/cost-analysis/ingredient-summary?${params}`);
      if (res.ok) {
        const data = await res.json();
        setIngredientSummary(data);
      } else {
        toast.error('Erro ao carregar resumo de custos');
      }
    } catch (error) {
      console.error('Error fetching ingredient summary:', error);
      toast.error('Erro ao carregar resumo de custos');
    } finally {
      setLoadingSummary(false);
    }
  };

  // Fetch price trends for selected ingredient
  const fetchPriceTrends = async (ingredientId: string, days: number) => {
    setLoadingTrends(true);
    try {
      const res = await fetch(
        `/api/cost-analysis/ingredient-trends?ingredientId=${ingredientId}&days=${days}`
      );
      if (res.ok) {
        const data = await res.json();
        setPriceTrends(data);
      } else {
        toast.error('Erro ao carregar tendências de preço');
      }
    } catch (error) {
      console.error('Error fetching price trends:', error);
      toast.error('Erro ao carregar tendências de preço');
    } finally {
      setLoadingTrends(false);
    }
  };

  // Fetch supplier comparison for selected ingredient
  const fetchSupplierComparison = async (ingredientId: string, days: number) => {
    setLoadingSuppliers(true);
    try {
      const res = await fetch(
        `/api/cost-analysis/supplier-comparison?ingredientId=${ingredientId}&days=${days}`
      );
      if (res.ok) {
        const data = await res.json();
        setSupplierComparison(data);
      } else {
        toast.error('Erro ao carregar comparação de fornecedores');
      }
    } catch (error) {
      console.error('Error fetching supplier comparison:', error);
      toast.error('Erro ao carregar comparação de fornecedores');
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // Fetch recipe costs
  const fetchRecipeCosts = async (days: number) => {
    setLoadingRecipes(true);
    try {
      const res = await fetch(`/api/cost-analysis/recipe-costs?days=${days}`);
      if (res.ok) {
        const data = await res.json();
        setRecipeCosts(data);
      } else {
        toast.error('Erro ao carregar custos de receitas');
      }
    } catch (error) {
      console.error('Error fetching recipe costs:', error);
      toast.error('Erro ao carregar custos de receitas');
    } finally {
      setLoadingRecipes(false);
    }
  };

  // Handle filter changes
  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
    fetchIngredientSummary(newFilters);
    fetchRecipeCosts(newFilters.days);
  };

  // Handle ingredient selection
  const handleSelectIngredient = (ingredientId: string) => {
    setSelectedIngredient(ingredientId);
    fetchPriceTrends(ingredientId, filters.days);
    fetchSupplierComparison(ingredientId, filters.days);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-950 dark:to-slate-900/30">
      <PageHeader
        title="Análise de Custos"
        description="Acompanhe tendências de preços, custos de ingredientes e receitas"
        actions={<BackButton href="/dashboard" label="Voltar" />}
      />

      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-8">
        {/* Filters */}
        <FadeIn delay={0}>
          <CostFilters onFiltersChange={handleFiltersChange} />
        </FadeIn>

        {/* Tabs */}
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="flex w-full overflow-x-auto lg:w-auto lg:inline-flex">
            <TabsTrigger value="summary">Resumo</TabsTrigger>
            <TabsTrigger value="trends">Tendências</TabsTrigger>
            <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
            <TabsTrigger value="recipes">Receitas</TabsTrigger>
            <TabsTrigger value="alerts">Alertas</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-6">
            {ingredientSummary && (
              <>
                {/* Summary Stats with GlassCard and Sparklines */}
                <FadeIn delay={0.1}>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <GlassCard>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Insumos Analisados
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-end justify-between">
                          <div className="text-2xl font-bold">
                            {ingredientSummary.count}
                          </div>
                          <Sparkline
                            data={Array.from(
                              { length: 7 },
                              () => ({ value: Math.random() * 100 })
                            )}
                            className="w-16 h-8"
                          />
                        </div>
                      </CardContent>
                    </GlassCard>

                    <GlassCard>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Período
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-end justify-between">
                          <div className="text-2xl font-bold">
                            {ingredientSummary.period?.days}d
                          </div>
                          <Sparkline
                            data={Array.from(
                              { length: 7 },
                              () => ({ value: Math.random() * 100 })
                            )}
                            className="w-16 h-8"
                          />
                        </div>
                      </CardContent>
                    </GlassCard>

                    <GlassCard>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Preço Médio
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-end justify-between">
                          <div className="text-2xl font-bold text-emerald-600">
                            {ingredientSummary.data &&
                            ingredientSummary.data.length > 0
                              ? `R$ ${(
                                  ingredientSummary.data.reduce(
                                    (sum: number, item: any) =>
                                      sum + item.avgPrice,
                                    0
                                  ) / ingredientSummary.data.length
                                ).toFixed(2)}`
                              : 'R$ 0,00'}
                          </div>
                          <Sparkline
                            data={Array.from(
                              { length: 7 },
                              () => ({ value: Math.random() * 100 })
                            )}
                            className="w-16 h-8"
                          />
                        </div>
                      </CardContent>
                    </GlassCard>

                    <GlassCard>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Alertas Ativos
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-end justify-between">
                          <div className="text-2xl font-bold text-red-600">
                            {ingredientSummary.data?.filter(
                              (item: any) => item.priceAboveMax
                            ).length || 0}
                          </div>
                          <AlertCircle className="h-5 w-5 text-red-600/50" />
                        </div>
                      </CardContent>
                    </GlassCard>
                  </div>
                </FadeIn>

                {/* Ingredient Cost Table */}
                <FadeIn delay={0.2}>
                  <GradientSection variant="success">
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-white">Custos de Insumos</h3>
                      <IngredientCostTable
                        data={ingredientSummary.data}
                        loading={loadingSummary}
                      />
                    </div>
                  </GradientSection>
                </FadeIn>
              </>
            )}
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-6">
            <FadeIn delay={0.1}>
              {selectedIngredient ? (
                <GradientSection variant="success">
                  <PriceTrendChart data={priceTrends} loading={loadingTrends} />
                </GradientSection>
              ) : (
                <GlassCard>
                  <CardHeader>
                    <CardTitle>Tendência de Preço</CardTitle>
                  </CardHeader>
                  <CardContent className="h-80 flex items-center justify-center text-muted-foreground">
                    {ingredientSummary?.data && ingredientSummary.data.length > 0 ? (
                      <div className="text-center">
                        <p className="mb-4">Selecione um insumo na tabela acima</p>
                        <div className="space-y-2">
                          {ingredientSummary.data.slice(0, 5).map((item: any) => (
                            <button
                              key={item.ingredientId}
                              onClick={() =>
                                handleSelectIngredient(item.ingredientId)
                              }
                              className="block w-full text-left p-2 hover:bg-muted rounded-lg transition-colors text-sm"
                            >
                              {item.name} ({item.code})
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p>Carregue dados primeiro</p>
                    )}
                  </CardContent>
                </GlassCard>
              )}
            </FadeIn>
          </TabsContent>

          {/* Suppliers Tab */}
          <TabsContent value="suppliers" className="space-y-6">
            <FadeIn delay={0.1}>
              {selectedIngredient ? (
                <GradientSection variant="success">
                  <SupplierComparison
                    data={supplierComparison}
                    loading={loadingSuppliers}
                  />
                </GradientSection>
              ) : (
                <GlassCard>
                  <CardHeader>
                    <CardTitle>Comparação de Fornecedores</CardTitle>
                  </CardHeader>
                  <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
                    {ingredientSummary?.data && ingredientSummary.data.length > 0 ? (
                      <div className="text-center">
                        <p className="mb-4">Selecione um insumo na tabela acima</p>
                        <div className="space-y-2">
                          {ingredientSummary.data.slice(0, 5).map((item: any) => (
                            <button
                              key={item.ingredientId}
                              onClick={() =>
                                handleSelectIngredient(item.ingredientId)
                              }
                              className="block w-full text-left p-2 hover:bg-muted rounded-lg transition-colors text-sm"
                            >
                              {item.name} ({item.code})
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p>Carregue dados primeiro</p>
                    )}
                  </CardContent>
                </GlassCard>
              )}
            </FadeIn>
          </TabsContent>

          {/* Recipes Tab */}
          <TabsContent value="recipes" className="space-y-6">
            <FadeIn delay={0.1}>
              <GradientSection variant="success">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Custos de Receitas</h3>
                  <RecipeCostTable
                    data={recipeCosts?.data || []}
                    loading={loadingRecipes}
                  />
                </div>
              </GradientSection>
            </FadeIn>
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="space-y-6">
            <FadeIn delay={0.1}>
              <Suspense fallback={<LoadingFallback message="Carregando gerenciador de alertas..." />}>
                <PriceAlertManager />
              </Suspense>
            </FadeIn>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
