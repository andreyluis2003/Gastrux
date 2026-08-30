'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, PhoneCall, ArrowUpRight, CalendarCheck, UserRoundX, Radio } from 'lucide-react';

interface Call {
  id: string;
  callSid?: string | null;
  fromNumber?: string | null;
  status: string;
  outcome?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationSec?: number | null;
  isSimulation: boolean;
  transcript: any[];
  reservation?: { id: string; guestName: string; partySize: number; reservedAt: string; status: string } | null;
}

const OUTCOME_LABEL: Record<string, { label: string; color: string }> = {
  RESERVATION_CREATED: { label: 'Reserva criada', color: 'bg-emerald-100 text-emerald-800' },
  INFO_PROVIDED: { label: 'Informação dada', color: 'bg-blue-100 text-blue-800' },
  TRANSFERRED: { label: 'Transferida', color: 'bg-amber-100 text-amber-800' },
  HANG_UP: { label: 'Encerrada', color: 'bg-gray-100 text-gray-800' },
  NO_INTENT: { label: 'Sem intenção', color: 'bg-gray-100 text-gray-800' },
};

export default function VoiceCallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [byOutcome, setByOutcome] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Call | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const url = filter ? `/api/admin/voice/calls?outcome=${filter}` : '/api/admin/voice/calls';
      const res = await fetch(url);
      if (res.ok) {
        const d = await res.json();
        setCalls(d.calls || []);
        setByOutcome(d.byOutcome || {});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <BackButton href="/admin/integrations/voice" />
        <div className="flex-1">
          <h1 className="text-xl sm:text-3xl font-bold">Ligações recebidas</h1>
          <p className="text-sm text-gray-600">Histórico de chamadas atendidas pelo agente de voz</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Card
          className={`p-3 cursor-pointer transition ${filter === '' ? 'ring-2 ring-rose-500' : ''}`}
          onClick={() => setFilter('')}
        >
          <div className="text-xs text-gray-500">Todas</div>
          <div className="text-xl font-bold">{Object.values(byOutcome).reduce((a, b) => a + b, 0) || calls.length}</div>
        </Card>
        {Object.entries(OUTCOME_LABEL).map(([key, { label, color }]) => (
          <Card
            key={key}
            className={`p-3 cursor-pointer transition ${filter === key ? 'ring-2 ring-rose-500' : ''}`}
            onClick={() => setFilter(key)}
          >
            <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${color}`}>{label}</div>
            <div className="text-xl font-bold mt-1">{byOutcome[key] || 0}</div>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6" /></div>
      ) : calls.length === 0 ? (
        <Card className="p-10 text-center text-gray-500">Nenhuma ligação ainda.</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {calls.map((call) => (
            <Card
              key={call.id}
              className="p-4 cursor-pointer hover:shadow-md transition"
              onClick={() => setSelected(call)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {call.isSimulation ? (
                    <Radio className="w-4 h-4 text-violet-600" />
                  ) : (
                    <PhoneCall className="w-4 h-4 text-rose-600" />
                  )}
                  <span className="font-semibold text-sm">{call.fromNumber || '—'}</span>
                  {call.isSimulation && <Badge variant="outline" className="text-xs">simulação</Badge>}
                </div>
                {call.outcome && (
                  <Badge className={OUTCOME_LABEL[call.outcome]?.color || ''}>
                    {OUTCOME_LABEL[call.outcome]?.label || call.outcome}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(call.startedAt).toLocaleString('pt-BR')} • {call.durationSec ?? '—'}s • {(call.transcript || []).length} msgs
              </div>
              {call.reservation && (
                <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded p-2 text-xs">
                  <div className="flex items-center gap-1 text-emerald-800 font-medium">
                    <CalendarCheck className="w-3 h-3" /> Reserva: {call.reservation.guestName}
                  </div>
                  <div className="text-emerald-700">
                    {call.reservation.partySize}p • {new Date(call.reservation.reservedAt).toLocaleString('pt-BR')}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal inline para transcript */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <PhoneCall className="w-4 h-4" /> {selected.fromNumber || 'Simulação'}
                </div>
                <div className="text-xs text-gray-500">{new Date(selected.startedAt).toLocaleString('pt-BR')}</div>
              </div>
              <div className="flex gap-2">
                {selected.reservation && (
                  <Link href={`/reservas/${selected.reservation.id}`}>
                    <Button size="sm" variant="outline"><ArrowUpRight className="w-4 h-4 mr-1" /> Ver reserva</Button>
                  </Link>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Fechar</Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
              {(selected.transcript || []).map((turn: any, i: number) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg max-w-[85%] ${
                    turn.role === 'agent'
                      ? 'bg-rose-100 text-rose-900 ml-auto'
                      : turn.role === 'user'
                        ? 'bg-white border text-gray-800'
                        : 'bg-gray-200 text-gray-600 text-xs mx-auto'
                  }`}
                >
                  <div className="text-[10px] font-semibold opacity-70 mb-0.5">
                    {turn.role === 'agent' ? '🤖 Agente' : turn.role === 'user' ? '👤 Cliente' : '⚙️ Sistema'}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{turn.text}</div>
                </div>
              ))}
              {selected.outcome === 'NO_INTENT' && (
                <div className="text-center py-2 text-sm text-gray-500">
                  <UserRoundX className="w-4 h-4 inline mr-1" /> Cliente não demonstrou intenção clara
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
