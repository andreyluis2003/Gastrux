'use client';

import { useEffect, useState } from 'react';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import {
  MessageSquare,
  Star,
  Heart,
  Bug,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Filter,
  Loader2,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

type Feedback = {
  id: string;
  type: string;
  score?: number | null;
  comment?: string | null;
  page?: string | null;
  feature?: string | null;
  email?: string | null;
  status: string;
  internalNotes?: string | null;
  tags?: string | null;
  createdAt: string;
  user?: { id: string; name?: string | null; email?: string | null } | null;
};

type Stats = {
  total: number;
  npsAvg: number | null;
  csatAvg: number | null;
  cesAvg: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
};

const typeColors: Record<string, string> = {
  NPS: 'bg-blue-100 text-blue-700',
  CSAT: 'bg-pink-100 text-pink-700',
  CES: 'bg-indigo-100 text-indigo-700',
  GENERAL: 'bg-gray-100 text-gray-700',
  BUG: 'bg-rose-100 text-rose-700',
  IDEA: 'bg-violet-100 text-violet-700',
};

const statusColors: Record<string, string> = {
  NEW: 'bg-amber-100 text-amber-700',
  REVIEWING: 'bg-blue-100 text-blue-700',
  PLANNED: 'bg-violet-100 text-violet-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  RESOLVED: 'bg-emerald-100 text-emerald-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
};

const typeIcons: Record<string, any> = {
  NPS: Star,
  CSAT: Heart,
  CES: TrendingUp,
  GENERAL: MessageSquare,
  BUG: Bug,
  IDEA: Lightbulb,
};

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filterType) q.set('type', filterType);
      if (filterStatus) q.set('status', filterStatus);
      const r = await fetch('/api/feedback?' + q.toString());
      if (!r.ok) throw new Error('Falha');
      const data = await r.json();
      setItems(data.items || []);
      setStats(data.stats || null);
    } catch {
      toast.error('Erro ao carregar feedbacks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterStatus]);

  const updateStatus = async (id: string, status: string) => {
    try {
      const r = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error('Falha');
      toast.success('Status atualizado');
      load();
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const updateNotes = async (id: string, internalNotes: string) => {
    try {
      const r = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNotes }),
      });
      if (!r.ok) throw new Error('Falha');
      toast.success('Nota salva');
    } catch {
      toast.error('Erro ao salvar');
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <main className="flex-1 p-4 sm:p-6 md:p-8 md:ml-64">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Feedback dos clientes</h1>
            <p className="text-gray-600 mt-1">Triagem, analise NPS/CSAT e acao baseada em feedback</p>
          </div>

          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">NPS Score</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${stats.npsScore >= 50 ? 'text-emerald-600' : stats.npsScore >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {stats.npsScore}
                  </span>
                  {stats.npsScore >= 30 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : stats.npsScore < 0 ? (
                    <TrendingDown className="h-4 w-4 text-rose-500" />
                  ) : null}
                </div>
                <div className="mt-2 flex gap-2 text-[10px]">
                  <span className="text-emerald-600">↑ {stats.promoters} prom</span>
                  <span className="text-gray-500">→ {stats.passives} pass</span>
                  <span className="text-rose-600">↓ {stats.detractors} detr</span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">CSAT</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.csatAvg != null ? stats.csatAvg.toFixed(1) : '--'}
                  <span className="text-base text-gray-400 font-normal">/5</span>
                </p>
                <p className="text-xs text-gray-500 mt-2">{stats.byType.CSAT || 0} respostas</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total de feedbacks</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
                <div className="mt-2 flex gap-2 flex-wrap">
                  {Object.entries(stats.byType).slice(0, 3).map(([k, v]) => (
                    <span key={k} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 rounded">
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Novos sem triagem</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{stats.byStatus.NEW || 0}</p>
                <p className="text-xs text-gray-500 mt-2">Precisam revisao</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Filter className="h-4 w-4" /> Filtros
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Todos os tipos</option>
                <option value="NPS">NPS</option>
                <option value="CSAT">CSAT</option>
                <option value="CES">CES</option>
                <option value="GENERAL">Comentarios</option>
                <option value="BUG">Bugs</option>
                <option value="IDEA">Ideias</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Todos status</option>
                <option value="NEW">Novos</option>
                <option value="REVIEWING">Em analise</option>
                <option value="PLANNED">Planejado</option>
                <option value="IN_PROGRESS">Em progresso</option>
                <option value="RESOLVED">Resolvido</option>
                <option value="ARCHIVED">Arquivado</option>
              </select>
            </div>

            {loading ? (
              <div className="py-20 flex items-center justify-center text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
              </div>
            ) : items.length === 0 ? (
              <div className="py-20 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600 font-semibold">Nenhum feedback ainda</p>
                <p className="text-sm text-gray-500 mt-1">Aguardando o primeiro feedback...</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((fb) => {
                  const Icon = typeIcons[fb.type] || MessageSquare;
                  const isOpen = expanded === fb.id;
                  return (
                    <div key={fb.id} className="hover:bg-gray-50 transition">
                      <div
                        onClick={() => setExpanded(isOpen ? null : fb.id)}
                        className="p-4 cursor-pointer flex items-start gap-3"
                      >
                        <div className={`p-2 rounded-lg ${typeColors[fb.type] || 'bg-gray-100'}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${typeColors[fb.type]}`}>
                              {fb.type}
                            </span>
                            {fb.score != null && (
                              <span className="text-xs font-semibold text-gray-700">
                                Nota: {fb.score}
                              </span>
                            )}
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${statusColors[fb.status]}`}>
                              {fb.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                            {fb.comment || <span className="text-gray-400 italic">Sem comentario</span>}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(fb.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                            {(fb.user?.email || fb.email) && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {fb.user?.email || fb.email}
                              </span>
                            )}
                            {fb.page && <span>@ {fb.page}</span>}
                          </div>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-gray-400 mt-1" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400 mt-1" />
                        )}
                      </div>

                      {isOpen && (
                        <div className="px-4 pb-5 pt-0 bg-gray-50 border-t border-gray-100">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                              <select
                                value={fb.status}
                                onChange={(e) => updateStatus(fb.id, e.target.value)}
                                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
                              >
                                <option value="NEW">Novo</option>
                                <option value="REVIEWING">Em analise</option>
                                <option value="PLANNED">Planejado</option>
                                <option value="IN_PROGRESS">Em progresso</option>
                                <option value="RESOLVED">Resolvido</option>
                                <option value="ARCHIVED">Arquivado</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Nota interna</label>
                              <textarea
                                defaultValue={fb.internalNotes || ''}
                                onBlur={(e) => updateNotes(fb.id, e.target.value)}
                                placeholder="Notas internas para a equipe"
                                className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none h-16 bg-white"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
