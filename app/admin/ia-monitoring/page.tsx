'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  Activity, AlertTriangle, CheckCircle, Clock, MessageSquare, ThumbsDown, RefreshCw, Bot, Bell,
} from 'lucide-react';

interface Metrics {
  total: number; ratingCount: number; avgRating: number | null;
  thumbsDownPct: number; hallucinationPct: number; escalationPct: number;
  resolutionRate: number | null; avgResponseMs: number | null;
}
interface Alert {
  id: string; alertType: string; severity: string; title: string; description: string;
  metricValue: number | null; threshold: number | null; resolved: boolean;
  createdAt: string; notifiedAt: string | null;
}
interface Interaction {
  id: string; question: string; answer: string; rating: number | null;
  thumbsUp: boolean | null; hallucinationFlag: boolean; escalatedToHuman: boolean;
  responseTimeMs: number | null; createdAt: string; userEmail: string | null;
}

export default function AIMonitoringPage() {
  const [data, setData] = useState<{ metrics: Metrics; alerts: Alert[]; recent: Interaction[]; thresholds: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [running, setRunning] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/ai-support/metrics?hours=${hours}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error('Erro ao carregar métricas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [hours]);

  const runEvaluation = async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/ai-support/evaluate?hours=${hours}`, { method: 'POST' });
      const j = await res.json();
      if (j.skipped) toast.info(j.skipped);
      else if (j.alerts?.length) toast.warning(`${j.alerts.length} novo(s) alerta(s) gerado(s)`);
      else toast.success('Tudo dentro dos limites');
      fetchData();
    } catch {
      toast.error('Erro ao avaliar');
    } finally { setRunning(false); }
  };

  const resolveAlert = async (id: string) => {
    await fetch(`/api/ai-support/alerts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolved: true }),
    });
    fetchData();
  };

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!data) return <div className="p-6">Sem dados</div>;

  const { metrics: m, alerts, recent, thresholds: t } = data;
  const sevColor = (s: string) => s === 'critical' ? 'bg-red-100 text-red-800 border-red-300'
    : s === 'warning' ? 'bg-amber-100 text-amber-800 border-amber-300'
    : 'bg-blue-100 text-blue-800 border-blue-300';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BackButton />
            <div className="flex items-center gap-2">
              <Bot className="h-7 w-7 text-blue-600" />
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Monitoramento da IA de Suporte</h1>
                <p className="text-sm text-slate-600">Qualidade, alucinações e alertas automáticos</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="px-3 py-2 border rounded-lg text-sm">
              <option value={1}>Última 1h</option>
              <option value={24}>Últimas 24h</option>
              <option value={168}>últimos 7 dias</option>
              <option value={720}>Últimos 30 dias</option>
            </select>
            <Button onClick={fetchData} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
            <Button onClick={runEvaluation} disabled={running} className="bg-blue-600 hover:bg-blue-700" size="sm">
              <Bell className="h-4 w-4 mr-2" />{running ? 'Avaliando...' : 'Avaliar agora'}
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <KPI icon={<MessageSquare className="h-5 w-5 text-slate-600" />} label="Interações" value={m.total.toString()} />
          <KPI icon={<Activity className="h-5 w-5 text-blue-600" />} label="Nota média"
            value={m.avgRating != null ? m.avgRating.toFixed(2) : '—'}
            danger={m.avgRating != null && m.avgRating < t.minAvgRating} />
          <KPI icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} label="% Alucinações"
            value={`${m.hallucinationPct.toFixed(1)}%`}
            danger={m.hallucinationPct > t.maxHallucinationPct} />
          <KPI icon={<ThumbsDown className="h-5 w-5 text-red-600" />} label="% Negativos"
            value={`${m.thumbsDownPct.toFixed(1)}%`}
            danger={m.thumbsDownPct > t.maxThumbsDownPct} />
          <KPI icon={<MessageSquare className="h-5 w-5 text-purple-600" />} label="% Escalonados"
            value={`${m.escalationPct.toFixed(1)}%`}
            danger={m.escalationPct > t.maxEscalationPct} />
          <KPI icon={<Clock className="h-5 w-5 text-slate-600" />} label="Tempo médio"
            value={m.avgResponseMs != null ? `${(m.avgResponseMs / 1000).toFixed(1)}s` : '—'}
            danger={m.avgResponseMs != null && m.avgResponseMs > t.maxAvgResponseMs} />
        </div>

        {/* Thresholds */}
        <Card className="p-4 bg-slate-50">
          <p className="text-xs font-semibold text-slate-600 uppercase mb-2">Limites configurados</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <span>Nota mín: <strong>{t.minAvgRating}</strong></span>
            <span>Alucinações: <strong>&le; {t.maxHallucinationPct}%</strong></span>
            <span>Escalonados: <strong>&le; {t.maxEscalationPct}%</strong></span>
            <span>Negativos: <strong>&le; {t.maxThumbsDownPct}%</strong></span>
            <span>Resposta máx: <strong>{(t.maxAvgResponseMs / 1000).toFixed(0)}s</strong></span>
          </div>
        </Card>

        {/* Alerts */}
        <div>
          <h2 className="font-bold text-lg mb-2 flex items-center gap-2"><Bell className="h-5 w-5" />Alertas</h2>
          {alerts.length === 0 ? (
            <Card className="p-6 text-center text-slate-500"><CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />Nenhum alerta no momento</Card>
          ) : (
            <div className="space-y-2">
              {alerts.map(a => (
                <Card key={a.id} className={`p-4 border-l-4 ${a.resolved ? 'opacity-60' : ''} ${sevColor(a.severity).replace('bg-', 'border-l-').replace('text-', '').replace('-100', '-500').replace('border-amber-300', '').replace('border-red-300', '').replace('border-blue-300', '')}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${sevColor(a.severity)}`}>{a.severity.toUpperCase()}</span>
                        <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                        {a.notifiedAt && <span className="text-xs text-green-600">✓ Email enviado</span>}
                        {a.resolved && <span className="text-xs text-slate-500">Resolvido</span>}
                      </div>
                      <p className="font-semibold text-slate-900">{a.title}</p>
                      <p className="text-sm text-slate-700 mt-1">{a.description}</p>
                    </div>
                    {!a.resolved && (
                      <Button size="sm" variant="outline" onClick={() => resolveAlert(a.id)}><CheckCircle className="h-4 w-4 mr-1" />Marcar resolvido</Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Recent interactions */}
        <div>
          <h2 className="font-bold text-lg mb-2">Últimas interações</h2>
          {recent.length === 0 ? (
            <Card className="p-6 text-center text-slate-500">Nenhuma interação ainda</Card>
          ) : (
            <div className="space-y-2">
              {recent.map(i => (
                <Card key={i.id} className="p-3">
                  <div className="flex items-start gap-2 mb-1">
                    {i.hallucinationFlag && <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">⚠ Alucinação</span>}
                    {i.escalatedToHuman && <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">Escalonado</span>}
                    {i.thumbsUp === false && <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">👎</span>}
                    {i.thumbsUp === true && <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">👍</span>}
                    {i.rating != null && <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">{i.rating}/5</span>}
                    <span className="text-xs text-slate-500 ml-auto">{new Date(i.createdAt).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 line-clamp-1">P: {i.question}</p>
                  <p className="text-xs text-slate-600 line-clamp-2 mt-1">R: {i.answer}</p>
                  {i.userEmail && <p className="text-xs text-slate-400 mt-1">{i.userEmail}</p>}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPI({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) {
  return (
    <Card className={`p-3 ${danger ? 'border-red-300 bg-red-50' : ''}`}>
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-slate-600">{label}</span></div>
      <p className={`text-xl font-bold ${danger ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
    </Card>
  );
}
