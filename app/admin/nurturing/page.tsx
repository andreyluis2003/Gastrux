// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Mail,
  Users,
  TrendingUp,
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Loader2,
  Calculator,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  source: string;
  stage: string;
  score: number;
  status: string;
  contactAttempts: number;
  createdAt: string;
  lastContactAt: string | null;
  metadata: any;
}

interface NurturingContent {
  day: number;
  subject: string;
  message: string;
  type: string;
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  CAPTURED: { label: 'Capturado', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  WELCOME_SENT: { label: 'Boas-vindas', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ENGAGED: { label: 'Engajado', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  CONVERSION_PENDING: { label: 'Conversão', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  CONVERTED: { label: 'Convertido', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
};

export default function NurturingPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sequence, setSequence] = useState<NurturingContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [tab, setTab] = useState<'pipeline' | 'conteudo'>('pipeline');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [leadsRes, contentRes] = await Promise.all([
        fetch('/api/admin/marketing/leads?source=CALCULATOR'),
        fetch('/api/admin/nurturing/content'),
      ]);
      if (leadsRes.ok) {
        const ld = await leadsRes.json();
        setLeads(ld.leads || ld.data || []);
      }
      if (contentRes.ok) {
        const ct = await contentRes.json();
        setSequence(ct.sequence || []);
      }
    } catch {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteNurturing() {
    setExecuting(true);
    try {
      const res = await fetch('/api/admin/nurturing/execute', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Nurturing executado: ${data.results?.leadsNurtured || 0} leads avançados`);
        fetchData();
      } else {
        toast.error(data.error || 'Erro');
      }
    } catch {
      toast.error('Erro ao executar nurturing');
    } finally {
      setExecuting(false);
    }
  }

  // Stats
  const totalLeads = leads.length;
  const byStage = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.stage] = (acc[l.stage] || 0) + 1;
    return acc;
  }, {});
  const avgScore = totalLeads > 0 ? Math.round(leads.reduce((s, l) => s + l.score, 0) / totalLeads) : 0;
  const converted = leads.filter((l) => l.status === 'CONVERTED').length;
  const conversionRate = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : '0';

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="h-6 w-6 text-orange-500" /> Lead Nurturing
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Sequência educativa para leads da calculadora
          </p>
        </div>
        <Button
          onClick={handleExecuteNurturing}
          disabled={executing}
          className="bg-orange-600 hover:bg-orange-700 text-white"
        >
          {executing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          Executar Nurturing
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users className="h-5 w-5" />} label="Total Leads" value={String(totalLeads)} color="blue" />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Score Médio" value={String(avgScore)} color="purple" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Convertidos" value={String(converted)} color="green" />
        <StatCard icon={<Calculator className="h-5 w-5" />} label="Taxa Conversão" value={`${conversionRate}%`} color="orange" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('pipeline')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'pipeline'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
          }`}
        >
          Pipeline
        </button>
        <button
          onClick={() => setTab('conteudo')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'conteudo'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
          }`}
        >
          Conteúdo
        </button>
      </div>

      {tab === 'pipeline' ? (
        /* ══ Pipeline ══ */
        <div className="space-y-4">
          {/* Stage funnel */}
          <div className="flex flex-wrap gap-3">
            {Object.entries(STAGE_LABELS).map(([key, { label, color }]) => (
              <div
                key={key}
                className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${color}`}
              >
                {label}
                <span className="bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-full text-xs font-bold">
                  {byStage[key] || 0}
                </span>
              </div>
            ))}
          </div>

          {/* Lead list */}
          {leads.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Calculator className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhum lead da calculadora ainda</p>
              <p className="text-sm mt-1">Compartilhe a calculadora para captar leads</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              {leads.map((lead) => {
                const stage = STAGE_LABELS[lead.stage] || { label: lead.stage, color: 'bg-gray-100 text-gray-700' };
                const meta = lead.metadata as any;
                return (
                  <div key={lead.id} className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {lead.email || lead.name || 'Lead anônimo'}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {meta?.faturamentoMes && (
                          <span>Fat: R$ {Number(meta.faturamentoMes).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                        )}
                        {meta?.cmvReal && (
                          <span>CMV: {(Number(meta.cmvReal) * 100).toFixed(0)}%</span>
                        )}
                        <span>Score: {lead.score}</span>
                        <span>Contatos: {lead.contactAttempts}</span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${stage.color}`}>
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ══ Conteúdo da Sequência ══ */
        <div className="space-y-4">
          {sequence.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center text-sm font-bold">
                  {idx + 1}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{item.subject}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Dia {item.day} • Tipo: {item.type}
                  </p>
                </div>
              </div>
              <pre className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                {item.message}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${colors[color]} mb-2`}>
        {icon}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
