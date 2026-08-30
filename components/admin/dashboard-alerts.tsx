'use client';

import React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Alert {
  id: string;
  type: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details?: any;
  createdAt: string;
}

interface DashboardAlertsProps {
  alerts: Alert[];
  loading?: boolean;
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'CRITICAL':
      return <AlertTriangle className="w-5 h-5" />;
    case 'HIGH':
      return <AlertCircle className="w-5 h-5" />;
    case 'MEDIUM':
      return <AlertCircle className="w-5 h-5" />;
    default:
      return <Info className="w-5 h-5" />;
  }
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-red-50 border-red-200 text-red-800';
    case 'HIGH':
      return 'bg-orange-50 border-orange-200 text-orange-800';
    case 'MEDIUM':
      return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    default:
      return 'bg-blue-50 border-blue-200 text-blue-800';
  }
};

export function DashboardAlerts({ alerts, loading }: DashboardAlertsProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg border-2 border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Alertas do Sistema</h2>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border-2 border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Alertas do Sistema</h2>
        <span className="bg-red-500 text-white text-xs px-3 py-1 rounded-full font-medium">
          {alerts.length}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
          <p className="text-slate-600">Nenhum alerta ativo. Sistema operacional!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.slice(0, 5).map((alert) => (
            <div
              key={alert.id}
              className={cn(
                'p-4 rounded-lg border-2 flex items-start gap-3',
                getSeverityColor(alert.severity)
              )}
            >
              <div className="flex-shrink-0 mt-0.5">{getSeverityIcon(alert.severity)}</div>
              <div className="flex-1">
                <p className="font-medium text-sm">{alert.message}</p>
                {alert.details && (
                  <p className="text-xs mt-1 opacity-75">
                    {JSON.stringify(alert.details).substring(0, 100)}...
                  </p>
                )}
              </div>
              <p className="text-xs opacity-50 flex-shrink-0">
                {new Date(alert.createdAt).toLocaleTimeString('pt-BR')}
              </p>
            </div>
          ))}
          {alerts.length > 5 && (
            <button className="w-full p-2 text-center text-blue-600 hover:bg-blue-50 rounded text-sm font-medium">
              Ver todos os {alerts.length} alertas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
