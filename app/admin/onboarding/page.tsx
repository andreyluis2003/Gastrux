'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, RefreshCw, Send, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';

interface PendingResponse {
  pending: {
    welcome: number;
    day1: number;
    day14: number;
    day21: number;
    trialEnding: number;
  };
}

interface SendResponse {
  success: boolean;
  summary: {
    total: number;
    sent: number;
    failed: number;
    byDay: Record<string, number>;
  };
}

const STEPS = [
  { key: 'welcome', label: 'Boas-vindas', day: 'Dia 0' },
  { key: 'day1', label: 'Dicas rápidas', day: 'Dia 1' },
  { key: 'day14', label: 'Features avançadas', day: 'Dia 14' },
  { key: 'day21', label: 'Upgrade (Pro)', day: 'Dia 21' },
  { key: 'trialEnding', label: 'Trial terminando', day: '3 dias antes' },
];

export default function AdminOnboardingPage() {
  const [pending, setPending] = useState<PendingResponse['pending'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastRun, setLastRun] = useState<SendResponse['summary'] | null>(null);

  const loadPending = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/email/onboarding-sequence');
      if (!res.ok) throw new Error('Falha ao carregar');
      const data: PendingResponse = await res.json();
      setPending(data.pending);
    } catch (e) {
      toast.error('Não foi possível carregar estatísticas');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  const runSweep = async () => {
    if (!confirm('Enviar todos os emails pendentes agora?')) return;
    setSending(true);
    try {
      const res = await fetch('/api/email/onboarding-sequence', {
        method: 'POST',
        headers: { 'x-internal-trigger': 'admin-dashboard' },
      });
      if (!res.ok) throw new Error('Falha ao enviar');
      const data: SendResponse = await res.json();
      setLastRun(data.summary);
      toast.success(`${data.summary.sent} emails enviados`);
      loadPending();
    } catch (e) {
      toast.error('Erro no disparo de emails');
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const totalPending = pending
    ? pending.welcome + pending.day1 + pending.day14 + pending.day21 + pending.trialEnding
    : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Mail className="w-6 h-6" /> Email Onboarding
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sequência automática: boas-vindas → dicas → features → upgrade
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadPending} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button onClick={runSweep} disabled={sending || totalPending === 0}>
            <Send className="w-4 h-4 mr-2" />
            {sending ? 'Enviando...' : `Disparar agora${totalPending ? ` (${totalPending})` : ''}`}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-5 h-5" /> Emails pendentes por etapa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {STEPS.map((s) => (
              <div
                key={s.key}
                className="rounded-lg border bg-card p-4 text-center transition hover:shadow-md"
              >
                <div className="text-xs text-muted-foreground uppercase">{s.day}</div>
                <div className="text-xs font-medium mt-1">{s.label}</div>
                <div className="text-3xl font-bold mt-2 text-primary">
                  {loading
                    ? '—'
                    : (pending?.[s.key as keyof typeof pending] ?? 0).toLocaleString('pt-BR')}
                </div>
                <div className="text-xs text-muted-foreground mt-1">pendentes</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {lastRun && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-5 h-5" /> Último disparo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{lastRun.total}</div>
                <div className="text-xs text-muted-foreground">total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">{lastRun.sent}</div>
                <div className="text-xs text-muted-foreground">enviados</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{lastRun.failed}</div>
                <div className="text-xs text-muted-foreground">falhas</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(lastRun.byDay).map(([day, count]) => (
                <span
                  key={day}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted"
                >
                  <strong>{day}:</strong> {count}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Cada etapa da sequência é disparada automaticamente quando:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Boas-vindas (Dia 0)</strong>: após o cadastro do usuário</li>
            <li><strong>Dia 1</strong>: 24 horas depois do cadastro</li>
            <li><strong>Dia 14</strong>: 14 dias após o cadastro</li>
            <li><strong>Dia 21</strong>: 21 dias após o cadastro (com oferta de upgrade)</li>
            <li><strong>Trial terminando</strong>: 3 dias antes do fim do trial</li>
          </ul>
          <p className="pt-2">
            Configure uma <strong>tarefa agendada</strong> para chamar{' '}
            <code className="bg-muted px-1 rounded">POST /api/email/onboarding-sequence</code>{' '}
            uma vez por dia com o header{' '}
            <code className="bg-muted px-1 rounded">x-internal-trigger: cron</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
