'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  Sparkles, TrendingUp, Package, Users, UtensilsCrossed, DollarSign,
  Settings, Loader2, Pin, PinOff, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react';

type InsightType = 'SALES' | 'INVENTORY' | 'CUSTOMERS' | 'MENU' | 'FINANCIAL' | 'OPERATIONAL';

interface Insight {
  id: string;
  type: InsightType;
  title: string;
  summary: string;
  content: string;
  score: number | null;
  tags: string | null;
  pinned: boolean;
  timeRange: string | null;
  createdAt: string;
}

const TYPE_META: Record<InsightType, { label: string; icon: any; color: string }> = {
  SALES: { label: 'Vendas', icon: TrendingUp, color: 'bg-blue-100 text-blue-700' },
  INVENTORY: { label: 'Estoque', icon: Package, color: 'bg-amber-100 text-amber-700' },
  CUSTOMERS: { label: 'Clientes', icon: Users, color: 'bg-violet-100 text-violet-700' },
  MENU: { label: 'Cardápio', icon: UtensilsCrossed, color: 'bg-rose-100 text-rose-700' },
  FINANCIAL: { label: 'Financeiro', icon: DollarSign, color: 'bg-emerald-100 text-emerald-700' },
  OPERATIONAL: { label: 'Operação', icon: Settings, color: 'bg-slate-100 text-slate-700' },
};

const TYPES: InsightType[] = ['SALES', 'INVENTORY', 'CUSTOMERS', 'MENU', 'FINANCIAL', 'OPERATIONAL'];

export default function AIInsightsPage() {
  const [activeType, setActiveType] = useState<InsightType>('SALES');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async (type?: InsightType) => {
    setLoading(true);
    try {
      const t = type ?? activeType;
      const res = await fetch(`/api/ai-insights?type=${t}`);
      const d = await res.json();
      setInsights(d.items || []);
    } catch (e) {
      toast.error('Erro ao carregar insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(activeType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai-insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: activeType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Falha ao gerar insight');
      } else {
        toast.success('Novo insight gerado!');
        await load(activeType);
      }
    } catch (e) {
      toast.error('Erro ao gerar insight');
    } finally {
      setGenerating(false);
    }
  };

  const togglePin = async (insight: Insight) => {
    try {
      const res = await fetch(`/api/ai-insights/${insight.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !insight.pinned }),
      });
      if (res.ok) {
        toast.success(insight.pinned ? 'Desafixado' : 'Fixado');
        load(activeType);
      }
    } catch (e) {
      toast.error('Erro');
    }
  };

  const dismiss = async (id: string) => {
    if (!confirm('Dispensar este insight?')) return;
    try {
      const res = await fetch(`/api/ai-insights/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true }),
      });
      if (res.ok) {
        toast.success('Dispensado');
        load(activeType);
      }
    } catch (e) {
      toast.error('Erro');
    }
  };

  const meta = TYPE_META[activeType];
  const Icon = meta.icon;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
              <Sparkles className="h-7 w-7 text-violet-600" />
              AI Insights
            </h1>
            <p className="text-gray-600 mt-1">Insights acionáveis gerados por IA a partir dos dados do seu restaurante</p>
          </div>
          <Button onClick={generate} disabled={generating} className="bg-violet-600 hover:bg-violet-700 text-white">
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analisando...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Gerar novo insight</>
            )}
          </Button>
        </div>

        {/* Type tabs */}
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => {
            const m = TYPE_META[t];
            const TI = m.icon;
            const active = activeType === t;
            return (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                  active
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-violet-300'
                }`}
              >
                <TI className="h-4 w-4" />
                {m.label}
              </button>
            );
          })}
        </div>

        <Card className="p-4 border-l-4" style={{ borderLeftColor: '#7C3AED' }}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${meta.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                <strong>{meta.label}:</strong> Clique em <em>Gerar novo insight</em> para analisar os últimos 30 dias.
                Você pode fixar os mais importantes e dispensar os que não são relevantes.
              </p>
            </div>
          </div>
        </Card>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        )}

        {!loading && insights.length === 0 && (
          <Card className="p-8 text-center border-dashed">
            <Sparkles className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">Nenhum insight gerado ainda para {meta.label.toLowerCase()}.</p>
            <p className="text-sm text-gray-500 mt-1">Clique em "Gerar novo insight" para começar.</p>
          </Card>
        )}

        <div className="space-y-3">
          {insights.map((ins) => {
            const tags = ins.tags ? (() => { try { return JSON.parse(ins.tags || '[]'); } catch { return []; } })() : [];
            const isExp = !!expanded[ins.id];
            return (
              <Card key={ins.id} className={`p-4 sm:p-5 ${ins.pinned ? 'border-violet-300 bg-violet-50/40' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge className={meta.color} variant="outline">{meta.label}</Badge>
                      {ins.score !== null && (
                        <Badge variant="outline" className="bg-white">
                          Score: {ins.score}
                        </Badge>
                      )}
                      {ins.pinned && (
                        <Badge className="bg-violet-100 text-violet-700" variant="outline">
                          <Pin className="h-3 w-3 mr-1" /> Fixado
                        </Badge>
                      )}
                      <span className="text-xs text-gray-500 ml-auto">
                        {new Date(ins.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {ins.title}
                    </h3>
                    <p className="text-gray-700 mt-1">{ins.summary}</p>

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tags.map((t: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => setExpanded((s) => ({ ...s, [ins.id]: !s[ins.id] }))}
                      className="mt-3 inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 font-medium"
                    >
                      {isExp ? (<><ChevronUp className="h-4 w-4" /> Ocultar detalhes</>) : (<><ChevronDown className="h-4 w-4" /> Ver detalhes</>)}
                    </button>
                    {isExp && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-800 whitespace-pre-wrap">
                        {ins.content}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => togglePin(ins)}
                      title={ins.pinned ? 'Desafixar' : 'Fixar'}
                    >
                      {ins.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismiss(ins.id)}
                      title="Dispensar"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
