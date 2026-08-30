'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ChevronUp,
  MessageSquare,
  Plus,
  Filter,
  Clock,
  Rocket,
  CheckCircle2,
  Lightbulb,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type FeatureRequest = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  category?: string | null;
  status: string;
  priority: string;
  voteCount: number;
  userVoted?: boolean;
  createdAt: string;
  plannedFor?: string | null;
  targetRelease?: string | null;
  releasedAt?: string | null;
  createdBy?: { id: string; name?: string | null } | null;
};

const statusMeta: Record<string, { label: string; color: string; icon: any }> = {
  OPEN: { label: 'Abertas', color: 'bg-gray-100 text-gray-700', icon: Lightbulb },
  UNDER_REVIEW: { label: 'Em analise', color: 'bg-blue-100 text-blue-700', icon: MessageSquare },
  PLANNED: { label: 'Planejadas', color: 'bg-violet-100 text-violet-700', icon: Clock },
  IN_PROGRESS: { label: 'Em construcao', color: 'bg-amber-100 text-amber-700', icon: Rocket },
  SHIPPED: { label: 'Entregues', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
};

const categoryOptions = ['PEDIDOS', 'ESTOQUE', 'FINANCEIRO', 'COZINHA', 'CLIENTES', 'RELATORIOS', 'INTEGRACOES', 'MOBILE', 'GERAL'];

export default function RoadmapPage() {
  const { data: session } = useSession() || {};
  const [items, setItems] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'votes' | 'recent'>('votes');
  const [category, setCategory] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('GERAL');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('sort', sort);
      if (category) q.set('category', category);
      const r = await fetch('/api/feature-requests?' + q.toString());
      const data = await r.json();
      setItems(data.items || []);
    } catch {
      toast.error('Erro ao carregar roadmap');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, category]);

  const handleVote = async (slug: string) => {
    if (!session) {
      toast.info('Entre para votar');
      return;
    }
    try {
      const r = await fetch(`/api/feature-requests/${slug}/vote`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Falha');
      setItems((prev) =>
        prev.map((it) =>
          it.slug === slug
            ? { ...it, voteCount: data.voteCount, userVoted: data.voted }
            : it
        )
      );
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao votar');
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || newTitle.length < 5) {
      toast.error('Titulo muito curto');
      return;
    }
    if (!session) {
      toast.info('Entre para sugerir');
      return;
    }
    setCreating(true);
    try {
      const r = await fetch('/api/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, description: newDesc, category: newCategory }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Falha');
      }
      toast.success('Ideia registrada!');
      setShowCreate(false);
      setNewTitle('');
      setNewDesc('');
      setNewCategory('GERAL');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar');
    } finally {
      setCreating(false);
    }
  };

  const grouped: Record<string, FeatureRequest[]> = {
    OPEN: [],
    UNDER_REVIEW: [],
    PLANNED: [],
    IN_PROGRESS: [],
    SHIPPED: [],
  };
  items.forEach((it) => {
    if (grouped[it.status]) grouped[it.status].push(it);
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 pb-20">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">
            <Rocket className="h-4 w-4" /> Roadmap publico
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">O que estamos construindo</h1>
              <p className="text-gray-600 mt-1 max-w-2xl">
                Vote nas ideias que você mais quer ver, ou sugira uma nova.
                Priorizamos baseado em demanda real dos clientes.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 shadow-md shadow-blue-500/20 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" /> Sugerir ideia
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Filter className="h-4 w-4" /> Filtros
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="votes">Mais votadas</option>
            <option value="recent">Mais recentes</option>
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">Todas as categorias</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <Link
            href="/feedback/share"
            className="ml-auto text-sm text-blue-600 hover:underline"
          >
            Enviar outro feedback →
          </Link>
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando roadmap...
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center">
            <Lightbulb className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-semibold">Nenhuma ideia ainda</p>
            <p className="text-sm text-gray-500 mt-1">Seja o primeiro a sugerir.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {(['OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'SHIPPED'] as const).map((st) => {
              const meta = statusMeta[st];
              const Icon = meta.icon;
              const list = grouped[st];
              return (
                <div key={st} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className={cn('px-4 py-3 flex items-center justify-between', meta.color)}>
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      <Icon className="h-4 w-4" /> {meta.label}
                    </div>
                    <span className="text-xs">{list.length}</span>
                  </div>
                  <div className="p-3 space-y-2 max-h-[600px] overflow-y-auto">
                    {list.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Nada aqui</p>
                    )}
                    {list.map((it) => (
                      <div
                        key={it.id}
                        className="border border-gray-100 rounded-lg p-3 hover:border-blue-200 hover:shadow-sm transition"
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => handleVote(it.slug)}
                            className={cn(
                              'flex flex-col items-center px-2 py-1 rounded-lg border transition',
                              it.userVoted
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300'
                            )}
                          >
                            <ChevronUp className="h-4 w-4" />
                            <span className="text-xs font-semibold">{it.voteCount}</span>
                          </button>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900 mb-1 truncate">
                              {it.title}
                            </h3>
                            {it.description && (
                              <p className="text-xs text-gray-500 line-clamp-2">{it.description}</p>
                            )}
                            {it.category && (
                              <span className="mt-2 inline-block text-[10px] uppercase tracking-wide font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {it.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Sugerir ideia</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>
            <div className="p-5 space-y-3">
              {!session && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  Voce precisa estar logado para sugerir ideias.
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Titulo</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Exportar relatorio em Excel"
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Descricao</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Descreva como essa melhoria te ajudaria"
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Categoria</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={!session || creating || !newTitle.trim()}
                className="flex-1 rounded-lg bg-blue-500 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {creating ? 'Enviando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
