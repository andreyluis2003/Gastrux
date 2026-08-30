'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BackButton } from '@/components/ui/back-button';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { toast } from 'sonner';
import {
  Users,
  Target,
  TrendingUp,
  Search,
  Filter,
  Plus,
  BarChart3,
  Zap,
  Star,
  Phone,
  Mail,
  Building2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  Flame,
  Thermometer,
  Snowflake,
  MessageSquare,
  Globe,
  Megaphone,
  FileText,
  ExternalLink,
} from 'lucide-react';

interface Lead {
  id: string;
  source: string;
  sourceDetail?: string;
  phoneNumber?: string;
  email?: string;
  name?: string;
  businessName?: string;
  segment?: string;
  status: string;
  score: number;
  tags: string[];
  notes?: string;
  stage: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  contactAttempts: number;
  convertedAt?: string;
  utmSource?: string;
  utmCampaign?: string;
  createdAt: string;
}

interface Stats {
  total: number;
  new: number;
  qualified: number;
  converted: number;
  lost: number;
  avgScore: number;
  conversionRate: string;
  bySource: Record<string, number>;
  byStage: Record<string, number>;
  bySegment: { segment: string; count: number }[];
}

const sourceLabels: Record<string, { label: string; icon: any; color: string }> = {
  WHATSAPP: { label: 'WhatsApp', icon: MessageSquare, color: 'bg-green-100 text-green-700' },
  LANDING_PAGE: { label: 'Landing Page', icon: Globe, color: 'bg-blue-100 text-blue-700' },
  PPC_CAMPAIGN: { label: 'PPC/Anúncio', icon: Megaphone, color: 'bg-amber-100 text-amber-700' },
  SEGMENT_PAGE: { label: 'Segmento', icon: Target, color: 'bg-violet-100 text-violet-700' },
  SURVEY: { label: 'Pesquisa', icon: FileText, color: 'bg-indigo-100 text-indigo-700' },
  REFERRAL: { label: 'Indicação', icon: Users, color: 'bg-emerald-100 text-emerald-700' },
  ORGANIC: { label: 'Orgânico', icon: Globe, color: 'bg-gray-100 text-gray-700' },
  MANUAL: { label: 'Manual', icon: Plus, color: 'bg-gray-100 text-gray-600' },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Novo', color: 'bg-blue-100 text-blue-700' },
  CONTACTED: { label: 'Contatado', color: 'bg-amber-100 text-amber-700' },
  QUALIFIED: { label: 'Qualificado', color: 'bg-emerald-100 text-emerald-700' },
  NURTURING: { label: 'Nurturing', color: 'bg-violet-100 text-violet-700' },
  CONVERTED: { label: 'Convertido', color: 'bg-green-100 text-green-700' },
  LOST: { label: 'Perdido', color: 'bg-red-100 text-red-700' },
  UNRESPONSIVE: { label: 'Sem Resposta', color: 'bg-gray-100 text-gray-500' },
};

const stageLabels: Record<string, string> = {
  CAPTURED: 'Capturado',
  WELCOME_SENT: 'Welcome Enviado',
  ENGAGED: 'Engajado',
  DEMO_SCHEDULED: 'Demo Agendada',
  TRIAL_STARTED: 'Trial Iniciado',
  TRIAL_ACTIVE: 'Trial Ativo',
  CONVERSION_PENDING: 'Conversão Pendente',
  CONVERTED: 'Convertido',
  CHURNED: 'Churned',
};

function ScoreBadge({ score }: { score: number }) {
  if (score >= 60) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600">
      <Flame className="w-3 h-3" /> {score}
    </span>
  );
  if (score >= 30) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
      <Thermometer className="w-3 h-3" /> {score}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-500">
      <Snowflake className="w-3 h-3" /> {score}
    </span>
  );
}

export default function MarketingLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: '', source: '', segment: '' });
  const [sort, setSort] = useState('recent');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runningAutomation, setRunningAutomation] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', email: '', phoneNumber: '', businessName: '', segment: '', source: 'MANUAL' });
  const [addingLead, setAddingLead] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set('status', filter.status);
      if (filter.source) params.set('source', filter.source);
      if (filter.segment) params.set('segment', filter.segment);
      params.set('sort', sort);
      params.set('limit', '100');
      const res = await fetch(`/api/admin/marketing/leads?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLeads(data.leads);
      setStats(data.stats);
    } catch {
      toast.error('Erro ao carregar leads');
    } finally {
      setLoading(false);
    }
  }, [filter, sort]);

  useEffect(() => { load(); }, [load]);

  const runAutomation = async () => {
    setRunningAutomation(true);
    try {
      const res = await fetch('/api/admin/marketing/automation', { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Automação executada: ${data.results.scoresUpdated} scores, ${data.results.stagesAdvanced} estágios`);
      load();
    } catch {
      toast.error('Erro ao executar automação');
    } finally {
      setRunningAutomation(false);
    }
  };

  const updateLead = async (id: string, data: any) => {
    try {
      const res = await fetch(`/api/admin/marketing/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      toast.success('Lead atualizado');
      load();
    } catch {
      toast.error('Erro ao atualizar lead');
    }
  };

  const addLead = async () => {
    if (!newLead.email && !newLead.phoneNumber) {
      toast.error('Informe email ou telefone');
      return;
    }
    setAddingLead(true);
    try {
      const res = await fetch('/api/admin/marketing/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLead),
      });
      if (!res.ok) throw new Error();
      toast.success('Lead adicionado');
      setShowAddForm(false);
      setNewLead({ name: '', email: '', phoneNumber: '', businessName: '', segment: '', source: 'MANUAL' });
      load();
    } catch {
      toast.error('Erro ao adicionar lead');
    } finally {
      setAddingLead(false);
    }
  };

  const filteredLeads = search
    ? leads.filter(l =>
        (l.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.email || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.phoneNumber || '').includes(search) ||
        (l.businessName || '').toLowerCase().includes(search.toLowerCase())
      )
    : leads;

  if (loading) return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <BackButton />
      <LoadingSkeleton count={8} />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <BackButton />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
            <Target className="w-7 h-7 text-violet-600" />
            Leads & Funil de Marketing
          </h1>
          <p className="text-sm text-gray-600 mt-1">Captura, scoring e nutrição automática</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runAutomation} disabled={runningAutomation}>
            {runningAutomation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Executar Automação
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="w-4 h-4" /> Novo Lead
          </Button>
        </div>
      </div>

      {/* Add Lead Form */}
      {showAddForm && (
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Adicionar Lead Manualmente</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input placeholder="Nome" value={newLead.name} onChange={e => setNewLead({ ...newLead, name: e.target.value })} />
            <Input placeholder="Email" value={newLead.email} onChange={e => setNewLead({ ...newLead, email: e.target.value })} />
            <Input placeholder="Telefone" value={newLead.phoneNumber} onChange={e => setNewLead({ ...newLead, phoneNumber: e.target.value })} />
            <Input placeholder="Nome do Negócio" value={newLead.businessName} onChange={e => setNewLead({ ...newLead, businessName: e.target.value })} />
            <select
              className="h-10 rounded-md border border-gray-300 px-3 text-sm"
              value={newLead.segment}
              onChange={e => setNewLead({ ...newLead, segment: e.target.value })}
            >
              <option value="">Segmento...</option>
              {['restaurantes', 'delivery', 'franquias', 'pizzaria', 'hamburgueria', 'japones', 'lanchonete', 'doceria', 'marmitaria', 'acai', 'bar'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <Button onClick={addLead} disabled={addingLead}>
              {addingLead ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
            </Button>
          </div>
        </Card>
      )}

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
              <Users className="w-4 h-4" /> Total Leads
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
              <Star className="w-4 h-4 text-blue-500" /> Novos
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Qualificados
            </div>
            <p className="text-2xl font-bold text-emerald-600">{stats.qualified}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
              <Target className="w-4 h-4 text-green-500" /> Convertidos
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.converted}</p>
            <p className="text-xs text-gray-400">Taxa: {stats.conversionRate}%</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
              <BarChart3 className="w-4 h-4 text-violet-500" /> Score Médio
            </div>
            <p className="text-2xl font-bold text-violet-600">{stats.avgScore}</p>
          </Card>
        </div>
      )}

      {/* Source + Segment Distribution */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-3">Leads por Fonte</h3>
            <div className="space-y-2">
              {Object.entries(stats.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => {
                  const info = sourceLabels[source] || { label: source, color: 'bg-gray-100 text-gray-700' };
                  const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(0) : '0';
                  return (
                    <div key={source} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs ${info.color}`}>{info.label}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-sm font-medium w-8 text-right">{count}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-3">Leads por Segmento</h3>
            <div className="space-y-2">
              {stats.bySegment.map(({ segment, count }) => {
                const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(0) : '0';
                return (
                  <div key={segment} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{segment}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
              {stats.bySegment.length === 0 && (
                <p className="text-xs text-gray-400">Nenhum segmento definido ainda</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome, email, telefone..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          value={filter.status}
          onChange={e => setFilter({ ...filter, status: e.target.value })}
        >
          <option value="">Todos Status</option>
          {Object.entries(statusLabels).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          value={filter.source}
          onChange={e => setFilter({ ...filter, source: e.target.value })}
        >
          <option value="">Todas Fontes</option>
          {Object.entries(sourceLabels).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          value={sort}
          onChange={e => setSort(e.target.value)}
        >
          <option value="recent">Mais Recentes</option>
          <option value="score">Maior Score</option>
          <option value="name">Nome A-Z</option>
        </select>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Leads List */}
      <div className="space-y-2">
        {filteredLeads.length === 0 && (
          <Card className="p-8 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Nenhum lead encontrado</p>
            <p className="text-xs text-gray-400 mt-1">Leads são capturados automaticamente via WhatsApp, landing pages e campanhas PPC</p>
          </Card>
        )}

        {filteredLeads.map(lead => {
          const srcInfo = sourceLabels[lead.source] || { label: lead.source, color: 'bg-gray-100 text-gray-700' };
          const SrcIcon = srcInfo.icon || Globe;
          const statusInfo = statusLabels[lead.status] || { label: lead.status, color: 'bg-gray-100' };
          const isExpanded = expandedId === lead.id;

          return (
            <Card key={lead.id} className="p-4 hover:shadow-md transition-shadow">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : lead.id)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <ScoreBadge score={lead.score} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {lead.name || lead.businessName || lead.phoneNumber || lead.email || 'Lead anônimo'}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${srcInfo.color}`}>
                        <SrcIcon className="w-3 h-3 mr-1" />
                        {srcInfo.label}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${statusInfo.color}`}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                      {lead.phoneNumber && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phoneNumber}</span>}
                      {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
                      {lead.businessName && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{lead.businessName}</span>}
                      {lead.segment && <span className="capitalize">{lead.segment}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 hidden sm:inline">
                    {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Status</label>
                      <select
                        className="mt-1 w-full h-8 rounded border border-gray-300 px-2 text-xs"
                        value={lead.status}
                        onChange={e => updateLead(lead.id, { status: e.target.value })}
                      >
                        {Object.entries(statusLabels).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Estágio</label>
                      <select
                        className="mt-1 w-full h-8 rounded border border-gray-300 px-2 text-xs"
                        value={lead.stage}
                        onChange={e => updateLead(lead.id, { stage: e.target.value })}
                      >
                        {Object.entries(stageLabels).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Score</label>
                      <Input
                        type="number" min="0" max="100"
                        className="mt-1 h-8 text-xs"
                        defaultValue={lead.score}
                        onBlur={e => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val !== lead.score) updateLead(lead.id, { score: val });
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Tentativas Contato</label>
                      <p className="text-sm font-medium mt-1">{lead.contactAttempts}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Notas</label>
                      <textarea
                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs min-h-[60px]"
                        defaultValue={lead.notes || ''}
                        placeholder="Anotações sobre o lead..."
                        onBlur={e => {
                          if (e.target.value !== (lead.notes || '')) updateLead(lead.id, { notes: e.target.value });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-500">Fonte Detalhe</label>
                        <p className="text-xs">{lead.sourceDetail || '—'}</p>
                      </div>
                      {lead.utmCampaign && (
                        <div>
                          <label className="text-xs text-gray-500">Campanha</label>
                          <p className="text-xs">{lead.utmCampaign}</p>
                        </div>
                      )}
                      {lead.convertedAt && (
                        <div>
                          <label className="text-xs text-gray-500">Convertido em</label>
                          <p className="text-xs">{new Date(lead.convertedAt).toLocaleDateString('pt-BR')}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateLead(lead.id, {
                        contactAttempts: lead.contactAttempts + 1,
                        lastContactAt: new Date().toISOString(),
                        status: 'CONTACTED',
                      })}
                    >
                      <Phone className="w-3 h-3 mr-1" /> Registrar Contato
                    </Button>
                    {lead.status !== 'CONVERTED' && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => updateLead(lead.id, { status: 'CONVERTED' })}
                      >
                        <Target className="w-3 h-3 mr-1" /> Marcar Convertido
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
