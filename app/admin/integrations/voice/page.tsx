'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Phone,
  Save,
  Loader2,
  Copy,
  CheckCircle2,
  XCircle,
  Mic,
  PhoneCall,
  CalendarCheck,
  ExternalLink,
  PlayCircle,
  ListOrdered,
} from 'lucide-react';

interface VoiceConfig {
  id?: string;
  provider: 'TWILIO' | 'MOCK';
  twilioAccountSid?: string | null;
  twilioAuthToken?: string | null;
  twilioPhoneNumber?: string | null;
  isActive: boolean;
  language: string;
  voice: string;
  greeting: string;
  goodbye: string;
  outsideHoursMessage: string;
  transferMessage: string;
  allowReservations: boolean;
  allowInfo: boolean;
  allowTransfer: boolean;
  transferNumber?: string | null;
  maxPartySize: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  defaultDurationMin: number;
  totalCalls: number;
  totalReservations: number;
  totalTransferred: number;
  lastActivityAt?: string | null;
}

export default function VoiceIntegrationPage() {
  const [cfg, setCfg] = useState<VoiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [incomingUrl, setIncomingUrl] = useState('');
  const [statusUrl, setStatusUrl] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/voice/config');
      if (res.ok) {
        const d = await res.json();
        setCfg(d.config);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (typeof window !== 'undefined') {
      setIncomingUrl(`${window.location.origin}/api/voice/webhook/incoming`);
      setStatusUrl(`${window.location.origin}/api/voice/webhook/status`);
    }
  }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/voice/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error('save failed');
      toast.success('Configuração salva');
      await load();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const copy = async (url: string, key: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(key);
    toast.success('Copiado');
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading || !cfg) {
    return (
      <div className="p-4 sm:p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin w-6 h-6" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <BackButton href="/admin" />
        <div className="flex-1">
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
            <Mic className="w-6 h-6 text-rose-600" />
            Atendente Virtual por Voz
          </h1>
          <p className="text-sm text-gray-600">Agente de IA que atende ligações e agenda reservas automaticamente</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/voice/test">
            <Button variant="outline" className="w-full sm:w-auto">
              <PlayCircle className="w-4 h-4 mr-2" /> Simular conversa
            </Button>
          </Link>
          <Link href="/admin/integrations/voice/calls">
            <Button variant="outline" className="w-full sm:w-auto">
              <ListOrdered className="w-4 h-4 mr-2" /> Ligações
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-sm text-gray-600">Total de ligações</div>
          <div className="text-2xl font-bold flex items-center gap-2"><PhoneCall className="w-5 h-5 text-blue-600" /> {cfg.totalCalls}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Reservas criadas</div>
          <div className="text-2xl font-bold flex items-center gap-2"><CalendarCheck className="w-5 h-5 text-emerald-600" /> {cfg.totalReservations}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Transferidas para humano</div>
          <div className="text-2xl font-bold">{cfg.totalTransferred}</div>
        </Card>
      </div>

      {/* Status */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {cfg.isActive ? (
              <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 mr-1" /> Ativo</Badge>
            ) : (
              <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" /> Inativo</Badge>
            )}
            <span className="text-sm text-gray-500">Provider: {cfg.provider}</span>
          </div>
          <Button
            variant={cfg.isActive ? 'outline' : 'default'}
            onClick={() => setCfg({ ...cfg, isActive: !cfg.isActive })}
          >
            {cfg.isActive ? 'Desativar' : 'Ativar'} agente
          </Button>
        </div>
      </Card>

      {/* Provider selector */}
      <Card className="p-5 space-y-4">
        <h2 className="text-lg font-semibold">Telefonia (Twilio)</h2>
        <p className="text-sm text-gray-600">
          Para atender ligações reais, cadastre um número no Twilio. Sem credenciais, você pode testar o agente pelo simulador acima.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Account SID</Label>
            <Input
              value={cfg.twilioAccountSid || ''}
              onChange={(e) => setCfg({ ...cfg, twilioAccountSid: e.target.value })}
              placeholder="ACxxxxxxxxxxxxx"
            />
          </div>
          <div>
            <Label>Auth Token</Label>
            <Input
              type="text"
              value={cfg.twilioAuthToken || ''}
              onChange={(e) => setCfg({ ...cfg, twilioAuthToken: e.target.value })}
              placeholder="(cole o token)"
            />
          </div>
          <div>
            <Label>Número Twilio (E.164)</Label>
            <Input
              value={cfg.twilioPhoneNumber || ''}
              onChange={(e) => setCfg({ ...cfg, twilioPhoneNumber: e.target.value })}
              placeholder="+551140028922"
            />
          </div>
          <div>
            <Label>Transferir para (opcional)</Label>
            <Input
              value={cfg.transferNumber || ''}
              onChange={(e) => setCfg({ ...cfg, transferNumber: e.target.value })}
              placeholder="+5511999887766"
            />
          </div>
        </div>

        <div className="border-t pt-4 space-y-2">
          <Label className="text-sm">Webhooks para configurar no Twilio (Voice &gt; Active Number)</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-28">A CALL COMES IN</span>
            <Input value={incomingUrl} readOnly className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => copy(incomingUrl, 'incoming')}>
              {copied === 'incoming' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-28">STATUS CALLBACK</span>
            <Input value={statusUrl} readOnly className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => copy(statusUrl, 'status')}>
              {copied === 'status' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-gray-500">Method POST. Ambos os webhooks no Twilio Console.</p>
        </div>
      </Card>

      {/* Persona */}
      <Card className="p-5 space-y-4">
        <h2 className="text-lg font-semibold">Persona e mensagens</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Idioma</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={cfg.language}
              onChange={(e) => setCfg({ ...cfg, language: e.target.value })}
            >
              <option value="pt-BR">Português (BR)</option>
              <option value="en-US">English (US)</option>
              <option value="es-MX">Español (MX)</option>
            </select>
          </div>
          <div>
            <Label>Voz</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={cfg.voice}
              onChange={(e) => setCfg({ ...cfg, voice: e.target.value })}
            >
              <option value="Polly.Camila-Neural">Camila (pt-BR, feminina)</option>
              <option value="Polly.Vitoria-Neural">Vitória (pt-BR, feminina)</option>
              <option value="Polly.Thiago-Neural">Thiago (pt-BR, masculina)</option>
              <option value="alice">Alice (padrão Twilio)</option>
            </select>
          </div>
        </div>

        <div>
          <Label>Saudação inicial</Label>
          <Textarea rows={2} value={cfg.greeting} onChange={(e) => setCfg({ ...cfg, greeting: e.target.value })} />
        </div>
        <div>
          <Label>Despedida</Label>
          <Textarea rows={2} value={cfg.goodbye} onChange={(e) => setCfg({ ...cfg, goodbye: e.target.value })} />
        </div>
        <div>
          <Label>Fora do horário comercial</Label>
          <Textarea rows={2} value={cfg.outsideHoursMessage} onChange={(e) => setCfg({ ...cfg, outsideHoursMessage: e.target.value })} />
        </div>
        <div>
          <Label>Transferindo para humano</Label>
          <Textarea rows={2} value={cfg.transferMessage} onChange={(e) => setCfg({ ...cfg, transferMessage: e.target.value })} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.allowReservations} onChange={(e) => setCfg({ ...cfg, allowReservations: e.target.checked })} />
            <span className="text-sm">Aceitar reservas</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.allowInfo} onChange={(e) => setCfg({ ...cfg, allowInfo: e.target.checked })} />
            <span className="text-sm">Responder informações</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.allowTransfer} onChange={(e) => setCfg({ ...cfg, allowTransfer: e.target.checked })} />
            <span className="text-sm">Transferir para humano</span>
          </label>
        </div>
      </Card>

      {/* Reservation rules */}
      <Card className="p-5 space-y-4">
        <h2 className="text-lg font-semibold">Regras de reserva</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label>Grupo máximo</Label>
            <Input type="number" min={1} max={50} value={cfg.maxPartySize}
              onChange={(e) => setCfg({ ...cfg, maxPartySize: parseInt(e.target.value, 10) || 0 })} />
          </div>
          <div>
            <Label>Antecedência mín (min)</Label>
            <Input type="number" min={0} value={cfg.minAdvanceMinutes}
              onChange={(e) => setCfg({ ...cfg, minAdvanceMinutes: parseInt(e.target.value, 10) || 0 })} />
          </div>
          <div>
            <Label>Antecedência máx (dias)</Label>
            <Input type="number" min={1} max={365} value={cfg.maxAdvanceDays}
              onChange={(e) => setCfg({ ...cfg, maxAdvanceDays: parseInt(e.target.value, 10) || 1 })} />
          </div>
          <div>
            <Label>Duração padrão (min)</Label>
            <Input type="number" min={30} max={300} value={cfg.defaultDurationMin}
              onChange={(e) => setCfg({ ...cfg, defaultDurationMin: parseInt(e.target.value, 10) || 90 })} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-white/90 backdrop-blur-sm py-3 border-t">
        <Button onClick={save} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar configuração
        </Button>
      </div>

      <Card className="p-5 space-y-2 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 flex items-center gap-2"><ExternalLink className="w-4 h-4" /> Como começar com o Twilio</h3>
        <ol className="text-sm text-blue-900 space-y-1 list-decimal list-inside">
          <li>Criar conta em <a href="https://www.twilio.com" target="_blank" rel="noreferrer" className="underline">twilio.com</a> (trial grátis ~US$15)</li>
          <li>Comprar um número brasileiro (US$1/mês) com capacidade de Voz</li>
          <li>Copiar Account SID e Auth Token do dashboard</li>
          <li>Colar as credenciais acima + número no formato E.164 (+55...) + salvar</li>
          <li>No Twilio: Phone Numbers &gt; Active Number &gt; Voice &gt; &quot;A Call Comes In&quot; → colar webhook acima (POST)</li>
          <li>Ativar o agente e fazer uma ligação de teste para o número</li>
        </ol>
      </Card>
    </div>
  );
}
