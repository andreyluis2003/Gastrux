'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import {
  Plus,
  Save,
  Eye,
  Zap,
  Calendar,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

interface CampaignABVariant {
  id: string;
  variantName: string;
  subjectLine: string;
  content: string;
  cta?: string;
  ctaColor: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  convertCount: number;
}

interface CampaignSchedule {
  id: string;
  scheduleType: string;
  scheduledAt?: string;
  sendTime: string;
  status: string;
}

interface CampaignSegment {
  id: string;
  segmentType: string;
  segmentName: string;
  targetUserCount: number;
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  subjectLine: string;
  preheader?: string;
  content: string;
  enableABTest: boolean;
  abTestingMetric: string;
  segments: CampaignSegment[];
  abVariants: CampaignABVariant[];
  schedules: CampaignSchedule[];
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalConverted: number;
  createdAt: string;
}

export default function CampaignEditorPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showABEditor, setShowABEditor] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subjectLine: '',
    preheader: '',
    content: '',
    enableABTest: false,
    abTestingMetric: 'open_rate',
  });

  // Schedule state
  const [scheduleData, setScheduleData] = useState({
    scheduleType: 'immediate',
    scheduledAt: '',
    sendTime: '08:00',
    recurringPattern: null,
  });

  useEffect(() => {
    fetchCampaign();
  }, [campaignId]);

  const fetchCampaign = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/campaigns/${campaignId}`);
      if (!response.ok) throw new Error('Failed to fetch campaign');
      const data = await response.json();
      setCampaign(data);
      setFormData({
        name: data.name,
        description: data.description || '',
        subjectLine: data.subjectLine,
        preheader: data.preheader || '',
        content: data.content,
        enableABTest: data.enableABTest,
        abTestingMetric: data.abTestingMetric,
      });
    } catch (error) {
      toast.error('Erro ao carregar campanha');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to save campaign');
      toast.success('Campanha salva com sucesso!');
      fetchCampaign();
    } catch (error) {
      toast.error('Erro ao salvar campanha');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateVariant = async () => {
    if (!newVariantName.trim()) {
      toast.error('Nome da variante é obrigatório');
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/campaigns/${campaignId}/ab-variants`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            variantName: newVariantName,
            subjectLine: formData.subjectLine,
            content: formData.content,
            cta: 'Clique aqui',
            ctaColor: '#0066ff',
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to create variant');
      toast.success('Variante criada!');
      setNewVariantName('');
      fetchCampaign();
    } catch (error) {
      toast.error('Erro ao criar variante');
      console.error(error);
    }
  };

  const handleSaveSchedule = async () => {
    try {
      const response = await fetch(
        `/api/admin/campaigns/${campaignId}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scheduleData),
        }
      );

      if (!response.ok) throw new Error('Failed to save schedule');
      toast.success('Agendamento salvo!');
      setShowScheduler(false);
      fetchCampaign();
    } catch (error) {
      toast.error('Erro ao salvar agendamento');
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
        <div className="mx-auto max-w-4xl">
          <Card className="text-center p-8">
            <h2 className="text-lg font-semibold text-gray-900">
              Campanha não encontrada
            </h2>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BackButton href="/dashboard/email-campaigns" />
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {campaign.name}
            </h1>
            <p className="text-sm text-gray-600">ID: {campaign.id}</p>
          </div>
          <Link
            href={`/dashboard/email-campaigns/${campaign.id}/analytics`}
            className="hidden sm:block"
          >
            <Button variant="outline" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Analytics
            </Button>
          </Link>
        </div>

        <div className="grid gap-6">
          {/* Main Content */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Informações da Campanha</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome da Campanha
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assunto
                  </label>
                  <input
                    type="text"
                    value={formData.subjectLine}
                    onChange={(e) =>
                      setFormData({ ...formData, subjectLine: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pré-cabeçalho
                  </label>
                  <input
                    type="text"
                    value={formData.preheader}
                    onChange={(e) =>
                      setFormData({ ...formData, preheader: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Conteúdo HTML
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                  rows={8}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enableABTest"
                  checked={formData.enableABTest}
                  onChange={(e) =>
                    setFormData({ ...formData, enableABTest: e.target.checked })
                  }
                  className="rounded border-gray-300"
                />
                <label htmlFor="enableABTest" className="text-sm font-medium">
                  Habilitar A/B Testing
                </label>
              </div>

              {formData.enableABTest && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Métrica de Teste
                  </label>
                  <select
                    value={formData.abTestingMetric}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        abTestingMetric: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="open_rate">Taxa de Abertura</option>
                    <option value="click_rate">Taxa de Clique</option>
                    <option value="conversion_rate">Taxa de Conversão</option>
                  </select>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Salvando...' : 'Salvar Campanha'}
                </Button>
                <Button
                  onClick={() => setShowABEditor(!showABEditor)}
                  variant="outline"
                >
                  <Zap className="mr-2 h-4 w-4" />
                  A/B Variants ({campaign.abVariants.length})
                </Button>
                <Button
                  onClick={() => setShowScheduler(!showScheduler)}
                  variant="outline"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Agendar
                </Button>
              </div>
            </div>
          </Card>

          {/* A/B Variants Section */}
          {showABEditor && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Variantes A/B</h3>
              <div className="space-y-4">
                {campaign.abVariants.map((variant) => (
                  <div key={variant.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-medium">Variante {variant.variantName}</p>
                    <p className="text-sm text-gray-600">{variant.subjectLine}</p>
                    <div className="flex gap-2 mt-2 text-xs">
                      <span className="px-2 py-1 bg-white rounded">
                        Enviados: {variant.sentCount}
                      </span>
                      <span className="px-2 py-1 bg-white rounded">
                        Aberturas: {variant.openCount}
                      </span>
                      <span className="px-2 py-1 bg-white rounded">
                        Cliques: {variant.clickCount}
                      </span>
                    </div>
                  </div>
                ))}

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">Nova Variante</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nome (A, B, C...)"
                      value={newVariantName}
                      onChange={(e) => setNewVariantName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <Button
                      onClick={handleCreateVariant}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Scheduler Section */}
          {showScheduler && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Agendador</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Agendamento
                  </label>
                  <select
                    value={scheduleData.scheduleType}
                    onChange={(e) =>
                      setScheduleData({
                        ...scheduleData,
                        scheduleType: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="immediate">Imediato</option>
                    <option value="scheduled">Agendado</option>
                    <option value="recurring">Recorrente</option>
                  </select>
                </div>

                {scheduleData.scheduleType === 'scheduled' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Data e Hora
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduleData.scheduledAt}
                        onChange={(e) =>
                          setScheduleData({
                            ...scheduleData,
                            scheduledAt: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Hora (HH:MM)
                      </label>
                      <input
                        type="time"
                        value={scheduleData.sendTime}
                        onChange={(e) =>
                          setScheduleData({
                            ...scheduleData,
                            sendTime: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleSaveSchedule}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Salvar Agendamento
                </Button>
              </div>
            </Card>
          )}

          {/* Segmentos */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Segmentos ({campaign.segments.length})</h3>
            <div className="space-y-2">
              {campaign.segments.map((segment) => (
                <div key={segment.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium">{segment.segmentName}</p>
                  <p className="text-sm text-gray-600">
                    {segment.targetUserCount} usuários
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Add Link import at the top if not present
import Link from 'next/link';
