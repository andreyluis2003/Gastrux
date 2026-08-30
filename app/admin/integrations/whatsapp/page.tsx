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
  MessageSquare,
  Save,
  Loader2,
  Copy,
  CheckCircle2,
  XCircle,
  Send,
  Users,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';

interface WhatsAppConfig {
  id?: string;
  phoneNumberId?: string | null;
  businessAccountId?: string | null;
  displayPhoneNumber?: string | null;
  accessToken?: string | null;
  verifyToken?: string | null;
  greeting?: string | null;
  businessHours?: string | null;
  outsideHoursMessage?: string | null;
  isActive: boolean;
  totalConversations: number;
  totalOrders: number;
  lastActivityAt?: string | null;
}

export default function WhatsAppIntegrationPage() {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Test message form
  const [testTo, setTestTo] = useState('');
  const [testText, setTestText] = useState('Olá! Este é um teste do bot WhatsApp.');
  const [sendingTest, setSendingTest] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/whatsapp/config');
      if (res.ok) {
        const d = await res.json();
        setConfig(d.config);
      } else {
        toast.error('Erro ao carregar configuração');
      }
    } catch {
      toast.error('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
    }
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/whatsapp/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: config.phoneNumberId,
          businessAccountId: config.businessAccountId,
          displayPhoneNumber: config.displayPhoneNumber,
          accessToken: config.accessToken,
          verifyToken: config.verifyToken,
          greeting: config.greeting,
          businessHours: config.businessHours,
          outsideHoursMessage: config.outsideHoursMessage,
          isActive: config.isActive,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setConfig(d.config);
        toast.success('Configurações salvas');
      } else {
        toast.error('Erro ao salvar');
      }
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const toggleActive = async () => {
    if (!config) return;
    const newVal = !config.isActive;
    setConfig({ ...config, isActive: newVal });
    try {
      await fetch('/api/admin/whatsapp/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newVal }),
      });
      toast.success(newVal ? 'Bot ativado' : 'Bot pausado');
    } catch {
      toast.error('Erro');
    }
  };

  const sendTestMessage = async () => {
    if (!testTo || !testText) return;
    setSendingTest(true);
    try {
      const res = await fetch('/api/admin/whatsapp/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo, text: testText }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        toast.success('Mensagem enviada!');
      } else {
        toast.error(d.error || 'Falha ao enviar');
      }
    } catch {
      toast.error('Erro ao enviar');
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 sm:p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
                <MessageSquare className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
                WhatsApp Bot
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Receba pedidos direto pelo WhatsApp via Meta Cloud API
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={config.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600'}
            >
              {config.isActive ? (
                <><CheckCircle2 className="h-3 w-3 mr-1" /> Ativo</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> Pausado</>
              )}
            </Badge>
            <Button onClick={toggleActive} variant={config.isActive ? 'outline' : 'default'}>
              {config.isActive ? 'Pausar bot' : 'Ativar bot'}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Conversas</p>
                <p className="text-2xl font-bold">{config.totalConversations}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <ShoppingBag className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Pedidos confirmados</p>
                <p className="text-2xl font-bold">{config.totalOrders}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 border-gray-200">
            <div>
              <p className="text-xs text-gray-500">Última atividade</p>
              <p className="text-sm font-medium mt-1">
                {config.lastActivityAt
                  ? new Date(config.lastActivityAt).toLocaleString('pt-BR')
                  : 'Nenhuma ainda'}
              </p>
            </div>
          </Card>
        </div>

        {/* Credentials */}
        <Card className="p-6 border-gray-200">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            Credenciais da Meta Cloud API
          </h2>
          <div className="space-y-4">
            <div>
              <Label>Phone Number ID</Label>
              <Input
                value={config.phoneNumberId || ''}
                onChange={(e) => setConfig({ ...config, phoneNumberId: e.target.value })}
                placeholder="Ex: 106540185772291"
              />
              <p className="text-xs text-gray-500 mt-1">
                ID do número no WhatsApp Business. Encontre em developers.facebook.com → seu app → WhatsApp → API Setup.
              </p>
            </div>
            <div>
              <Label>WhatsApp Business Account ID</Label>
              <Input
                value={config.businessAccountId || ''}
                onChange={(e) => setConfig({ ...config, businessAccountId: e.target.value })}
                placeholder="Ex: 234567890123456"
              />
            </div>
            <div>
              <Label>Número exibido (formato BR)</Label>
              <Input
                value={config.displayPhoneNumber || ''}
                onChange={(e) => setConfig({ ...config, displayPhoneNumber: e.target.value })}
                placeholder="Ex: +55 11 99988-7766"
              />
            </div>
            <div>
              <Label>Access Token</Label>
              <Input
                type="text"
                value={config.accessToken || ''}
                onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
                placeholder="Token permanente ou de system user"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use um token de System User para máxima duração. Tokens temporários expiram em 24h.
              </p>
            </div>
            <div>
              <Label>Verify Token (você define)</Label>
              <Input
                type="text"
                value={config.verifyToken || ''}
                onChange={(e) => setConfig({ ...config, verifyToken: e.target.value })}
                placeholder="Ex: meu_token_secreto_123"
              />
              <p className="text-xs text-gray-500 mt-1">
                String secreta que você vai informar ao Meta na configuração do webhook.
              </p>
            </div>
          </div>
        </Card>

        {/* Webhook URL */}
        <Card className="p-6 border-gray-200 bg-blue-50">
          <h2 className="text-lg font-semibold mb-2">Configuração do Webhook no Meta</h2>
          <p className="text-sm text-gray-700 mb-4">
            No painel do Meta, vá em <b>WhatsApp → Configuration → Webhooks</b> e use:
          </p>
          <div className="space-y-3">
            <div>
              <Label>Callback URL</Label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="bg-white font-mono text-xs" />
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(webhookUrl, 'webhook')}
                  title="Copiar"
                >
                  {copiedField === 'webhook' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div>
              <Label>Verify Token</Label>
              <div className="flex gap-2">
                <Input
                  value={config.verifyToken || '(defina acima)'}
                  readOnly
                  className="bg-white"
                />
                <Button
                  variant="outline"
                  disabled={!config.verifyToken}
                  onClick={() => copyToClipboard(config.verifyToken || '', 'verify')}
                >
                  {copiedField === 'verify' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="text-sm text-gray-700 pt-2">
              <p className="font-medium">Webhook fields necessários:</p>
              <ul className="list-disc list-inside mt-1 text-gray-600">
                <li><code>messages</code></li>
                <li><code>message_status</code> (opcional)</li>
              </ul>
            </div>
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline pt-2"
            >
              Ver documentação oficial <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Card>

        {/* Bot messages */}
        <Card className="p-6 border-gray-200">
          <h2 className="text-lg font-semibold mb-4">Mensagens do Bot</h2>
          <div className="space-y-4">
            <div>
              <Label>Saudação inicial</Label>
              <Textarea
                value={config.greeting || ''}
                onChange={(e) => setConfig({ ...config, greeting: e.target.value })}
                placeholder="Mensagem exibida na primeira interação"
                rows={3}
              />
            </div>
            <div>
              <Label>Horário de funcionamento</Label>
              <Input
                value={config.businessHours || ''}
                onChange={(e) => setConfig({ ...config, businessHours: e.target.value })}
                placeholder="Ex: Seg-Sex 11h-23h, Sáb-Dom 12h-00h"
              />
            </div>
            <div>
              <Label>Mensagem fora do horário (opcional)</Label>
              <Textarea
                value={config.outsideHoursMessage || ''}
                onChange={(e) => setConfig({ ...config, outsideHoursMessage: e.target.value })}
                placeholder="Mensagem enviada quando alguém escrever fora do horário"
                rows={2}
              />
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar configurações
          </Button>
        </div>

        {/* Test message */}
        <Card className="p-6 border-gray-200">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Send className="h-5 w-5 text-green-600" /> Enviar mensagem de teste
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            O Meta só permite enviar mensagens para números aprovados antes do envio em massa.
            Use seu próprio número para testar (formato: 5511999887766).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3">
            <Input
              placeholder="5511999887766"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <Input
              placeholder="Mensagem"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
            />
            <Button onClick={sendTestMessage} disabled={sendingTest || !testTo || !testText}>
              {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
            </Button>
          </div>
        </Card>

        <div className="flex justify-center pt-4">
          <Link
            href="/admin/integrations/whatsapp/conversations"
            className="text-sm text-blue-600 hover:underline"
          >
            Ver conversas recentes →
          </Link>
        </div>
      </div>
    </div>
  );
}
