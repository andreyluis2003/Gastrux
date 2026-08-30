// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Button, Card, BackButton, LoadingSkeleton } from '@/components/ui';
import { TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatQuantity } from '@/lib/formatters';

interface DemandForecast {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  forecastDate: string;
  dayOfWeek: number;
  predictedQuantity: number;
  confidenceScore: number;
  seasonality: number;
  modelAccuracy: number;
}

interface ForecastSummary {
  totalIngredients: number;
  averageConfidence: number;
  forecastDays: number;
  lastUpdated: string;
}

export default function PrevisoesDemandaPage() {
  const [forecasts, setForecasts] = useState<DemandForecast[]>([]);
  const [summary, setSummary] = useState<ForecastSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIngredient, setSelectedIngredient] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'confidence' | 'quantity'>('confidence');

  useEffect(() => {
    fetchForecasts();
  }, []);

  const fetchForecasts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/demand-forecast?minConfidence=0&days=14');
      const data = await response.json();
      
      if (data.forecasts) {
        setForecasts(data.forecasts);
      }
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Erro ao carregar previsões:', error);
      toast.error('Erro ao carregar previsões de demanda');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-blue-600 bg-blue-50';
    return 'text-yellow-600 bg-yellow-50';
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.8) return <CheckCircle2 className="w-4 h-4" />;
    if (confidence >= 0.6) return <TrendingUp className="w-4 h-4" />;
    return <AlertTriangle className="w-4 h-4" />;
  };

  const getDayName = (dayOfWeek: number) => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    return days[dayOfWeek] || 'Desconhecido';
  };

  const uniqueIngredients = Array.from(new Set(forecasts.map(f => f.ingredientName)));
  const ingredientForecasts = selectedIngredient
    ? forecasts.filter(f => f.ingredientName === selectedIngredient)
    : forecasts;

  const sortedForecasts = ingredientForecasts.sort((a, b) => {
    if (sortBy === 'confidence') {
      return b.confidenceScore - a.confidenceScore;
    }
    return b.predictedQuantity - a.predictedQuantity;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4 sm:space-y-6 sm:p-6">
      <div>
        <BackButton />
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mt-2">Previsões de Demanda</h1>
        <p className="text-sm text-gray-600 mt-1">Predições de consumo dos próximos 14 dias (ML)</p>
      </div>

      {/* Summary */}
      {summary && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div>
              <p className="text-sm text-gray-600">Ingredientes Monitorados</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{summary.totalIngredients}</h3>
            </div>
          </Card>

          <Card className="p-4">
            <div>
              <p className="text-sm text-gray-600">Confiança Média</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {(summary.averageConfidence * 100).toFixed(0)}%
              </h3>
            </div>
          </Card>

          <Card className="p-4">
            <div>
              <p className="text-sm text-gray-600">Dias Previstos</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{summary.forecastDays}</h3>
            </div>
          </Card>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {!loading && (
        <>
          {/* Filters */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">Filtrar por Ingrediente</p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedIngredient === null ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedIngredient(null)}
                >
                  Todos ({uniqueIngredients.length})
                </Button>
                {uniqueIngredients.slice(0, 8).map(ing => (
                  <Button
                    key={ing}
                    variant={selectedIngredient === ing ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedIngredient(ing)}
                  >
                    {ing}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">Ordenar por</p>
              <div className="flex gap-2">
                <Button
                  variant={sortBy === 'confidence' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSortBy('confidence')}
                >
                  Confiança
                </Button>
                <Button
                  variant={sortBy === 'quantity' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSortBy('quantity')}
                >
                  Quantidade
                </Button>
              </div>
            </div>
          </div>

          {/* Forecasts Grid */}
          {sortedForecasts.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-gray-500 text-lg">Nenhuma previsão disponível</p>
              <p className="text-gray-400 text-sm mt-2">As previsões serão geradas após análise do histórico</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedForecasts.map(forecast => (
                <Card key={forecast.id} className="p-4 hover:shadow-lg transition">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 truncate">{forecast.ingredientName}</h3>
                      <p className="text-sm text-gray-600">{new Date(forecast.forecastDate).toLocaleDateString('pt-BR')} ({getDayName(forecast.dayOfWeek)})</p>
                    </div>

                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm text-gray-600">Quantidade Prevista</p>
                      <p className="text-lg font-bold text-gray-900 mt-1">
                        {formatQuantity(forecast.predictedQuantity, forecast.unit)}
                      </p>
                    </div>

                    <div className={`p-2 rounded flex items-center gap-2 ${getConfidenceColor(forecast.confidenceScore)}`}>
                      {getConfidenceIcon(forecast.confidenceScore)}
                      <div>
                        <p className="text-xs font-medium">Confiança</p>
                        <p className="text-sm font-bold">{(forecast.confidenceScore * 100).toFixed(0)}%</p>
                      </div>
                    </div>

                    {forecast.seasonality !== 0 && (
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Sazonalidade:</span> {forecast.seasonality > 0 ? '+' : ''}{forecast.seasonality.toFixed(2)}
                      </div>
                    )}

                    <div className="text-xs text-gray-500 pt-2 border-t">
                      Acurácia do modelo: {(forecast.modelAccuracy * 100).toFixed(1)}%
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
