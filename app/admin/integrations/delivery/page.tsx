'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { RefreshCw, Settings2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface DeliveryIntegration {
  id: string;
  platform: 'ifood' | 'uber_eats' | 'rappi';
  isActive: boolean;
  storeName?: string;
  storePhone?: string;
  lastSyncedAt?: string;
  totalOrdersSynced: number;
  lastOrderAt?: string;
  syncStatus: string;
  createdAt: string;
}

export default function DeliveryIntegrationsPage() {
  const [integrations, setIntegrations] = useState<DeliveryIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    platform: 'ifood',
    apiKey: '',
    webhookSecret: '',
    storeId: '',
    storeName: '',
    storePhone: '',
  });

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/integrations/delivery');
      if (!res.ok) throw new Error('Failed to fetch integrations');
      const data = await res.json();
      setIntegrations(data);
    } catch (error) {
      toast.error('Erro ao carregar integrações');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const res = await fetch('/api/admin/integrations/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Failed to save integration');
      
      toast.success(`${formData.platform} integrado com sucesso!`);
      setShowForm(false);
      setFormData({
        platform: 'ifood',
        apiKey: '',
        webhookSecret: '',
        storeId: '',
        storeName: '',
        storePhone: '',
      });
      fetchIntegrations();
    } catch (error) {
      toast.error('Erro ao salvar integração');
      console.error(error);
    }
  };

  const platformLabels = {
    ifood: 'iFood',
    uber_eats: 'Uber Eats',
    rappi: 'Rappi',
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Integrações de Delivery</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchIntegrations}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : '+ Nova Integração'}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Conectar Plataforma</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Plataforma</label>
              <select
                value={formData.platform}
                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                disabled={integrations.some((i) => i.platform === formData.platform)}
              >
                <option value="ifood">iFood</option>
                <option value="uber_eats">Uber Eats</option>
                <option value="rappi">Rappi</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">API Key</label>
              <input
                type="password"
                placeholder="Cole sua chave de API"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Webhook Secret</label>
              <input
                type="password"
                placeholder="Cole seu webhook secret"
                value={formData.webhookSecret}
                onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Store ID (opcional)</label>
              <input
                type="text"
                placeholder="ID da sua loja na plataforma"
                value={formData.storeId}
                onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Nome da Loja</label>
              <input
                type="text"
                placeholder="Nome de exibição da loja"
                value={formData.storeName}
                onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Telefone da Loja</label>
              <input
                type="tel"
                placeholder="Telefone para contato"
                value={formData.storePhone}
                onChange={(e) => setFormData({ ...formData, storePhone: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1">Conectar</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : integrations.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">Nenhuma integração configurada</p>
          <Button onClick={() => setShowForm(true)} className="mt-4">
            Conectar Primeira Plataforma
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {integrations.map((integration) => (
            <Card key={integration.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold">
                      {platformLabels[integration.platform]}
                    </h3>
                    {integration.isActive ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    Store: {integration.storeName || 'Não configurado'}
                  </p>
                  <p className="text-sm text-gray-600">
                    Pedidos sincronizados: {integration.totalOrdersSynced}
                  </p>
                  {integration.lastOrderAt && (
                    <p className="text-sm text-gray-600">
                      Último pedido: {new Date(integration.lastOrderAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                  <p className="text-sm text-gray-600">
                    Status: {integration.syncStatus}
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
