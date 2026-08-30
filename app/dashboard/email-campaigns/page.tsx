'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Plus, Mail, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/formatters';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalConverted: number;
  segments: Array<{ id: string; segmentName: string; targetUserCount: number }>;
  schedules: Array<{ id: string; scheduleType: string; status: string }>;
  createdAt: string;
  launchedAt?: string;
}

export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingNew, setCreatingNew] = useState(false);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      const data = await response.json();
      setCampaigns(data);
    } catch (error) {
      toast.error('Erro ao carregar campanhas');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = async () => {
    setCreatingNew(true);
    try {
      // Create draft campaign with minimal data
      const response = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Nova Campanha',
          type: 'segmented',
          subjectLine: 'Assunto do Email',
          content: '<p>Conteúdo do email</p>',
          segments: [
            {
              segmentType: 'all_users',
              segmentName: 'Todos os Usuários',
            },
          ],
        }),
      });

      if (!response.ok) throw new Error('Failed to create campaign');
      const newCampaign = await response.json();
      toast.success('Campanha criada! Redirecionando...');
      window.location.href = `/dashboard/email-campaigns/${newCampaign.id}`;
    } catch (error) {
      toast.error('Erro ao criar campanha');
      console.error(error);
    } finally {
      setCreatingNew(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-700';
      case 'scheduled':
        return 'bg-blue-100 text-blue-700';
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'completed':
        return 'bg-slate-100 text-slate-700';
      case 'paused':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Rascunho',
      scheduled: 'Agendada',
      active: 'Ativa',
      completed: 'Concluída',
      paused: 'Pausada',
    };
    return labels[status] || status;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BackButton href="/dashboard" />
            <div>
              <h1 className="text-xl font-bold sm:text-3xl">Campanhas de Email</h1>
              <p className="text-sm text-gray-600">
                Gerencie suas campanhas de email, A/B testing e agendamentos
              </p>
            </div>
          </div>
          <Button
            onClick={handleCreateNew}
            disabled={creatingNew}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            {creatingNew ? 'Criando...' : 'Nova Campanha'}
          </Button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-lg bg-white"
              />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <Card className="flex flex-col items-center gap-4 border-dashed p-8 text-center">
            <Mail className="h-12 w-12 text-gray-400" />
            <div>
              <h3 className="font-semibold text-gray-900">Nenhuma campanha encontrada</h3>
              <p className="text-sm text-gray-600">
                Crie sua primeira campanha de email para começar
              </p>
            </div>
            <Button
              onClick={handleCreateNew}
              disabled={creatingNew}
              className="mt-2 bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              {creatingNew ? 'Criando...' : 'Criar Campanha'}
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:gap-6">
            {campaigns.map((campaign) => {
              const openRate = campaign.totalSent > 0
                ? ((campaign.totalOpened / campaign.totalSent) * 100).toFixed(1)
                : 0;
              const clickRate = campaign.totalSent > 0
                ? ((campaign.totalClicked / campaign.totalSent) * 100).toFixed(1)
                : 0;

              return (
                <Link
                  key={campaign.id}
                  href={`/dashboard/email-campaigns/${campaign.id}`}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4">
                      <div className="flex-1 gap-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 truncate">{campaign.name}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(campaign.status)}`}>
                            {getStatusLabel(campaign.status)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-1">{campaign.description}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                          <div className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            <span>{campaign.segments.length} segmento(s)</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatDate(new Date(campaign.createdAt))}</span>
                          </div>
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-col sm:gap-2 text-right sm:text-right">
                        <div>
                          <p className="text-xs text-gray-600">Enviados</p>
                          <p className="font-semibold">{campaign.totalSent}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Taxa Abertura</p>
                          <p className="font-semibold text-blue-600">{openRate}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Taxa Clique</p>
                          <p className="font-semibold text-green-600">{clickRate}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Conversões</p>
                          <p className="font-semibold text-purple-600">{campaign.totalConverted}</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
