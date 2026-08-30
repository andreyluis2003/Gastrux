'use client';

import React from 'react';
import { formatDate } from '@/lib/formatters';
import { getActionLabel } from '@/lib/admin-actions';

interface Log {
  id: string;
  user: {
    name: string | null;
    email: string;
    role: string;
  };
  action: string;
  entityType: string;
  entityName: string | null;
  createdAt: Date;
}

interface RecentLogsProps {
  logs: Log[];
  loading?: boolean;
}

export function RecentLogs({ logs, loading }: RecentLogsProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg border-2 border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Ações Recentes</h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border-2 border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Ações Recentes</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="text-left py-3 px-4 font-semibold text-slate-700">Usuário</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-700">Ação</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-700">Recurso</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-700">Data</th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 10).map((log) => (
              <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4">
                  <div>
                    <p className="font-medium text-slate-900">{log.user.name || log.user.email}</p>
                    <p className="text-xs text-slate-500">{log.user.role}</p>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                    {getActionLabel(log.action)}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div>
                    <p className="font-medium text-slate-900">{log.entityType}</p>
                    <p className="text-xs text-slate-500">{log.entityName}</p>
                  </div>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  {formatDate(log.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
