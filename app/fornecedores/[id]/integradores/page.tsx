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
import { FadeIn, ScaleIn } from '@/components/ui/animate';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BackButton } from '@/components/ui/back-button';

interface Integration {
  id: string;
  integrationType: string;
  apiUrl?: string;
  isActive: boolean;
  lastSyncedAt?: string;
  lastSyncStatus: string;
  syncFrequency: number;
}

const INTEGRATION_TYPES = [
  { value: 'API', label: 'API REST', description: 'Integração via API REST' },
  { value: 'CSV', label: 'CSV Upload', description: 'Importação manual de CSV' },
  { value: 'WEBHOOK', label: 'Webhook', description: 'Receber atualizações via webhook' },
  { value: 'EDI', label: 'EDI', description: 'Integração EDI' },
];

export default function IntegrationPage() {
  const { data: session, status } = useSession() || {};
  const params = useParams();
  const router = useRouter();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [formData, setFormData] = useState({
    integrationType: '',
    apiKey: '',
    apiSecret: '',
    apiUrl: '',
    webhookUrl: '',
    webhookSecret: '',
    syncFrequency: 24,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [supplierRes, integrationsRes] = await Promise.all([
          fetch(`/api/suppliers/${params.id}`),
          fetch(`/api/suppliers/${params.id}/integrate`),
        ]);

        if (!supplierRes.ok || !integrationsRes.ok) throw new Error('Failed to fetch');

        const supplier = await supplierRes.json();
        const integs = await integrationsRes.json();

        setSupplierName(supplier.name);
        setIntegrations(integs);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Erro ao carregar dados');
        router.push('/fornecedores');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchData();
    }
  }, [params.id, router]);

  const handleCreateIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.integrationType) {
      toast.error('Selecione um tipo de integração');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/suppliers/${params.id}/integrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Failed to create');
      const newIntegration = await res.json();

      setIntegrations([...integrations, newIntegration]);
      setFormData({
        integrationType: '',
        apiKey: '',
        apiSecret: '',
        apiUrl: '',
        webhookUrl: '',
        webhookSecret: '',
        syncFrequency: 24,
      });
      setSelectedType('');
      setShowForm(false);
      toast.success('Integração criada com sucesso!');
    } catch (error) {
      console.error('Error creating integration:', error);
      toast.error('Erro ao criar integração');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteIntegration = async (integrationId: string) => {
    if (!confirm('Desativar esta integração?')) return;

    try {
      setIntegrations(integrations.filter(i => i.id !== integrationId));
      toast.success('Integração removida');
    } catch (error) {
      console.error('Error deleting integration:', error);
      toast.error('Erro ao remover integração');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <LoadingSkeleton variant="card" height="h-40" />
        <LoadingSkeleton variant="card" height="h-60" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-950 dark:to-slate-900/50">
      <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-6">
        <FadeIn>
          <div className="flex items-center gap-4">
            <BackButton href={`/fornecedores/${params.id}`} label="Voltar" />
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white truncate">
                Integrações
              </h1>
              <p className="text-slate-600 dark:text-slate-400">{supplierName}</p>
            </div>
          </div>
        </FadeIn>

        {showForm && (
          <ScaleIn>
            <GlassCard>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
                Nova Integração
              </h2>

              <form onSubmit={handleCreateIntegration} className="space-y-6">
                <div>
                  <Label className="mb-3 block">Tipo de Integração</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {INTEGRATION_TYPES.map((type) => {
                      const isSelected = selectedType === type.value;
                      return (
                        <div
                          key={type.value}
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                          onClick={() => {
                            setSelectedType(type.value);
                            setFormData({ ...formData, integrationType: type.value });
                          }}
                        >
                          <p className="font-medium text-slate-900 dark:text-white">
                            {type.label}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {type.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectedType === 'API' && (
                  <div className="space-y-4">
                    <div>
                      <Label>URL da API</Label>
                      <Input
                        value={formData.apiUrl || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, apiUrl: e.target.value })
                        }
                        placeholder="https://api.fornecedor.com/prices"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>API Key</Label>
                        <Input
                          value={formData.apiKey || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, apiKey: e.target.value })
                          }
                          type="password"
                          placeholder="Sua API Key"
                        />
                      </div>
                      <div>
                        <Label>API Secret</Label>
                        <Input
                          value={formData.apiSecret || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, apiSecret: e.target.value })
                          }
                          type="password"
                          placeholder="Seu API Secret"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {selectedType === 'WEBHOOK' && (
                  <div className="space-y-4">
                    <div>
                      <Label>URL do Webhook</Label>
                      <Input
                        value={formData.webhookUrl || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, webhookUrl: e.target.value })
                        }
                        placeholder="https://seu-app.com/webhook/supplier"
                      />
                    </div>
                    <div>
                      <Label>Secret do Webhook (opcional)</Label>
                      <Input
                        value={formData.webhookSecret || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, webhookSecret: e.target.value })
                        }
                        type="password"
                        placeholder="Secret para validar requests"
                      />
                    </div>
                  </div>
                )}

                {selectedType !== 'CSV' && (
                  <div>
                    <Label>Frequência de Sincronização (horas)</Label>
                    <Input
                      type="number"
                      value={formData.syncFrequency}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          syncFrequency: parseInt(e.target.value),
                        })
                      }
                      min="1"
                      max="168"
                    />
                  </div>
                )}

                <div className="flex gap-2 border-t border-slate-200 dark:border-slate-700 pt-6">
                  <Button type="submit" disabled={saving || !selectedType}>
                    {saving ? 'Criando...' : 'Criar Integração'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </GlassCard>
          </ScaleIn>
        )}

        <FadeIn delay={0.1}>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Integração
            </Button>
          )}
        </FadeIn>

        {integrations.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-slate-600 dark:text-slate-400">
              Nenhuma integração configurada
            </p>
          </Card>
        ) : (
          <FadeIn delay={0.2}>
            <div className="space-y-4">
              {integrations.map((integration, idx) => (
                <ScaleIn key={integration.id} delay={0.3 + idx * 0.05}>
                  <GlassCard>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          {integration.integrationType}
                        </h3>
                        {integration.apiUrl && (
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            URL: {integration.apiUrl}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-4 text-sm">
                          <span className={`px-2 py-1 rounded-full font-medium ${
                            integration.lastSyncStatus === 'SUCCESS'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}>
                            {integration.lastSyncStatus}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">
                            Sincronização a cada {integration.syncFrequency}h
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">
                            {integration.lastSyncedAt
                              ? `Último: ${new Date(integration.lastSyncedAt).toLocaleString('pt-BR')}`
                              : 'Nunca sincronizado'}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteIntegration(integration.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </GlassCard>
                </ScaleIn>
              ))}
            </div>
          </FadeIn>
        )}
      </div>
    </div>
  );
}