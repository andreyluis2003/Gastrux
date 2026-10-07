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
import { Search, RefreshCw, ChevronLeft, ChevronRight, Building2, AlertTriangle, Mail, MessageCircle } from 'lucide-react';
import { STAGES, whatsappLink, type ClientStage } from '@/lib/admin/client-health';
import type { ClientProfile } from '@/lib/admin/client-profile';

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
  profile: ClientProfile | null;
}

interface Funnel {
  total: number;
  byStage: Record<ClientStage, number>;
  needAttention: number;
  urgent: number;
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Ativo', TRIAL: 'Em teste', SUSPENDED: 'Suspenso', CANCELLED: 'Cancelado', ARCHIVED: 'Arquivado' };
const statusVariantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ACTIVE: 'default',
  TRIAL: 'secondary',
  SUSPENDED: 'destructive',
  CANCELLED: 'destructive',
  ARCHIVED: 'outline',
};
const STAGE_COLOR: Record<ClientStage, string> = {
  SIGNED_UP: 'bg-slate-100 text-slate-700',
  MENU_READY: 'bg-blue-100 text-blue-800',
  SELLING: 'bg-emerald-100 text-emerald-800',
  PAYING: 'bg-green-600 text-white',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

/** "hoje", "ontem", "há 5 dias", "nunca" */
function since(iso: string | null) {
  if (!iso) return 'nunca';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

export default function CustomersPortalPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [tier, setTier] = useState<string>('all');
  const [focus, setFocus] = useState<'all' | 'attention' | ClientStage>('all');
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
      if (focus === 'attention') params.set('focus', 'attention');
      else if (focus !== 'all') params.set('stage', focus);

      const res = await fetch(`/api/admin/customers?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCustomers(data.customers || []);
      setFunnel(data.funnel || null);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.totalCount || 0);
    } catch (err: any) {
      toast.error(`Erro ao listar clientes: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, tier, focus]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function pick(next: typeof focus) {
    setFocus((cur) => (cur === next ? 'all' : next));
    setPage(1);
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight">Clientes da Plataforma</h1>
          <p className="text-sm text-muted-foreground">Quem são, como chegaram, quanto usam e quem precisa de você hoje</p>
        </div>
        <Button onClick={fetchCustomers} className="gap-2">
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          <span>Atualizar</span>
        </Button>
      </div>

      {/* Funnel: click a step to list only those clients */}
      {funnel && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <button
            onClick={() => pick('attention')}
            className={`text-left rounded-lg border p-4 transition ${focus === 'attention' ? 'ring-2 ring-red-500' : ''} ${funnel.needAttention ? 'bg-red-50 border-red-200' : 'bg-white'}`}
          >
            <p className="text-xs text-red-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Precisam de atenção</p>
            <p className="text-2xl font-bold text-red-700">{funnel.needAttention}</p>
            <p className="text-xs text-red-700/80">{funnel.urgent} urgente{funnel.urgent === 1 ? '' : 's'}</p>
          </button>
          {STAGES.map((s) => (
            <button
              key={s.value}
              onClick={() => pick(s.value)}
              title={s.hint}
              className={`text-left rounded-lg border bg-white p-4 transition ${focus === s.value ? 'ring-2 ring-blue-500' : ''}`}
            >
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">{funnel.byStage[s.value]}</p>
              <p className="text-xs text-muted-foreground">
                {funnel.total ? Math.round((funnel.byStage[s.value] / funnel.total) * 100) : 0}% dos {funnel.total}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <form onSubmit={onSearch} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Restaurante, dono, e-mail ou CNPJ"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as situações</SelectItem>
                <SelectItem value="TRIAL">Em teste</SelectItem>
                <SelectItem value="ACTIVE">Ativos</SelectItem>
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
                <SelectItem value="all">Todos os planos</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {loading ? 'Carregando…' : `${totalCount} cliente(s)`}
        {focus !== 'all' && !loading && (
          <button className="ml-2 underline" onClick={() => pick(focus)}>mostrar todos</button>
        )}
      </p>

      {/* Clients */}
      {loading && customers.length === 0 ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground text-sm">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhum cliente encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {customers.map((c) => {
            const p = c.profile;
            const stage = p ? STAGES.find((s) => s.value === p.stage) : null;
            const wa = whatsappLink(p?.contact.phone ?? null);
            const mail = p?.contact.ownerEmail || c.email;
            return (
              <Card key={c.id}>
                <CardContent className="pt-4 pb-4 space-y-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/customers/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                        <Badge variant={statusVariantMap[c.status] || 'outline'}>{STATUS_LABEL[c.status] || c.status}</Badge>
                        <Badge variant="outline" className="capitalize">{c.subscriptionTier}</Badge>
                        {stage && <span className={`text-xs rounded-full px-2 py-0.5 ${STAGE_COLOR[stage.value]}`}>{stage.label}</span>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {p?.contact.ownerName || 'Dono sem nome'}
                        {mail ? ` · ${mail}` : ''}
                        {p?.contact.phone ? ` · ${p.contact.phone}` : ''}
                        {c.city && c.state ? ` · ${c.city}/${c.state}` : ''}
                      </p>
                      {p && p.answers.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">{p.answers.map((a) => a.answer).join(' · ')}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="gap-1"><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
                        </a>
                      )}
                      {mail && (
                        <a href={`mailto:${mail}`}>
                          <Button size="sm" variant="outline" className="gap-1"><Mail className="h-4 w-4" /> E-mail</Button>
                        </a>
                      )}
                      <Link href={`/admin/customers/${c.id}`}>
                        <Button size="sm">Ficha</Button>
                      </Link>
                    </div>
                  </div>

                  {p && (
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                      <span>Cadastro {formatDate(c.createdAt)}</span>
                      <span>Último acesso {since(p.usage.lastSignInAt)}</span>
                      <span>{p.usage.menuItems} produtos no cardápio</span>
                      <span>{p.usage.closedBills30d} contas fechadas em 30 dias</span>
                      <span>Mercado Pago: {p.usage.mercadoPago}</span>
                      <span>Nota fiscal: {p.usage.fiscal}</span>
                      {c.status === 'TRIAL' && <span>Teste até {formatDate(c.trialEndsAt)}</span>}
                    </div>
                  )}

                  {p && p.alerts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {p.alerts.map((a) => (
                        <span
                          key={a.text}
                          className={`text-xs rounded-md px-2 py-1 ${a.level === 'red' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}
                        >
                          {a.text}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
