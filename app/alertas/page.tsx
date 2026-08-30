'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/formatters';
import { BackButton } from '@/components/ui/back-button';

export default function AlertasPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, []);

  async function fetchAlerts() {
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) throw new Error('Erro ao buscar alertas');
      const data = await res.json();
      setAlerts(data);
    } catch (error) {
      toast.error('Erro ao carregar alertas');
    } finally {
      setLoading(false);
    }
  }

  async function dismissAlert(id: string) {
    try {
      const res = await fetch(`/api/alerts/${id}/dismiss`, { method: 'POST' });
      if (!res.ok) throw new Error('Erro ao descartar alerta');
      setAlerts(alerts.filter(a => a.id !== id));
      toast.success('Alerta descartado');
    } catch (error) {
      toast.error('Erro ao descartar alerta');
    }
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center gap-4">
        <BackButton href="/dashboard" label="Voltar" />
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Alertas</h1>
          <p className="text-slate-600 dark:text-slate-400">Monitorar alertas do sistema</p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-slate-600">Carregando...</p>
        </div>
      ) : alerts.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center">
          <AlertCircle className="mb-2 h-8 w-8 text-slate-400" />
          <p className="text-slate-600">Nenhum alerta ativo</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={`border-l-4 p-4 ${
                alert.severity === 'CRITICAL' ? 'border-l-red-500 bg-red-50' :
                alert.severity === 'HIGH' ? 'border-l-orange-500 bg-orange-50' :
                alert.severity === 'MEDIUM' ? 'border-l-yellow-500 bg-yellow-50' :
                'border-l-blue-500 bg-blue-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{alert.title}</h3>
                  <p className="text-sm text-slate-700 mt-1">{alert.message}</p>
                  <p className="text-xs text-slate-600 mt-1">{formatDate(alert.createdAt)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissAlert(alert.id)}
                >
                  Descartar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
