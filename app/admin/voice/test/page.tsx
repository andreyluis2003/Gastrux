'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Send, Loader2, Mic, PhoneOff, PhoneCall, CalendarCheck, RefreshCw, ArrowUpRight,
} from 'lucide-react';

interface Turn {
  role: 'agent' | 'user';
  text: string;
  ts: string;
}

export default function VoiceSimulatorPage() {
  const [callId, setCallId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(false);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const startNew = async () => {
    setLoading(true);
    setTurns([]);
    setEnded(false);
    setReservationId(null);
    setDraft({});
    try {
      const res = await fetch('/api/admin/voice/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: true }),
      });
      if (!res.ok) throw new Error('start failed');
      const d = await res.json();
      setCallId(d.callId);
      setTurns([{ role: 'agent', text: d.reply, ts: new Date().toISOString() }]);
    } catch {
      toast.error('Erro ao iniciar simulação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { startNew(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const send = async () => {
    if (!input.trim() || !callId || ended) return;
    const text = input.trim();
    setInput('');
    setTurns((t) => [...t, { role: 'user', text, ts: new Date().toISOString() }]);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/voice/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, text }),
      });
      if (!res.ok) throw new Error('fail');
      const d = await res.json();
      setTurns((t) => [...t, { role: 'agent', text: d.reply, ts: new Date().toISOString() }]);
      setDraft(d.draft || {});
      if (d.ended) {
        setEnded(true);
        if (d.reservationId) setReservationId(d.reservationId);
      }
    } catch {
      toast.error('Erro ao enviar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <BackButton href="/admin/integrations/voice" />
        <div className="flex-1">
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
            <Mic className="w-6 h-6 text-rose-600" /> Simulador do Agente
          </h1>
          <p className="text-sm text-gray-600">Teste a conversa do agente de voz via texto (sem Twilio)</p>
        </div>
        <Button variant="outline" onClick={startNew} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Nova ligação
        </Button>
      </div>

      {/* Chat */}
      <Card className="p-0 overflow-hidden">
        <div ref={scrollRef} className="h-[480px] overflow-y-auto p-4 space-y-2 bg-gradient-to-br from-rose-50 to-amber-50">
          {turns.map((t, i) => (
            <div
              key={i}
              className={`p-3 rounded-2xl max-w-[80%] ${
                t.role === 'agent'
                  ? 'bg-rose-600 text-white mr-auto'
                  : 'bg-white border ml-auto'
              }`}
            >
              <div className="text-[10px] font-semibold opacity-70 mb-0.5">
                {t.role === 'agent' ? '🤖 Agente' : '👤 Você (cliente)'}
              </div>
              <div className="text-sm whitespace-pre-wrap">{t.text}</div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Agente está pensando...
            </div>
          )}
          {ended && (
            <div className="text-center py-4">
              <Badge className="bg-gray-200 text-gray-800"><PhoneOff className="w-3 h-3 mr-1" /> Ligação encerrada</Badge>
            </div>
          )}
        </div>

        <div className="border-t p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={ended ? 'Ligação encerrada, inicie uma nova' : 'Simule o que o cliente falaria...'}
            disabled={loading || ended}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          />
          <Button onClick={send} disabled={loading || ended || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Sidebar info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4">
          <h3 className="font-semibold mb-2 flex items-center gap-2"><PhoneCall className="w-4 h-4" /> Status da ligação</h3>
          <div className="space-y-1 text-sm">
            <div>ID: <code className="text-xs">{callId?.slice(-8) || '—'}</code></div>
            <div>Mensagens: {turns.length}</div>
            <div>Status: {ended ? <Badge variant="outline">Encerrada</Badge> : <Badge className="bg-emerald-100 text-emerald-800">Em andamento</Badge>}</div>
            {reservationId && (
              <div className="mt-2">
                <Link href={`/reservas`} className="text-emerald-700 underline text-xs flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3" /> Reserva criada
                </Link>
              </div>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold mb-2 flex items-center gap-2"><CalendarCheck className="w-4 h-4" /> Rascunho detectado</h3>
          <div className="text-sm space-y-1">
            <div>Pessoas: <strong>{draft.partySize || '—'}</strong></div>
            <div>Data: <strong>{draft.date || '—'}</strong></div>
            <div>Horário: <strong>{draft.time || '—'}</strong></div>
            <div>Nome: <strong>{draft.name || '—'}</strong></div>
            {draft.notes && <div>Obs: <em>{draft.notes}</em></div>}
          </div>
        </Card>
      </div>

      <Card className="p-4 bg-blue-50 border-blue-200">
        <h3 className="text-sm font-semibold text-blue-900 mb-1">💡 Dicas de teste</h3>
        <ul className="text-xs text-blue-900 space-y-0.5 list-disc list-inside">
          <li>&quot;Oi, queria fazer uma reserva&quot;</li>
          <li>&quot;Somos 4 pessoas, pode ser amanhã às 20h?&quot;</li>
          <li>&quot;Meu nome é Maria Silva&quot;</li>
          <li>&quot;Sim, pode confirmar&quot;</li>
          <li>&quot;Quero falar com um atendente&quot; (transferência)</li>
        </ul>
      </Card>
    </div>
  );
}
