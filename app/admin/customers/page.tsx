'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import Link from 'next/link';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Building2, ExternalLink } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  cnpj: string | null;
  status: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  billingCycleEnd: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
}

const statusVariantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ACTIVE: 'default',
  TRIAL: 'secondary',
  SUSPENDED: 'destructive',
  CANCELLED: 'destructive',
  ARCHIVED: 'outline',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

export default function CustomersPortalPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [tier, setTier] = useState<string>('all');
  const [subStatus, setSubStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
      });
      if (search) params.set('search', search);
      if (status !== 'all') params.set('status', status);
      if (tier !== 'all') params.set('tier', tier);
      if (subStatus !== 'all') params.set('subscriptionStatus', subStatus);

      const res = await fetch(`/api/admin/customers?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCustomers(data.customers || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.totalCount || 0);
    } catch (err: any) {
      toast.error(`Erro ao listar clientes: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, tier, subStatus]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight">
            Clientes da Plataforma
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie restaurantes, assinaturas e status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/platform">
            <Button variant="outline" className="gap-2">
              Platform Dashboard
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
          <Button onClick={fetchCustomers} className="gap-2">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <form onSubmit={onSearch} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nome, email, CNPJ ou ID"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="ACTIVE">Ativos</SelectItem>
                <SelectItem value="TRIAL">Trial</SelectItem>
                <SelectItem value="SUSPENDED">Suspensos</SelectItem>
                <SelectItem value="CANCELLED">Cancelados</SelectItem>
                <SelectItem value="ARCHIVED">Arquivados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tier} onValueChange={(v) => { setTier(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos planos</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <Select value={subStatus} onValueChange={(v) => { setSubStatus(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Assinatura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas assinaturas</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="trialing">Em trial</SelectItem>
                <SelectItem value="past_due">Em atraso</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" className="md:col-span-5">Buscar</Button>
          </form>
        </CardContent>
      </Card>

      {/* Summary */}
      <p className="text-sm text-muted-foreground">
        {loading ? 'Carregando…' : `${totalCount} cliente(s) encontrado(s)`}
      </p>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          {loading && customers.length === 0 ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Nenhum cliente encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 text-left pr-4">Restaurante</th>
                    <th className="py-2 text-left pr-4">Status</th>
                    <th className="py-2 text-left pr-4">Plano</th>
                    <th className="py-2 text-left pr-4">Assinatura</th>
                    <th className="py-2 text-left pr-4">Trial até</th>
                    <th className="py-2 text-left pr-4">Criado</th>
                    <th className="py-2 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-b last:border-b-0 hover:bg-slate-50">
                      <td className="py-2 pr-4">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.email || '—'} {c.city && c.state ? ` · ${c.city}/${c.state}` : ''}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={statusVariantMap[c.status] || 'outline'}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline">{c.subscriptionTier}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <span className="text-xs">{c.subscriptionStatus}</span>
                      </td>
                      <td className="py-2 pr-4 text-xs">{formatDate(c.trialEndsAt)}</td>
                      <td className="py-2 pr-4 text-xs">{formatDate(c.createdAt)}</td>
                      <td className="py-2 text-right">
                        <Link href={`/admin/customers/${c.id}`}>
                          <Button size="sm" variant="outline">
                            Detalhes
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="gap-1"
          >
            Próxima <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
