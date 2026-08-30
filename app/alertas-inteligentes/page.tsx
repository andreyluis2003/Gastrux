'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input, Label, BackButton, LoadingSkeleton } from '@/components/ui';
import { Plus, AlertTriangle, Trash2, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';

interface SmartAlert {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggerType: string;
  conditions?: any;
  cooldownMinutes: number;
  shouldNotify: boolean;
  shouldEmail: boolean;
  lastTriggeredAt?: string;
  triggerCount?: number;
}

const TRIGGER_TYPES = [
  {
    value: 'LOW_STOCK_CRITICAL',
    label: 'Estoque Crítico',
    description: 'Alerta quando estoque cai para < 2 dias',
    icon: '📦',
  },
  {
    value: 'LOW_MARGIN',
    label: 'Margem Baixa',
    description: 'Alerta quando margem cai abaixo de 25%',
    icon: '💰',
  },
  {
    value: 'WASTE_ANOMALY',
    label: 'Anomalia de Desperdício',
    description: 'Alerta para padrões anormais de desperdício',
    icon: '⚠️',
  },
  {
    value: 'SUPPLIER_PRICE_INCREASE',
    label: 'Aumento de Preço',
    description: 'Alerta para variações de preço do fornecedor',
    icon: '📈',
  },
  {
    value: 'DEMAND_MISMATCH',
    label: 'Desvio de Demanda',
    description: 'Alerta quando demanda diverge da previsão',
    icon: '📊',
  },
  {
    value: 'EXPIRING_SOON',
    label: 'Vencimento Próximo',
    description: 'Alerta para produtos próximos do vencimento',
    icon: '⏰',
  },
];

export default function AlertasInteligentesPage() {
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<SmartAlert>>({
    name: '',
    description: '',
    triggerType: 'LOW_STOCK_CRITICAL',
    enabled: true,
    cooldownMinutes: 60,
    shouldNotify: true,
    shouldEmail: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/smart-alerts/rules');
      const data = await response.json();
      setAlerts(data.rules || []);
    } catch (error) {
      console.error('Erro ao carregar alertas:', error);
      toast.error('Erro ao carregar alertas');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.triggerType) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    try {
      setSaving(true);

      const response = await fetch('/api/smart-alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Erro ao salvar alerta');

      toast.success(editingId ? 'Alerta atualizado!' : 'Alerta criado com sucesso!');
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        triggerType: 'LOW_STOCK_CRITICAL',
        enabled: true,
        cooldownMinutes: 60,
        shouldNotify: true,
        shouldEmail: false,
      });
      setEditingId(null);
      setShowNewDialog(false);
      
      await fetchAlerts();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar alerta');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (alert: SmartAlert) => {
    setFormData(alert);
    setEditingId(alert.id);
    setShowNewDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar este alerta?')) return;

    try {
      const response = await fetch(`/api/smart-alerts/rules/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Erro ao deletar');

      toast.success('Alerta deletado!');
      await fetchAlerts();
    } catch (error) {
      console.error('Erro ao deletar:', error);
      toast.error('Erro ao deletar alerta');
    }
  };

  const getTriggerInfo = (triggerType: string) => {
    return TRIGGER_TYPES.find(t => t.value === triggerType);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <BackButton />
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mt-2">Alertas Inteligentes</h1>
          <p className="text-sm text-gray-600 mt-1">Configure regras automáticas para monitorar seu negócio</p>
        </div>
        <Button
          onClick={() => {
            setShowNewDialog(true);
            setEditingId(null);
            setFormData({
              name: '',
              description: '',
              triggerType: 'LOW_STOCK_CRITICAL',
              enabled: true,
              cooldownMinutes: 60,
              shouldNotify: true,
              shouldEmail: false,
            });
          }}
          className="w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Alerta
        </Button>
      </div>

      {loading && <LoadingSkeleton />}

      {/* New/Edit Dialog */}
      {showNewDialog && !loading && (
        <Card className="p-6 bg-white border-2 border-orange-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {editingId ? 'Editar Alerta' : 'Novo Alerta Inteligente'}
          </h2>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nome do Alerta *</Label>
              <Input
                id="name"
                placeholder="ex: Alerta de Estoque Baixo - Frango"
                value={formData.name || ''}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Detalhes opcionais sobre este alerta"
                value={formData.description || ''}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="trigger">Tipo de Disparo *</Label>
              <select
                id="trigger"
                value={formData.triggerType}
                onChange={e => setFormData({ ...formData, triggerType: e.target.value })}
                className="w-full mt-2 p-2 border rounded-lg text-gray-900"
              >
                {TRIGGER_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
              {getTriggerInfo(formData.triggerType || '')?.description && (
                <p className="text-xs text-gray-600 mt-1">
                  {getTriggerInfo(formData.triggerType || '')?.description}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="cooldown">Intervalo Mínimo Entre Alertas (minutos)</Label>
              <Input
                id="cooldown"
                type="number"
                min="5"
                max="1440"
                value={formData.cooldownMinutes}
                onChange={e => setFormData({ ...formData, cooldownMinutes: parseInt(e.target.value) })}
                className="mt-2"
              />
              <p className="text-xs text-gray-600 mt-1">Evita spam repetido do mesmo alerta</p>
            </div>

            <div className="space-y-2 border-t pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.shouldNotify || false}
                  onChange={e => setFormData({ ...formData, shouldNotify: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700">Notificação in-app</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.shouldEmail || false}
                  onChange={e => setFormData({ ...formData, shouldEmail: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700">Enviar email</span>
              </label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1"
              >
                {saving ? 'Salvando...' : editingId ? 'Atualizar Alerta' : 'Criar Alerta'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowNewDialog(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Alerts List */}
      {!loading && (
        <>
          {alerts.length === 0 ? (
            <Card className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto" />
              <p className="text-gray-500 text-lg mt-4">Nenhum alerta configurado</p>
              <p className="text-gray-400 text-sm mt-1">Crie sua primeira regra de alerta clicando em "Novo Alerta"</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {alerts.map(alert => {
                const triggerInfo = getTriggerInfo(alert.triggerType);
                return (
                  <Card key={alert.id} className="p-4">
                    <div className="flex flex-col gap-3 sm:gap-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{triggerInfo?.icon}</span>
                          <div>
                            <h3 className="font-semibold text-gray-900">{alert.name}</h3>
                            {alert.description && (
                              <p className="text-sm text-gray-600">{alert.description}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              {triggerInfo?.label} • Intervalo: {alert.cooldownMinutes}min
                              {alert.lastTriggeredAt && ` • Último disparo: ${new Date(alert.lastTriggeredAt).toLocaleDateString('pt-BR')}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2 ml-7 text-xs">
                          {alert.shouldNotify && <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">Notificação</span>}
                          {alert.shouldEmail && <span className="bg-green-100 text-green-800 px-2 py-1 rounded">Email</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(alert)}
                          className="p-2 hover:bg-gray-100 rounded transition"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(alert.id)}
                          className="p-2 hover:bg-red-100 rounded transition"
                          title="Deletar"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
