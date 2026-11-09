'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { shouldPrefill } from '@/lib/agents/whatsapp/draft-box';

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

type Suggestion =
  | { state: 'none' }
  | { state: 'unavailable' }
  | { state: 'ready'; id: string; kind: 'SUGGESTION' | 'TEAM' | 'FAILED'; text: string | null; reason: string | null };

export interface SuggestionStats {
  made: number;
  asIs: number;
  edited: number;
  discarded: number;
  team: number;
}

const STATUS: Record<string, string> = { sent: 'Enviada', delivered: 'Entregue', read: 'Lida', failed: 'Não entregue' };
const when = (at: string) => new Date(at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [open, setOpen] = useState(conversation.windowOpen);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  // Last client message a suggestion was requested for, so the 15 s poll does not ask again
  const requestedFor = useRef<string | null>(null);
  // Text the agent last put in the box, and the box's current value (readable from async callbacks)
  const lastDraft = useRef<string | null>(null);
  const textRef = useRef('');
  textRef.current = text;
  const url = `/api/admin/agent-conversations/${conversation.phone}`;

  const load = async () => {
    const res = await fetch(url);
    if (!res.ok) return;
    const out = await res.json();
    setMessages(out.messages);
    setOpen(out.windowOpen);
    const last = out.messages[out.messages.length - 1];
    if (out.windowOpen && last?.direction === 'IN' && last.id !== requestedFor.current) {
      requestedFor.current = last.id;
      suggestionCall();
    }
  };

  function apply(out: Suggestion) {
    setSuggestion(out);
    if (out.state === 'ready' && out.kind === 'SUGGESTION' && out.text && shouldPrefill(textRef.current, lastDraft.current)) {
      lastDraft.current = out.text;
      setText(out.text);
    }
  }

  /** GET the current suggestion, or POST regenerate for a fresh one */
  async function suggestionCall(regenerate = false) {
    setSuggesting(true);
    try {
      const res = await fetch(
        `${url}/suggestion`,
        regenerate ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'regenerate' }) } : undefined,
      );
      apply(res.ok ? await res.json() : { state: 'unavailable' });
    } catch {
      apply({ state: 'unavailable' });
    } finally {
      setSuggesting(false);
    }
  }

  async function discard() {
    if (suggestion?.state !== 'ready') return;
    try {
      const res = await fetch(`${url}/suggestion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'discard', id: suggestion.id }) });
      if (!res.ok) throw new Error();
      if (shouldPrefill(textRef.current, lastDraft.current)) setText('');
      lastDraft.current = null;
      setSuggestion({ state: 'none' });
    } catch {
      toast.error('Não foi possível descartar');
    }
  }

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
      const suggestionId = suggestion?.state === 'ready' && suggestion.kind === 'SUGGESTION' ? suggestion.id : undefined;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, suggestionId }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Não foi possível enviar');
      setText('');
      lastDraft.current = null;
      setSuggestion(null);
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
          {!suggesting && suggestion?.state === 'ready' && suggestion.kind === 'SUGGESTION' && (
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
              <Sparkles className="h-3.5 w-3.5" /> Sugestão do agente
            </span>
          )}
          <textarea aria-label="Resposta" className="w-full min-h-[90px] rounded-md border p-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
          {suggesting && <p className="text-xs text-muted-foreground">Preparando sugestão…</p>}
          {!suggesting && suggestion?.state === 'ready' && suggestion.kind === 'TEAM' && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 break-words">Responda você: {suggestion.reason}</p>
          )}
          {!suggesting && (suggestion?.state === 'unavailable' || (suggestion?.state === 'ready' && suggestion.kind === 'FAILED')) && (
            <p className="text-xs text-muted-foreground">Sem sugestão desta vez</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1" disabled={busy || !text.trim()} onClick={send}><Send className="h-4 w-4" /> Responder</Button>
            {!suggesting && suggestion?.state === 'ready' && (suggestion.kind === 'SUGGESTION' || suggestion.kind === 'FAILED') && (
              <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => suggestionCall(true)}><RefreshCw className="h-4 w-4" /> Nova sugestão</Button>
            )}
            {!suggesting && suggestion?.state === 'ready' && suggestion.kind === 'SUGGESTION' && (
              <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={discard}><X className="h-4 w-4" /> Descartar</Button>
            )}
          </div>
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
export function AgentConversations({ items, onChange, stats }: { items: Conversation[]; onChange: () => void; stats?: SuggestionStats | null }) {
  const [phone, setPhone] = useState<string | null>(null);
  const selected = items.find((c) => c.phone === phone);

  if (selected) {
    return <Thread conversation={selected} onBack={() => { setPhone(null); onChange(); }} />;
  }
  if (items.length === 0) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma conversa ainda</CardContent></Card>;
  }
  const pct = (n: number) => (stats && stats.made > 0 ? Math.round((n / stats.made) * 100) : 0);
  return (
    <div className="space-y-2">
      {stats && stats.made + stats.team > 0 && (
        <p className="text-xs text-muted-foreground">
          Últimos 14 dias: {stats.made} sugestões · {pct(stats.asIs)}% enviadas sem mudança · {pct(stats.edited)}% com edição · {pct(stats.discarded)}% descartadas · {stats.team} para a equipe
        </p>
      )}
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
