'use client';
// @ts-nocheck

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Users,
  Trash2,
  RefreshCw,
  AlertCircle,
  PlayCircle,
} from 'lucide-react';

const RECIPIENT_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  SENDING: 'bg-blue-100 text-blue-700',
  SENT: 'bg-indigo-100 text-indigo-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800',
  READ: 'bg-purple-100 text-purple-800',
  FAILED: 'bg-red-100 text-red-700',
  SKIPPED: 'bg-yellow-100 text-yellow-700',
};

export default function CampaignDetailPage() {
  const { id } = useParams() as any;
  const router = useRouter();
  const [campaign, setCampaign] = useState<any>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/messaging/campaigns/${id}`);
      const d = await res.json();
      if (res.ok) {
        setCampaign(d.campaign);
        setStats(d.stats || {});
      } else toast.error(d.error || 'Erro');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [id]);

  const send = async () => {
    if (!confirm('Confirmar envio desta campanha agora?')) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/messaging/campaigns/${id}/send`, { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        toast.success(`Enviadas ${d.sent} • Falhas ${d.failed}${d.done ? ' • Campanha concluída' : ''}`);
        load();
      } else toast.error(d.error || 'Erro');
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!confirm('Excluir esta campanha (e todos os destinatários)?')) return;
    const res = await fetch(`/api/admin/messaging/campaigns/${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (res.ok) {
      toast.success('Excluída');
      router.push('/admin/messaging/campaigns');
    } else toast.error(d.error || 'Erro');
  };

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!campaign) return <div className="p-6">Campanha não encontrada.</div>;

  const pending = stats.PENDING || 0;
  const sent = stats.SENT || 0;
  const delivered = stats.DELIVERED || 0;
  const read = stats.READ || 0;
  const failed = stats.FAILED || 0;
  const total = campaign.totalRecipients;
  const progress = total ? Math.round(((total - pending) / total) * 100) : 0;

  return (
    <div className="container mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">{campaign.name}</h1>
            <p className="text-sm text-gray-600 mt-1">{campaign.description || 'Sem descrição.'}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge className={`border-0 ${campaign.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : campaign.status === 'RUNNING' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{campaign.status}</Badge>
              <Badge variant="outline">{campaign.provider}</Badge>
              <Badge variant="outline">Template: {campaign.template?.displayName}</Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" />Atualizar</Button>
          {pending > 0 && campaign.status !== 'CANCELLED' && (
            <Button onClick={send} disabled={sending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Enviar agora
            </Button>
          )}
          {campaign.status !== 'RUNNING' && (
            <Button variant="outline" size="sm" onClick={remove} className="gap-2 text-red-600 border-red-200 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: total, color: 'text-gray-900' },
          { label: 'Pendentes', value: pending, color: 'text-gray-600' },
          { label: 'Enviadas', value: sent, color: 'text-indigo-600' },
          { label: 'Entregues', value: delivered, color: 'text-emerald-600' },
          { label: 'Lidas', value: read, color: 'text-purple-600' },
          { label: 'Falhas', value: failed, color: 'text-red-600' },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className="text-[11px] text-gray-500">{s.label}</div>
            <div className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">Progresso</span>
          <span className="text-sm text-gray-600">{progress}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </Card>

      {/* Recipients table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" />Destinatários ({campaign.recipients?.length || 0})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="text-left p-2 font-medium">Telefone</th>
                <th className="text-left p-2 font-medium">Nome</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Enviada</th>
                <th className="text-left p-2 font-medium">Entregue</th>
                <th className="text-left p-2 font-medium">Lida</th>
                <th className="text-left p-2 font-medium">Erro</th>
              </tr>
            </thead>
            <tbody>
              {(campaign.recipients || []).map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-mono text-xs">{r.phoneNumber}</td>
                  <td className="p-2">{r.name || '—'}</td>
                  <td className="p-2">
                    <Badge className={`${RECIPIENT_STATUS_COLORS[r.status] || ''} border-0 text-xs`}>{r.status}</Badge>
                  </td>
                  <td className="p-2 text-xs text-gray-600">{r.sentAt ? new Date(r.sentAt).toLocaleString('pt-BR') : '—'}</td>
                  <td className="p-2 text-xs text-gray-600">{r.deliveredAt ? new Date(r.deliveredAt).toLocaleString('pt-BR') : '—'}</td>
                  <td className="p-2 text-xs text-gray-600">{r.readAt ? new Date(r.readAt).toLocaleString('pt-BR') : '—'}</td>
                  <td className="p-2 text-xs text-red-600">{r.errorMessage || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
