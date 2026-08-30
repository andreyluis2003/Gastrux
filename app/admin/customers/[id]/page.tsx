'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Users,
  DollarSign,
  Pause,
  Play,
  Clock,
  AlertTriangle,
  Save,
  RefreshCw,
} from 'lucide-react';

interface SubscriptionRow {
  id: string;
  tier: string;
  status: string;
  amount: number;
  currency: string;
  gateway: string;
  billingCycle: string;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

interface PaymentRow {
  id: string;
  amount: number;
  status: string;
  method: string;
  gateway: string;
  customerEmail: string | null;
  description: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
  lastSignInAt: string | null;
}

interface CustomerDetail {
  restaurant: {
    id: string;
    name: string;
    email: string | null;
    cnpj: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    status: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    trialEndsAt: string | null;
    billingCycleEnd: string | null;
    createdAt: string;
    updatedAt: string;
    subscriptions: SubscriptionRow[];
    users: Array<UserRow & { restaurantRole: string | null }>;
  };
  owner: UserRow | null;
  recentPayments: PaymentRow[];
  stats: {
    lifetimeRevenue: number;
    paymentCountsByStatus: Record<string, number>;
    subscriptionsCount: number;
    usersCount: number;
  };
}

function formatCurrency(amount: number): string {
  return Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // edit form state
  const [editTier, setEditTier] = useState('starter');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editSubStatus, setEditSubStatus] = useState('active');
  const [editTrialDays, setEditTrialDays] = useState('7');

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as CustomerDetail;
      setDetail(data);
      setEditTier(data.restaurant.subscriptionTier);
      setEditStatus(data.restaurant.status);
      setEditSubStatus(data.restaurant.subscriptionStatus);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  async function callPatch(body: any, successMsg: string) {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success(successMsg);
      await fetchDetail();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-10 w-1/3 bg-slate-100 rounded animate-pulse" />
        <div className="h-60 bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => router.push('/admin/customers')}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  const { restaurant, owner, recentPayments, stats } = detail;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/admin/customers">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Clientes
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6 text-blue-600" />
              {restaurant.name}
            </h1>
            <div className="text-sm text-muted-foreground space-x-2">
              {restaurant.cnpj && <span>CNPJ: {restaurant.cnpj}</span>}
              {restaurant.city && restaurant.state && (
                <span>· {restaurant.city}/{restaurant.state}</span>
              )}
              <span>· ID: <code className="text-xs">{restaurant.id}</code></span>
            </div>
          </div>
        </div>
        <Button onClick={fetchDetail} variant="outline" className="gap-2" disabled={loading}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Atualizar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="mt-1">
              <Badge variant={statusVariant(restaurant.status)}>{restaurant.status}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Assinatura: {restaurant.subscriptionStatus}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano</p>
            <p className="mt-1 text-2xl font-bold">{restaurant.subscriptionTier}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.subscriptionsCount} assinatura(s) no histórico
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Receita total
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {formatCurrency(stats.lifetimeRevenue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Pagamentos aprovados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Usuários</p>
            <p className="mt-1 text-2xl font-bold">{stats.usersCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Owner: {owner?.email || '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Ações rápidas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              className="gap-2"
              disabled={saving || restaurant.status === 'SUSPENDED'}
              onClick={() => callPatch({ action: 'suspend' }, 'Cliente suspenso')}
            >
              <Pause className="h-4 w-4" /> Suspender
            </Button>
            <Button
              className="gap-2"
              disabled={saving || restaurant.status === 'ACTIVE'}
              onClick={() => callPatch({ action: 'reactivate' }, 'Cliente reativado')}
            >
              <Play className="h-4 w-4" /> Reativar
            </Button>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="180"
                className="w-20"
                value={editTrialDays}
                onChange={(e) => setEditTrialDays(e.target.value)}
              />
              <Button
                variant="outline"
                className="gap-2"
                disabled={saving}
                onClick={() =>
                  callPatch(
                    { action: 'extend_trial', days: parseInt(editTrialDays, 10) },
                    `Trial estendido por ${editTrialDays} dias`
                  )
                }
              >
                <Clock className="h-4 w-4" /> Estender trial
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Plano</Label>
              <Select value={editTier} onValueChange={setEditTier}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status do restaurante</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="TRIAL">TRIAL</SelectItem>
                  <SelectItem value="SUSPENDED">SUSPENDED</SelectItem>
                  <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                  <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status da assinatura</Label>
              <Select value={editSubStatus} onValueChange={setEditSubStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="trialing">trialing</SelectItem>
                  <SelectItem value="past_due">past_due</SelectItem>
                  <SelectItem value="paused">paused</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="gap-2"
            disabled={saving}
            onClick={() =>
              callPatch(
                {
                  subscriptionTier: editTier,
                  status: editStatus,
                  subscriptionStatus: editSubStatus,
                },
                'Cliente atualizado'
              )
            }
          >
            <Save className="h-4 w-4" /> Salvar alterações
          </Button>
        </CardContent>
      </Card>

      {/* Trial warning */}
      {restaurant.trialEndsAt && new Date(restaurant.trialEndsAt) > new Date() && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div className="text-sm">
              <p className="font-medium text-amber-900">
                Trial ativo até {formatDate(restaurant.trialEndsAt)}
              </p>
              <p className="text-xs text-amber-800">
                Assinatura muda para cobrança normal nesta data.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscriptions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Assinaturas ({detail.restaurant.subscriptions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.restaurant.subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma assinatura registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 text-left">Plano</th>
                    <th className="py-2 text-left">Gateway</th>
                    <th className="py-2 text-left">Status</th>
                    <th className="py-2 text-right">Valor</th>
                    <th className="py-2 text-left">Ciclo</th>
                    <th className="py-2 text-left">Fim</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.restaurant.subscriptions.map((s) => (
                    <tr key={s.id} className="border-b last:border-b-0">
                      <td className="py-2">{s.tier}</td>
                      <td className="py-2">{s.gateway}</td>
                      <td className="py-2">
                        <Badge variant={subStatusVariant(s.status)}>{s.status}</Badge>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatCurrency(s.amount)}
                      </td>
                      <td className="py-2">{s.billingCycle}</td>
                      <td className="py-2">{formatDate(s.currentPeriodEnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent payments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Últimos pagamentos ({recentPayments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 text-left">Data</th>
                    <th className="py-2 text-left">Cliente</th>
                    <th className="py-2 text-left">Gateway</th>
                    <th className="py-2 text-left">Método</th>
                    <th className="py-2 text-left">Status</th>
                    <th className="py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((p) => (
                    <tr key={p.id} className="border-b last:border-b-0">
                      <td className="py-2 text-xs">{formatDateTime(p.createdAt)}</td>
                      <td className="py-2">{p.customerEmail || p.description || '—'}</td>
                      <td className="py-2">{p.gateway}</td>
                      <td className="py-2">{p.method}</td>
                      <td className="py-2">
                        <Badge variant={paymentStatusVariant(p.status)}>{p.status}</Badge>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatCurrency(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Usuários ({detail.restaurant.users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.restaurant.users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem usuários vinculados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 text-left">Nome</th>
                    <th className="py-2 text-left">Email</th>
                    <th className="py-2 text-left">Role</th>
                    <th className="py-2 text-left">Ativo</th>
                    <th className="py-2 text-left">Último login</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.restaurant.users.map((u) => (
                    <tr key={u.id} className="border-b last:border-b-0">
                      <td className="py-2">{u.name || '—'}</td>
                      <td className="py-2">{u.email}</td>
                      <td className="py-2">
                        <Badge variant="outline">{u.role}</Badge>
                      </td>
                      <td className="py-2">
                        {u.active ? (
                          <Badge variant="default">Ativo</Badge>
                        ) : (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                      </td>
                      <td className="py-2 text-xs">{formatDateTime(u.lastSignInAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function statusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'ACTIVE') return 'default';
  if (s === 'TRIAL') return 'secondary';
  if (s === 'SUSPENDED' || s === 'CANCELLED') return 'destructive';
  return 'outline';
}

function subStatusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'active') return 'default';
  if (s === 'trialing') return 'secondary';
  if (s === 'past_due' || s === 'cancelled') return 'destructive';
  return 'outline';
}

function paymentStatusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'APPROVED' || s === 'SETTLED') return 'default';
  if (s === 'PENDING' || s === 'PROCESSING') return 'secondary';
  if (s === 'DECLINED' || s === 'CANCELLED' || s === 'CHARGEBACK') return 'destructive';
  return 'outline';
}
