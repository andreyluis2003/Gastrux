'use client';
// @ts-nocheck

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  MessageCircle,
  Send,
  Save,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Plug,
  FileText,
  Megaphone,
  ExternalLink,
} from 'lucide-react';

const PROVIDERS = [
  {
    id: 'TAKE_BLIP',
    name: 'Take Blip',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    logo: '🟣',
    website: 'https://blip.ai',
    description: 'Plataforma de atendimento omnichannel brasileira com chatbots e automação.',
    fields: ['apiKey', 'botIdentifier', 'blipRouter'],
    help: 'Em Blip Portal → Chatbot → Informações → copie a "Chave de acesso" (Authorization: Key xxx).',
  },
  {
    id: 'ZENVIA',
    name: 'Zenvia',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    logo: '🟢',
    website: 'https://www.zenvia.com',
    description: 'Plataforma CPaaS brasileira (WhatsApp, SMS, Voz) com API unificada.',
    fields: ['apiKey', 'fromNumber', 'zenviaAccount'],
    help: 'Em Zenvia App → Integrações → API tokens → crie e copie o token X-API-TOKEN.',
  },
  {
    id: 'META_CLOUD',
    name: 'Meta WhatsApp (Cloud API)',
    color: 'text-green-700',
    bg: 'bg-green-50',
    logo: '🟢',
    website: 'https://business.facebook.com',
    description: 'Conectado via Bot WhatsApp (Fase 51). As credenciais ficam em Integrações → WhatsApp Bot.',
    fields: [],
    help: 'Configure em /admin/integrations/whatsapp. Esta conexão reaproveita o phoneNumberId + accessToken.',
  },
];

export default function MessagingProvidersPage() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [metaWhatsapp, setMetaWhatsapp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, any>>({});
  const [webhookBase, setWebhookBase] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/messaging/providers');
      if (res.ok) {
        const d = await res.json();
        setConfigs(d.configs || []);
        setMetaWhatsapp(d.metaWhatsapp || null);
        // Pre-fill forms
        const initial: Record<string, any> = {};
        d.configs?.forEach((c: any) => {
          initial[c.provider] = { ...c };
        });
        setForms(initial);
      }
    } catch (e) {
      toast.error('Erro ao carregar provedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (typeof window !== 'undefined') {
      setWebhookBase(window.location.origin);
    }
  }, []);

  const updateField = (provider: string, field: string, value: any) => {
    setForms((prev) => ({
      ...prev,
      [provider]: { ...(prev[provider] || {}), [field]: value },
    }));
  };

  const save = async (provider: string) => {
    setSaving(provider);
    try {
      const data = forms[provider] || {};
      const payload: any = { provider };
      ['apiKey', 'apiSecret', 'botIdentifier', 'fromNumber', 'blipRouter', 'zenviaAccount', 'isActive', 'isPrimary', 'maxPerMinute'].forEach((k) => {
        if (data[k] !== undefined) payload[k] = data[k];
      });
      const res = await fetch('/api/admin/messaging/providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(`${provider} salvo`);
        await load();
      } else {
        toast.error(d.error || 'Erro');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    } finally {
      setSaving(null);
    }
  };

  const copyWebhook = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast.success('URL copiada');
  };

  if (loading) {
    return <div className="p-6">Carregando provedores...</div>;
  }

  return (
    <div className="container mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Plataformas de Mensageria</h1>
            <p className="text-sm text-gray-600">Conecte Take Blip, Zenvia ou Meta WhatsApp para enviar templates aprovados em massa.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/messaging/templates">
            <Button variant="outline" className="gap-2"><FileText className="h-4 w-4" />Templates</Button>
          </Link>
          <Link href="/admin/messaging/campaigns">
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700"><Megaphone className="h-4 w-4" />Campanhas</Button>
          </Link>
        </div>
      </div>

      {/* Provider cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        {PROVIDERS.map((p) => {
          const cfg = configs.find((c) => c.provider === p.id);
          const form = forms[p.id] || {};
          const isActive = form.isActive ?? cfg?.isActive ?? false;
          const isMeta = p.id === 'META_CLOUD';
          const metaOk = isMeta && metaWhatsapp?.isActive;

          return (
            <Card key={p.id} className={`p-5 border ${isActive || metaOk ? 'border-indigo-300 shadow-sm' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-3">
                  <div className={`h-12 w-12 rounded-lg ${p.bg} flex items-center justify-center text-2xl`}>{p.logo}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className={`text-lg font-semibold ${p.color}`}>{p.name}</h3>
                      {isActive || metaOk ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1"><CheckCircle2 className="h-3 w-3" />Ativo</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" />Inativo</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{p.description}</p>
                  </div>
                </div>
              </div>

              {isMeta ? (
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                    {metaOk ? (
                      <>Conectado via <strong>{metaWhatsapp.displayPhoneNumber || 'WhatsApp Bot'}</strong>.</>
                    ) : (
                      <>Você ainda não ativou o WhatsApp Bot.</>
                    )}
                  </div>
                  <Link href="/admin/integrations/whatsapp">
                    <Button variant="outline" className="w-full gap-2">
                      <Plug className="h-4 w-4" /> Gerenciar WhatsApp Bot
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {p.fields.includes('apiKey') && (
                    <div>
                      <Label>API Key / Token</Label>
                      <Input
                        type="password"
                        placeholder={cfg?.apiKey ? `Salvo (${cfg.apiKey})` : 'cole aqui seu token'}
                        value={form.apiKey || ''}
                        onChange={(e) => updateField(p.id, 'apiKey', e.target.value)}
                      />
                    </div>
                  )}
                  {p.fields.includes('botIdentifier') && (
                    <div>
                      <Label>Bot Identifier (Chat ID)</Label>
                      <Input
                        placeholder="ex: meubot.take@msging.net"
                        value={form.botIdentifier || ''}
                        onChange={(e) => updateField(p.id, 'botIdentifier', e.target.value)}
                      />
                    </div>
                  )}
                  {p.fields.includes('blipRouter') && (
                    <div>
                      <Label>Router URL</Label>
                      <Input
                        placeholder="https://msging.net"
                        value={form.blipRouter || cfg?.blipRouter || 'https://msging.net'}
                        onChange={(e) => updateField(p.id, 'blipRouter', e.target.value)}
                      />
                    </div>
                  )}
                  {p.fields.includes('fromNumber') && (
                    <div>
                      <Label>Número de origem (E.164)</Label>
                      <Input
                        placeholder="+5511999887766"
                        value={form.fromNumber || ''}
                        onChange={(e) => updateField(p.id, 'fromNumber', e.target.value)}
                      />
                    </div>
                  )}
                  {p.fields.includes('zenviaAccount') && (
                    <div>
                      <Label>Zenvia account (opcional)</Label>
                      <Input
                        placeholder="ID da conta Zenvia"
                        value={form.zenviaAccount || ''}
                        onChange={(e) => updateField(p.id, 'zenviaAccount', e.target.value)}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Taxa máx/min</Label>
                      <Input
                        type="number"
                        value={form.maxPerMinute ?? cfg?.maxPerMinute ?? 60}
                        onChange={(e) => updateField(p.id, 'maxPerMinute', parseInt(e.target.value) || 60)}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 text-sm mt-6">
                        <input
                          type="checkbox"
                          checked={!!isActive}
                          onChange={(e) => updateField(p.id, 'isActive', e.target.checked)}
                        />
                        Ativo
                      </label>
                    </div>
                  </div>

                  {/* Webhook URL */}
                  {webhookBase && (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                      <div className="text-xs font-semibold text-gray-700">Webhook de status de entrega</div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-white p-2 border rounded flex-1 truncate">{webhookBase}/api/messaging/webhook/{p.id.toLowerCase()}</code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyWebhook(p.id, `${webhookBase}/api/messaging/webhook/${p.id.toLowerCase()}`)}
                        >
                          {copied === p.id ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-[11px] text-gray-500">Configure esta URL no painel do {p.name} para receber status de entrega/leitura.</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      onClick={() => save(p.id)}
                      disabled={saving === p.id}
                      className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                    >
                      {saving === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar
                    </Button>
                    <a href={p.website} target="_blank" rel="noopener noreferrer" className="ml-auto">
                      <Button variant="ghost" size="sm" className="gap-1 text-gray-600"><ExternalLink className="h-3 w-3" />Portal</Button>
                    </a>
                  </div>
                  <div className="p-2 bg-indigo-50 border border-indigo-200 rounded text-xs text-indigo-900">
                    <strong>💡 Como obter:</strong> {p.help}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {configs.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="text-xs text-gray-500">{c.provider}</div>
            <div className="text-2xl font-bold mt-1">{c.totalSent || 0}</div>
            <div className="text-xs text-gray-600">mensagens enviadas</div>
            <div className="mt-2 flex gap-3 text-xs text-gray-600">
              <span>✅ {c.totalDelivered || 0}</span>
              <span>❌ {c.totalFailed || 0}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
