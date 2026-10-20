'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Mail, RefreshCw, Send, Eye, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  restaurantName: string;
  createdAt: string;
}

interface Step {
  key: string;
  day: number;
  label: string;
  subject: string;
  pending: Recipient[];
}

interface RunResult {
  sent: number;
  failed: number;
  byStep: Record<string, { sent: number; failed: number }>;
}

/**
 * Plataforma › Onboarding (rewritten 2026-10-19 with the Resend sequence, lib/onboarding/emails.ts): who each tip
 * e-mail goes to on the next run, the e-mail itself, and "Enviar agora". The VPS cron runs it every morning.
 */
export default function AdminOnboardingPage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [senderConfigured, setSenderConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/email/onboarding-sequence');
      if (!res.ok) throw new Error('Falha ao carregar');
      const data = await res.json();
      setSteps(data.steps);
      setSenderConfigured(data.senderConfigured);
    } catch (e) {
      toast.error('Não foi possível carregar os e-mails pendentes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openPreview = async (key: string) => {
    try {
      const res = await fetch(`/api/email/onboarding-sequence?preview=${key}`);
      if (!res.ok) throw new Error();
      setPreview(await res.json());
    } catch {
      toast.error('Não foi possível abrir o e-mail');
    }
  };

  const total = steps.reduce((s, st) => s + st.pending.length, 0);

  const runNow = async () => {
    if (!window.confirm(`Enviar agora ${total} e-mail${total === 1 ? '' : 's'} para os donos listados?`)) return;
    setSending(true);
    try {
      const res = await fetch('/api/email/onboarding-sequence', { method: 'POST' });
      if (!res.ok) throw new Error();
      const data: RunResult = await res.json();
      setLastRun(data);
      if (data.failed) toast.error(`${data.sent} enviados, ${data.failed} com falha`);
      else toast.success(`${data.sent} e-mail${data.sent === 1 ? '' : 's'} enviado${data.sent === 1 ? '' : 's'}`);
      load();
    } catch {
      toast.error('Erro ao enviar os e-mails');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Mail className="w-6 h-6" /> Onboarding por e-mail
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quatro dicas para o dono nas duas primeiras semanas. Saem sozinhas todo dia às 10h.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button onClick={runNow} disabled={sending || loading || total === 0 || !senderConfigured}>
            <Send className="w-4 h-4 mr-2" />
            {sending ? 'Enviando...' : `Enviar agora${total ? ` (${total})` : ''}`}
          </Button>
        </div>
      </div>

      {!senderConfigured && (
        <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>Nenhum envio de e-mail configurado (RESEND_API_KEY). Nada sai até a variável existir no servidor.</p>
        </div>
      )}

      {lastRun && (
        <p className="text-sm text-muted-foreground">
          Último envio: {lastRun.sent} enviado{lastRun.sent === 1 ? '' : 's'}
          {lastRun.failed ? `, ${lastRun.failed} com falha (tentam de novo no próximo envio)` : ''}.
        </p>
      )}

      <div className="space-y-4">
        {steps.map((s) => (
          <Card key={s.key}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs uppercase text-muted-foreground">Dia {s.day} da conta</p>
                  <CardTitle className="text-base">{s.label}</CardTitle>
                  <p className="text-sm text-muted-foreground break-words">Assunto: {s.subject}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openPreview(s.key)}>
                  <Eye className="w-4 h-4 mr-1" /> Ver e-mail
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {s.pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguém para receber agora.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {s.pending.map((r) => (
                    <li key={r.id} className="py-2 flex flex-wrap justify-between gap-x-4 gap-y-1">
                      <span className="min-w-0 break-words">
                        <strong>{r.name || r.email}</strong> · {r.restaurantName}
                      </span>
                      <span className="text-muted-foreground break-all">{r.email}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem recebe</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Só o dono de um restaurante que não é conta interna. Equipe, contas de teste, a equipe da plataforma e quem
            tocou em &quot;Parar as dicas&quot; ficam de fora.
          </p>
          <p>
            Cada e-mail sai no seu dia da conta e só nos 3 dias seguintes: uma conta antiga nunca recebe a série de uma
            vez. O fim do teste é avisado à parte (dias 23, 27 e 30).
          </p>
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="break-words pr-6">{preview?.subject}</DialogTitle>
          </DialogHeader>
          {preview && (
            <iframe title="Prévia do e-mail" srcDoc={preview.html} sandbox="" className="h-[65vh] w-full rounded border bg-white" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
