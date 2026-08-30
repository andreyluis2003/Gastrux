'use client';
// @ts-nocheck

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Megaphone,
  Plus,
  Loader2,
  Save,
  FileText,
  Plug,
  Users,
  Send,
  Calendar,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  XCircle,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SCHEDULED: 'bg-amber-100 text-amber-800',
  RUNNING: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  PARTIALLY_COMPLETED: 'bg-orange-100 text-orange-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-200 text-gray-600',
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [metaWhatsapp, setMetaWhatsapp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    name: '',
    description: '',
    templateId: '',
    provider: 'META_CLOUD',
    defaultVariables: '{}',
    recipientsText: '',
    scheduledAt: '',
  });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, t, p] = await Promise.all([
        fetch('/api/admin/messaging/campaigns').then((r) => r.json()),
        fetch('/api/admin/messaging/templates').then((r) => r.json()),
        fetch('/api/admin/messaging/providers').then((r) => r.json()),
      ]);
      setCampaigns(c.campaigns || []);
      setTemplates(t.templates || []);
      setProviders(p.configs || []);
      setMetaWhatsapp(p.metaWhatsapp || null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const availableProviders = () => {
    const out: string[] = [];
    providers.forEach((p) => {
      if (p.isActive) out.push(p.provider);
    });
    if (metaWhatsapp?.isActive) out.push('META_CLOUD');
    return Array.from(new Set(out));
  };

  const parseRecipients = (text: string) => {
    return text
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        // Support "5511999...|John|var1=foo|var2=bar"
        const parts = line.split('|').map((s) => s.trim());
        const phone = parts[0];
        const name = parts[1] || null;
        const vars: Record<string, string> = {};
        for (let i = 2; i < parts.length; i++) {
          const [k, v] = parts[i].split('=');
          if (k && v !== undefined) vars[k.trim()] = v.trim();
        }
        return { phone, name, variables: vars };
      });
  };

  const create = async () => {
    if (!form.name || !form.templateId || !form.provider) {
      toast.error('Preencha nome, template e provedor');
      return;
    }
    setCreating(true);
    try {
      let defaultVariables = {};
      try {
        defaultVariables = JSON.parse(form.defaultVariables || '{}');
      } catch {
        toast.error('Variáveis padrão em JSON inválido');
        setCreating(false);
        return;
      }
      const payload: any = {
        name: form.name,
        description: form.description,
        templateId: form.templateId,
        provider: form.provider,
        defaultVariables,
        recipients: parseRecipients(form.recipientsText),
      };
      if (form.scheduledAt) payload.scheduledAt = form.scheduledAt;
      const res = await fetch('/api/admin/messaging/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success('Campanha criada');
        setOpen(false);
        setForm({
          name: '',
          description: '',
          templateId: '',
          provider: 'META_CLOUD',
          defaultVariables: '{}',
          recipientsText: '',
          scheduledAt: '',
        });
        load();
      } else toast.error(d.error || 'Erro');
    } finally {
      setCreating(false);
    }
  };

  const approved = templates.filter((t) => t.status === 'APPROVED' || t.status === 'DRAFT');

  return (
    <div className="container mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Campanhas de Mensagens</h1>
            <p className="text-sm text-gray-600">Dispare templates aprovados para listas de clientes via Meta, Take Blip ou Zenvia.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/messaging/providers"><Button variant="outline" className="gap-2"><Plug className="h-4 w-4" />Provedores</Button></Link>
          <Link href="/admin/messaging/templates"><Button variant="outline" className="gap-2"><FileText className="h-4 w-4" />Templates</Button></Link>
          <Button onClick={() => setOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700"><Plus className="h-4 w-4" />Nova Campanha</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total de campanhas', value: campaigns.length, color: 'text-indigo-600' },
          { label: 'Em execução', value: campaigns.filter((c) => c.status === 'RUNNING').length, color: 'text-blue-600' },
          { label: 'Concluídas', value: campaigns.filter((c) => c.status === 'COMPLETED').length, color: 'text-emerald-600' },
          { label: 'Agendadas', value: campaigns.filter((c) => c.status === 'SCHEDULED').length, color: 'text-amber-600' },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="p-6">Carregando...</div>
      ) : campaigns.length === 0 ? (
        <Card className="p-10 text-center text-gray-500">
          <Megaphone className="h-10 w-10 mx-auto text-gray-300 mb-3" />
          <p>Nenhuma campanha criada. Crie templates aprovados antes de disparar mensagens em massa.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/admin/messaging/campaigns/${c.id}`}>
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{c.name}</h3>
                      <Badge className={`${STATUS_COLORS[c.status] || ''} border-0`}>{c.status}</Badge>
                      <Badge variant="outline" className="text-xs">{c.provider}</Badge>
                    </div>
                    {c.description && <p className="text-sm text-gray-600 mt-1">{c.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {c.template?.displayName}</span>
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {c.totalRecipients || 0} destinatários</span>
                      {c.scheduledAt && (
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(c.scheduledAt).toLocaleString('pt-BR')}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Enviadas</div>
                    <div className="text-xl font-bold text-indigo-600">{c.totalSent || 0}</div>
                    <div className="text-[11px] text-gray-500">{c.totalDelivered || 0} entregues • {c.totalRead || 0} lidas</div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <Label>Nome da campanha *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Promoção sexta-feira" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Contexto, público-alvo, objetivo..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Template aprovado *</Label>
                <select
                  className="w-full border rounded-md p-2 text-sm"
                  value={form.templateId}
                  onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                >
                  <option value="">-- selecione --</option>
                  {approved.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName} ({t.status})
                    </option>
                  ))}
                </select>
                {approved.length === 0 && (
                  <p className="text-[11px] text-red-600 mt-1">Crie um template primeiro.</p>
                )}
              </div>
              <div>
                <Label>Provedor *</Label>
                <select
                  className="w-full border rounded-md p-2 text-sm"
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                >
                  {availableProviders().map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {availableProviders().length === 0 && (
                  <p className="text-[11px] text-red-600 mt-1">Ative ao menos um provedor em /admin/messaging/providers.</p>
                )}
              </div>
            </div>
            <div>
              <Label>Variáveis padrão (JSON)</Label>
              <Textarea
                rows={2}
                value={form.defaultVariables}
                onChange={(e) => setForm({ ...form, defaultVariables: e.target.value })}
                placeholder='{"1":"R$ 50 off","2":"codigo PROMO"}'
              />
              <p className="text-[11px] text-gray-500 mt-1">Estas variáveis serão usadas para destinatários sem overrides.</p>
            </div>
            <div>
              <Label>Destinatários *</Label>
              <Textarea
                rows={6}
                value={form.recipientsText}
                onChange={(e) => setForm({ ...form, recipientsText: e.target.value })}
                placeholder={'5511999998888\n5511888887777|Maria\n5511777776666|João|1=Pedido XPTO|2=25/10'}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Um por linha. Formato: <code>telefone</code> ou <code>telefone|nome</code> ou <code>telefone|nome|1=valor|2=valor</code>. DDI 55 é adicionado automaticamente quando ausente.
              </p>
            </div>
            <div>
              <Label>Agendar envio (opcional)</Label>
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={creating} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
