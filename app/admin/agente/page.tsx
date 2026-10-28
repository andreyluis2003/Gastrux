'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Mail, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { STAGES } from '@/lib/admin/client-health';
import { TRIGGER_LABELS, type ActivationTrigger } from '@/lib/agents/activation/rules';

interface QueueItem {
  id: string;
  restaurantId: string;
  restaurantName: string;
  ownerName: string | null;
  email: string | null;
  whatsapp: string | null;
  stage: string;
  trigger: string;
  channel: 'EMAIL' | 'WHATSAPP';
  subject: string | null;
  text: string;
  data: { reason?: string } | null;
  /** Why the last send failed (the message stays here to try again) */
  error: string | null;
  createdAt: string;
}

const stageLabel = (stage: string) => STAGES.find((s) => s.value === stage)?.label ?? stage;
const triggerLabel = (trigger: string) => TRIGGER_LABELS[trigger as ActivationTrigger] ?? trigger;

function QueueCard({ item, onDone }: { item: QueueItem; onDone: (id: string) => void }) {
  const [text, setText] = useState(item.text);
  const [subject, setSubject] = useState(item.subject ?? '');
  const [busy, setBusy] = useState(false);
  const email = item.channel === 'EMAIL';

  async function decide(action: 'approve' | 'discard') {
    setBusy(true);
    // Opened now, while the click still counts, so the browser does not block the WhatsApp tab
    const tab = action === 'approve' && !email ? window.open('', '_blank') : null;
    try {
      const res = await fetch(`/api/admin/agent-actions/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text, subject: email ? subject : undefined }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Não foi possível concluir');
      if (out.waUrl && tab) tab.location.href = out.waUrl;
      else if (out.waUrl) window.open(out.waUrl, '_blank', 'noopener');
      toast.success(action === 'discard' ? 'Mensagem descartada' : email ? 'E-mail enviado' : 'WhatsApp aberto com a mensagem');
      onDone(item.id);
    } catch (e: any) {
      tab?.close();
      toast.error(e.message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <a href={`/admin/customers/${item.restaurantId}`} className="font-semibold hover:underline break-words">{item.restaurantName}</a>
            <p className="text-xs text-muted-foreground break-words">
              {item.ownerName || 'Dono sem nome'} · {email ? item.email : item.whatsapp} · {stageLabel(item.stage)}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${email ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
            {email ? <Mail className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
            {email ? 'E-mail' : 'WhatsApp'}
          </span>
        </div>
        <p className="text-sm">
          <span className="font-medium">{triggerLabel(item.trigger)}</span>
          {item.data?.reason && <span className="text-muted-foreground">: {item.data.reason}</span>}
        </p>
        {item.error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">Não foi enviado: {item.error}. Tente de novo.</p>}
        {email && <Input aria-label="Assunto" value={subject} onChange={(e) => setSubject(e.target.value)} />}
        <textarea
          aria-label="Mensagem"
          className="w-full min-h-[160px] rounded-md border p-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {!email && <p className="text-xs text-muted-foreground">{text.length} de 700 caracteres</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-1" disabled={busy || !text.trim()} onClick={() => decide('approve')}>
            {email ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
            {email ? 'Enviar e-mail' : 'Abrir no WhatsApp'}
          </Button>
          <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => decide('discard')}>
            <Trash2 className="h-4 w-4" /> Descartar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Criada em {new Date(item.createdAt).toLocaleString('pt-BR')}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Plataforma › Fila do agente (spec 2026-10-27): the activation agent's drafts for trial accounts. Nothing
 * reaches a client until the team approves it here; the WhatsApp opens ready to send.
 */
export default function AgentQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/agent-actions?status=DRAFT');
      if (!res.ok) throw new Error();
      setItems((await res.json()).actions);
    } catch {
      toast.error('Não foi possível carregar a fila');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><Bot className="h-6 w-6" /> Fila do agente</h1>
          <p className="text-sm text-muted-foreground">Mensagens para clientes em teste. Revise, edite se quiser, e envie.</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1" onClick={load} disabled={loading}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nada para aprovar agora</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <QueueCard key={item.id} item={item} onDone={(id) => setItems((list) => list.filter((x) => x.id !== id))} />
          ))}
        </div>
      )}
    </div>
  );
}
