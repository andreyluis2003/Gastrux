// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { FadeIn } from '@/components/ui/animate';
import { Save, Zap, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';

interface Supplier {
  id: string;
  code: string;
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  contactPerson?: string;
  status: string;
  integrations: any[];
  ingredients: any[];
}

export default function SupplierDetailPage() {
  const { data: session, status } = useSession() || {};
  const params = useParams();
  const router = useRouter();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [formData, setFormData] = useState<Partial<Supplier>>({});

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    const fetchSupplier = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/suppliers/${params.id}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setSupplier(data);
        setFormData(data);
      } catch (error) {
        console.error('Error fetching supplier:', error);
        toast.error('Erro ao carregar fornecedor');
        router.push('/fornecedores');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchSupplier();
    }
  }, [params.id, router]);

  const handleSave = async () => {
    if (!supplier) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Failed to update');
      const updated = await res.json();
      setSupplier(updated);
      toast.success('Fornecedor atualizado com sucesso!');
    } catch (error) {
      console.error('Error saving supplier:', error);
      toast.error('Erro ao atualizar fornecedor');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!supplier) return;

    try {
      setSyncing(true);
      const res = await fetch(`/api/suppliers/${supplier.id}/sync`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Failed to sync');
      const result = await res.json();
      toast.success(`${result.itemsSynced} itens sincronizados!`);
    } catch (error) {
      console.error('Error syncing supplier:', error);
      toast.error('Erro ao sincronizar preços');
    } finally {
      setSyncing(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Breadcrumb items={[
          { label: 'Fornecedores', href: '/fornecedores' },
          { label: 'Carregando...' }
        ]} />
        <LoadingSkeleton variant="card" height="h-40" />
        <LoadingSkeleton variant="card" height="h-60" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Breadcrumb items={[
          { label: 'Fornecedores', href: '/fornecedores' },
          { label: 'Não encontrado' }
        ]} />
        <p className="text-center">Fornecedor não encontrado</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-950 dark:to-slate-900/50">
      <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-6">
        <Breadcrumb items={[
          { label: 'Fornecedores', href: '/fornecedores' },
          { label: supplier.name }
        ]} />
        {/* Header */}
        <FadeIn>
          <div className="flex items-center gap-4">
            <BackButton href="/fornecedores" label="Voltar" />
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white truncate">
                {supplier.name}
              </h1>
              <p className="text-slate-600 dark:text-slate-400">Código: {supplier.code}</p>
            </div>
          </div>
        </FadeIn>

        {/* Main Form */}
        <FadeIn delay={0.1}>
          <GlassCard>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Informações Básicas
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <Label>Nome</Label>
                <Input
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Código</Label>
                <Input disabled value={formData.code || ''} />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input
                  value={formData.cnpj || ''}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Contato</Label>
                <Input
                  value={formData.contactPerson || ''}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2 border-t border-slate-200 dark:border-slate-700 pt-6">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
              <Button
                variant="outline"
                onClick={handleSync}
                disabled={syncing || supplier.integrations.length === 0}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {syncing ? 'Sincronizando...' : 'Sincronizar Preços'}
              </Button>
            </div>
          </GlassCard>
        </FadeIn>

        {/* Integrations Section */}
        <FadeIn delay={0.2}>
          <GlassCard>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                <Zap className="w-5 h-5 inline mr-2 text-amber-500" />
                Integrações
              </h2>
              <Button size="sm" asChild>
                <Link href={`/fornecedores/${supplier.id}/integradores`}>
                  Adicionar Integração
                </Link>
              </Button>
            </div>

            {supplier.integrations.length === 0 ? (
              <p className="text-slate-600 dark:text-slate-400 text-center py-8">
                Nenhuma integração configurada
              </p>
            ) : (
              <div className="space-y-3">
                {supplier.integrations.map((integration) => (
                  <Card
                    key={integration.id}
                    className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {integration.integrationType}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Último sync: {integration.lastSyncedAt
                            ? new Date(integration.lastSyncedAt).toLocaleString('pt-BR')
                            : 'Nunca'}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        integration.lastSyncStatus === 'SUCCESS'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        {integration.lastSyncStatus}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </GlassCard>
        </FadeIn>

        {/* Ingredients */}
        <FadeIn delay={0.3}>
          <GlassCard>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Insumos Fornecidos ({supplier.ingredients.length})
            </h2>

            {supplier.ingredients.length === 0 ? (
              <p className="text-slate-600 dark:text-slate-400 text-center py-8">
                Nenhum insumo associado
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {supplier.ingredients.map((ing) => (
                  <div
                    key={ing.id}
                    className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center"
                  >
                    <span className="font-medium text-slate-900 dark:text-white">
                      {ing.ingredient.name}
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      R$ {ing.unitPrice.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </FadeIn>
      </div>
    </div>
  );
}
