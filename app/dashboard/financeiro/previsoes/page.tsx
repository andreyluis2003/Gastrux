'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Plus, TrendingUp, Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Forecast {
  id: string;
  forecastType: string;
  startDate: string;
  endDate: string;
  forecastedValue: number;
  confidence: number;
  method: string;
  actualValue?: number;
  variance?: number;
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('pt-BR');
};

export default function ForecastsPage() {
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [selectedType, setSelectedType] = useState('revenue');
  const [method, setMethod] = useState('trend_analysis');

  useEffect(() => {
    fetchForecasts();
  }, []);

  const fetchForecasts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/financial/forecasts');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setForecasts(data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar previsões');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateForecast = async () => {
    try {
      setCalculating(true);
      const res = await fetch('/api/financial/calculate-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          days: 30,
          method,
        }),
      });

      if (!res.ok) throw new Error('Failed to calculate');
      const result = await res.json();
      setForecasts([result.forecast, ...forecasts]);
      toast.success('Previsão calculada com sucesso');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao calcular previsão');
    } finally {
      setCalculating(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return 'text-green-600 bg-green-50';
    if (confidence >= 0.75) return 'text-blue-600 bg-blue-50';
    return 'text-orange-600 bg-orange-50';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.85) return 'Alta';
    if (confidence >= 0.75) return 'Média';
    return 'Baixa';
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Previsões Financeiras</h1>
            <p className="text-sm text-gray-600 mt-1">Tendências futuras com base em dados históricos</p>
          </div>
        </div>
      </div>

      {/* Calculate Forecast Card */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-purple-600" />
          Calcular Nova Previsão
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Tipo de Previsão</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
            >
              <option value="revenue">Receita</option>
              <option value="orders">Pedidos</option>
              <option value="cash_flow">Fluxo de Caixa</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Método de Cálculo</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
            >
              <option value="simple_average">Média Simples</option>
              <option value="weighted_average">Média Ponderada</option>
              <option value="trend_analysis">Análise de Tendência</option>
            </select>
          </div>

          <div className="flex items-end">
            <Button
              onClick={handleCalculateForecast}
              disabled={calculating}
              className="w-full"
            >
              {calculating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Calculando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Calcular
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Forecasts List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Previsões Recentes</h2>
        {loading ? (
          <div className="text-center text-gray-500 py-8">Carregando...</div>
        ) : forecasts.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhuma previsão disponível</p>
            <p className="text-sm mt-1">Calcule uma nova previsão acima</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {forecasts.map((forecast) => (
              <Card key={forecast.id} className="p-4 hover:shadow-md transition">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {/* Type and Dates */}
                  <div>
                    <p className="text-sm text-gray-600">Tipo</p>
                    <p className="font-semibold capitalize mt-1">
                      {forecast.forecastType === 'revenue' && 'Receita'}
                      {forecast.forecastType === 'orders' && 'Pedidos'}
                      {forecast.forecastType === 'cash_flow' && 'Fluxo de Caixa'}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      {formatDate(forecast.startDate)} até{' '}
                      {formatDate(forecast.endDate)}
                    </p>
                  </div>

                  {/* Forecasted Value */}
                  <div>
                    <p className="text-sm text-gray-600">Valor Previsto</p>
                    {forecast.forecastType === 'orders' ? (
                      <p className="text-xl font-bold text-blue-600 mt-1">
                        {Math.round(forecast.forecastedValue)}
                      </p>
                    ) : (
                      <p className="text-xl font-bold text-blue-600 mt-1">
                        {formatBRL(forecast.forecastedValue)}
                      </p>
                    )}
                  </div>

                  {/* Actual Value */}
                  <div>
                    <p className="text-sm text-gray-600">Valor Real</p>
                    {forecast.actualValue !== undefined ? (
                      <>
                        {forecast.forecastType === 'orders' ? (
                          <p className="text-xl font-bold text-green-600 mt-1">
                            {Math.round(forecast.actualValue)}
                          </p>
                        ) : (
                          <p className="text-xl font-bold text-green-600 mt-1">
                            {formatBRL(forecast.actualValue)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-400 mt-1">Aguardando...</p>
                    )}
                  </div>

                  {/* Confidence */}
                  <div>
                    <p className="text-sm text-gray-600">Confiança</p>
                    <div
                      className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mt-1 ${
                        getConfidenceColor(forecast.confidence || 0)
                      }`}
                    >
                      {getConfidenceLabel(forecast.confidence || 0)}
                      <span className="ml-1">
                        {((forecast.confidence || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Method */}
                  <div>
                    <p className="text-sm text-gray-600">Método</p>
                    <p className="text-sm font-medium mt-1 capitalize">
                      {forecast.method === 'simple_average' && 'Média Simples'}
                      {forecast.method === 'weighted_average' &&
                        'Média Ponderada'}
                      {forecast.method === 'trend_analysis' &&
                        'Análise de Tendência'}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
