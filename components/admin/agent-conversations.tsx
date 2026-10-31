'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export interface Conversation {
  phone: string;
  name: string;
  restaurantId: string | null;
  lastText: string;
  lastDirection: 'IN' | 'OUT';
  lastAt: string;
  unread: number;
  windowOpen: boolean;
}

interface Message {
  id: string;
  direction: 'IN' | 'OUT';
  text: string;
  status: string | null;
  error: string | null;
  sentBy: string | null;
  createdAt: string;
}

const STATUS: Record<string, string> = { sent: 'Enviada', delivered: 'Entregue', read: 'Lida', failed: 'Não entregue' };
const when = (at: string) => new Date(at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [open, setOpen] = useState(conversation.windowOpen);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const url = `/api/admin/agent-conversations/${conversation.phone}`;

  const load = async () => {
    const res = await fetch(url);
    if (!res.ok) return;
    const out = await res.json();
    setMessages(out.messages);
    setOpen(out.windowOpen);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Não foi possível enviar');
      setText('');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button size="sm" variant="ghost" className="gap-1 -ml-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Conversas</Button>
      <div className="min-w-0">
        {conversation.restaurantId ? (
          <a href={`/admin/customers/${conversation.restaurantId}`} className="font-semibold hover:underline break-words">{conversation.name}</a>
        ) : (
          <p className="font-semibold break-words">{conversation.name}</p>
        )}
        <p className="text-xs text-muted-foreground">Número {conversation.phone}</p>
      </div>
      <Card>
        <CardContent className="space-y-2 pt-4 max-h-[55dvh] overflow-y-auto">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.direction === 'OUT' ? 'bg-green-100 text-green-950' : 'bg-muted'}`}>
                {m.text}
                <p className="mt-1 text-[11px] opacity-70">
                  {when(m.createdAt)}
                  {m.direction === 'OUT' && m.status ? ` · ${STATUS[m.status] ?? m.status}` : ''}
                </p>
                {m.error && <p className="mt-1 text-xs text-red-700">{m.error}</p>}
              </div>
            </div>
          ))}
          <div ref={end} />
        </CardContent>
      </Card>
      {open ? (
        <div className="space-y-2">
          <textarea aria-label="Resposta" className="w-full min-h-[90px] rounded-md border p-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
          <Button size="sm" className="gap-1" disabled={busy || !text.trim()} onClick={send}><Send className="h-4 w-4" /> Responder</Button>
        </div>
      ) : (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Passaram 24 horas desde a última mensagem do cliente. O WhatsApp só permite resposta livre até esse prazo; agora só um modelo aprovado pode ser enviado, pela fila.
        </p>
      )}
    </div>
  );
}

/** Plataforma › Fila do agente › Conversas: what clients answered on the Gastrux official number */
export function AgentConversations({ items, onChange }: { items: Conversation[]; onChange: () => void }) {
  const [phone, setPhone] = useState<string | null>(null);
  const selected = items.find((c) => c.phone === phone);

  if (selected) {
    return <Thread conversation={selected} onBack={() => { setPhone(null); onChange(); }} />;
  }
  if (items.length === 0) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma conversa ainda</CardContent></Card>;
  }
  return (
    <div className="space-y-2">
      {items.map((c) => (
        <button key={c.phone} type="button" onClick={() => setPhone(c.phone)} className="w-full rounded-lg border bg-card p-3 text-left hover:bg-muted/50">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold break-words min-w-0">{c.name}</p>
            {c.unread > 0 && <span className="shrink-0 rounded-full bg-green-600 px-2 py-0.5 text-xs font-medium text-white">{c.unread}</span>}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 break-words">{c.lastDirection === 'OUT' ? 'Você: ' : ''}{c.lastText}</p>
          <p className="text-xs text-muted-foreground">{when(c.lastAt)}</p>
        </button>
      ))}
    </div>
  );
}
