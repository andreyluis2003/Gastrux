'use client';

import { useEffect, useState } from 'react';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import {
  Rocket,
  Filter,
  Loader2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';

type FeatureRequest = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  category?: string | null;
  status: string;
  priority: string;
  voteCount: number;
  isPublic: boolean;
  estimatedEffort?: string | null;
  targetRelease?: string | null;
  plannedFor?: string | null;
  releasedAt?: string | null;
  createdAt: string;
  createdBy?: { id: string; name?: string | null; email?: string | null } | null;
};

const statusOptions = ['OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DECLINED'];
const priorityOptions = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  NORMAL: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-amber-100 text-amber-700',
  CRITICAL: 'bg-rose-100 text-rose-700',
};

const statusColors: Record<string, string> = {
  OPEN: 'bg-gray-100 text-gray-700',
  UNDER_REVIEW: 'bg-blue-100 text-blue-700',
  PLANNED: 'bg-violet-100 text-violet-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  SHIPPED: 'bg-emerald-100 text-emerald-700',
  DECLINED: 'bg-rose-100 text-rose-700',
};

export default function AdminRoadmapPage() {
  const [items, setItems] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('sort', 'votes');
      if (filterStatus) q.set('status', filterStatus);
      const r = await fetch('/api/feature-requests?' + q.toString());
      const data = await r.json();
      setItems(data.items || []);
    } catch {
      toast.error('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const updateItem = async (slug: string, payload: any) => {
    try {
      const r = await fetch(`/api/feature-requests/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error('Falha');
      toast.success('Atualizado');
      load();
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <main className="flex-1 p-4 sm:p-6 md:p-8 md:ml-64">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Rocket className="h-7 w-7 text-blue-500" /> Roadmap
            </h1>
            <p className="text-gray-600 mt-1">Gerencie prioridades, status e releases das features</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Filter className="h-4 w-4" /> Filtros
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5"
              >
                <option value="">Todos status</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <a
                href="/roadmap"
                target="_blank"
                rel="noopener"
                className="ml-auto text-sm text-blue-600 hover:underline"
              >
                Ver roadmap publico →
              </a>
            </div>

            {loading ? (
              <div className="py-20 flex items-center justify-center text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
              </div>
            ) : items.length === 0 ? (
              <div className="py-20 text-center">
                <Rocket className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600 font-semibold">Nenhuma feature request</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((it) => {
                  const isOpen = expanded === it.id;
                  return (
                    <div key={it.id}>
                      <div
                        onClick={() => setExpanded(isOpen ? null : it.id)}
                        className="p-4 cursor-pointer flex items-start gap-3 hover:bg-gray-50 transition"
                      >
                        <div className="flex flex-col items-center bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 min-w-[44px]">
                          <ChevronUp className="h-4 w-4 text-gray-500" />
                          <span className="text-sm font-semibold text-gray-800">{it.voteCount}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-sm font-semibold text-gray-900">{it.title}</h3>
                            {!it.isPublic && (
                              <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                <EyeOff className="h-3 w-3" /> Privado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${statusColors[it.status]}`}>
                              {it.status}
                            </span>
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${priorityColors[it.priority]}`}>
                              {it.priority}
                            </span>
                            {it.category && (
                              <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {it.category}
                              </span>
                            )}
                            {it.plannedFor && (
                              <span className="text-[10px] text-gray-500">
                                Planejado: {new Date(it.plannedFor).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                          {it.description && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{it.description}</p>
                          )}
                        </div>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-gray-400 mt-1" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400 mt-1" />
                        )}
                      </div>

                      {isOpen && (
                        <EditPanel item={it} onSave={(p) => updateItem(it.slug, p)} />
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

function EditPanel({ item, onSave }: { item: FeatureRequest; onSave: (p: any) => void }) {
  const [status, setStatus] = useState(item.status);
  const [priority, setPriority] = useState(item.priority);
  const [isPublic, setIsPublic] = useState(item.isPublic);
  const [effort, setEffort] = useState(item.estimatedEffort || '');
  const [plannedFor, setPlannedFor] = useState(
    item.plannedFor ? item.plannedFor.slice(0, 10) : ''
  );
  const [targetRelease, setTargetRelease] = useState(item.targetRelease || '');

  return (
    <div className="bg-gray-50 border-t border-gray-100 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Prioridade</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            {priorityOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Esforco estimado</label>
          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">--</option>
            <option value="XS">XS (horas)</option>
            <option value="S">S (1-2 dias)</option>
            <option value="M">M (1 semana)</option>
            <option value="L">L (2+ semanas)</option>
            <option value="XL">XL (1 mes+)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Release alvo</label>
          <input
            value={targetRelease}
            onChange={(e) => setTargetRelease(e.target.value)}
            placeholder="Ex: v2.3"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Planejado para</label>
          <input
            type="date"
            value={plannedFor}
            onChange={(e) => setPlannedFor(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700 inline-flex items-center gap-1">
              <Eye className="h-4 w-4" /> Publico no roadmap
            </span>
          </label>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() =>
            onSave({
              status,
              priority,
              isPublic,
              estimatedEffort: effort || null,
              targetRelease: targetRelease || null,
              plannedFor: plannedFor ? new Date(plannedFor).toISOString() : null,
            })
          }
          className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
        >
          <Save className="h-4 w-4" /> Salvar
        </button>
      </div>
    </div>
  );
}
