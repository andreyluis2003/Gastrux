'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Search, Loader2, ChevronDown, Download } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface AuditLog {
  id: string;
  userId: string;
  user?: {
    name: string;
    email: string;
    role: string;
  };
  action: string;
  entityType: string;
  entityId: string;
  changesBefore?: Record<string, any>;
  changesAfter?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

interface PaginationData {
  total: number;
  pages: number;
  currentPage: number;
}

interface AuditLogsTableProps {
  onRefresh?: () => void;
}

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  READ: 'bg-gray-100 text-gray-800',
  LOGIN: 'bg-purple-100 text-purple-800',
  LOGOUT: 'bg-orange-100 text-orange-800',
  EXPORT: 'bg-cyan-100 text-cyan-800',
};

export function AuditLogsTable({ onRefresh }: AuditLogsTableProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string>('all');
  const [entityType, setEntityType] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    pages: 0,
    currentPage: 1,
  });
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableEntities, setAvailableEntities] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '15');
      if (search) params.append('search', search);
      if (action !== 'all') params.append('action', action);
      if (entityType !== 'all') params.append('entityType', entityType);

      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      if (!response.ok) throw new Error('Erro ao carregar logs');

      const data = await response.json();
      setLogs(data.logs || []);
      setPagination({
        total: data.pagination?.total || 0,
        pages: data.pagination?.pages || 0,
        currentPage: page,
      });

      // Extrair ações e tipos únicos
      if (page === 1) {
        const actions = new Set<string>();
        const entities = new Set<string>();
        data.logs?.forEach((log: AuditLog) => {
          actions.add(log.action);
          entities.add(log.entityType);
        });
        setAvailableActions(Array.from(actions).sort());
        setAvailableEntities(Array.from(entities).sort());
      }
    } catch (error) {
      console.error('Erro ao buscar logs:', error);
      toast.error('Erro ao carregar logs de auditoria');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/admin/audit-logs/export?format=csv');
      if (!response.ok) throw new Error('Erro ao exportar');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-auditoria-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Logs exportados com sucesso');
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao exportar logs');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [search, action, entityType]);

  const getActionColor = (action: string): string => {
    const baseAction = action.split('_')[0];
    return actionColors[baseAction] || 'bg-gray-100 text-gray-800';
  };

  const formatAction = (action: string): string => {
    return action.replace(/_/g, ' ').toLowerCase();
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por usuário ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={action} onValueChange={setAction}>
          <SelectTrigger>
            <SelectValue placeholder="Filtrar por ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {availableActions.map((act) => (
              <SelectItem key={act} value={act}>
                {formatAction(act)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger>
            <SelectValue placeholder="Filtrar por entidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as entidades</SelectItem>
            {availableEntities.map((entity) => (
              <SelectItem key={entity} value={entity}>
                {entity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={handleExport}
          disabled={exporting || logs.length === 0}
          variant="outline"
          className="w-full sm:w-auto"
        >
          {exporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Exportando...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </>
          )}
        </Button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Data/Hora</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Usuário</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Ação</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Entidade</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">ID</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nenhum log encontrado
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{log.user?.name}</div>
                        <div className="text-xs text-gray-500">{log.user?.email}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('text-xs', getActionColor(log.action))}>
                        {formatAction(log.action)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <Badge variant="outline" className="text-xs">
                        {log.entityType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs font-mono">
                      {log.entityId.substring(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Dialog open={selectedLog?.id === log.id && detailsOpen} onOpenChange={(open) => {
                        if (open) {
                          setSelectedLog(log);
                          setDetailsOpen(true);
                        } else {
                          setDetailsOpen(false);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              setSelectedLog(log);
                              setDetailsOpen(true);
                            }}
                          >
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Ver
                          </Button>
                        </DialogTrigger>
                        {selectedLog?.id === log.id && (
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Detalhes do Log</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              {/* Informações Básicas */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm font-medium text-gray-700">Data/Hora</p>
                                  <p className="text-sm text-gray-900">{formatDateTime(log.createdAt)}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-700">Usuário</p>
                                  <p className="text-sm text-gray-900">{log.user?.name}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-700">Ação</p>
                                  <p className="text-sm text-gray-900">{formatAction(log.action)}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-700">Entidade</p>
                                  <p className="text-sm text-gray-900">{log.entityType}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-700">ID da Entidade</p>
                                  <p className="text-sm font-mono text-gray-900">{log.entityId}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-700">Email do Usuário</p>
                                  <p className="text-sm text-gray-900">{log.user?.email}</p>
                                </div>
                              </div>

                              {/* IP e User Agent */}
                              {log.ipAddress && (
                                <div>
                                  <p className="text-sm font-medium text-gray-700 mb-1">Endereço IP</p>
                                  <p className="text-sm font-mono text-gray-900 bg-gray-50 p-2 rounded">
                                    {log.ipAddress}
                                  </p>
                                </div>
                              )}

                              {log.userAgent && (
                                <div>
                                  <p className="text-sm font-medium text-gray-700 mb-1">User Agent</p>
                                  <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded break-words">
                                    {log.userAgent}
                                  </p>
                                </div>
                              )}

                              {/* Mudanças */}
                              {(log.changesBefore || log.changesAfter) && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                                  {log.changesBefore && (
                                    <div>
                                      <p className="text-sm font-medium text-gray-700 mb-2">Antes</p>
                                      <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48 text-gray-900">
                                        {JSON.stringify(log.changesBefore, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  {log.changesAfter && (
                                    <div>
                                      <p className="text-sm font-medium text-gray-700 mb-2">Depois</p>
                                      <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48 text-gray-900">
                                        {JSON.stringify(log.changesAfter, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        )}
                      </Dialog>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => (
            <Button
              key={page}
              variant={pagination.currentPage === page ? 'default' : 'outline'}
              size="sm"
              onClick={() => fetchLogs(page)}
              disabled={loading}
            >
              {page}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
