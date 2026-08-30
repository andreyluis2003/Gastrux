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
  FileText,
  Plus,
  Save,
  Loader2,
  Send,
  Trash2,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Edit,
  Plug,
  Megaphone,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
  PAUSED: 'bg-blue-100 text-blue-800',
  DISABLED: 'bg-gray-200 text-gray-600',
};
const CAT_COLORS: Record<string, string> = {
  MARKETING: 'bg-purple-100 text-purple-700',
  UTILITY: 'bg-blue-100 text-blue-700',
  AUTHENTICATION: 'bg-amber-100 text-amber-700',
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({
    name: '',
    displayName: '',
    category: 'UTILITY',
    language: 'pt_BR',
    headerText: '',
    bodyText: '',
    footerText: '',
    variables: [],
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : '';
      const res = await fetch(`/api/admin/messaging/templates${qs}`);
      if (res.ok) {
        const d = await res.json();
        setTemplates(d.templates || []);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [filter]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      displayName: '',
      category: 'UTILITY',
      language: 'pt_BR',
      headerText: '',
      bodyText: '',
      footerText: '',
      variables: [],
    });
    setOpen(true);
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      name: t.name,
      displayName: t.displayName,
      category: t.category,
      language: t.language,
      headerText: t.headerText || '',
      bodyText: t.bodyText,
      footerText: t.footerText || '',
      variables: t.variables || [],
    });
    setOpen(true);
  };

  const parseVariables = (body: string) => {
    const set = new Set<string>();
    const re = /\{\{\s*(\w+)\s*\}\}/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      set.add(m[1]);
    }
    return Array.from(set).map((name) => ({ name, example: '' }));
  };

  const save = async () => {
    if (!form.name || !form.displayName || !form.bodyText) {
      toast.error('Preencha nome, rótulo e corpo');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        variables: parseVariables(form.bodyText),
      };
      const url = editing
        ? `/api/admin/messaging/templates/${editing.id}`
        : '/api/admin/messaging/templates';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(editing ? 'Template atualizado' : 'Template criado');
        setOpen(false);
        await load();
      } else {
        toast.error(d.error || 'Erro');
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este template?')) return;
    const res = await fetch(`/api/admin/messaging/templates/${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (res.ok) {
      toast.success('Removido');
      load();
    } else toast.error(d.error || 'Erro');
  };

  const submit = async (t: any, provider: string) => {
    setSubmitting(t.id);
    try {
      const res = await fetch(`/api/admin/messaging/templates/${t.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(`Submetido para ${provider}`);
        load();
      } else toast.error(d.error || 'Erro');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Templates Aprovados</h1>
            <p className="text-sm text-gray-600">Crie e submeta modelos de mensagem para serem aprovados pelas operadoras.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/messaging/providers">
            <Button variant="outline" className="gap-2"><Plug className="h-4 w-4" />Provedores</Button>
          </Link>
          <Link href="/admin/messaging/campaigns">
            <Button variant="outline" className="gap-2"><Megaphone className="h-4 w-4" />Campanhas</Button>
          </Link>
          <Button onClick={openCreate} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4" />Novo Template
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {['', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              filter === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {s || 'Todos'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-6">Carregando...</div>
      ) : templates.length === 0 ? (
        <Card className="p-10 text-center text-gray-500">
          <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
          <p>Nenhum template criado ainda. Clique em <strong>Novo Template</strong> para começar.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{t.displayName}</h3>
                    <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{t.name}</code>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Badge className={`${STATUS_COLORS[t.status] || ''} border-0`}>{t.status}</Badge>
                    <Badge className={`${CAT_COLORS[t.category] || ''} border-0`}>{t.category}</Badge>
                    <Badge variant="outline" className="text-xs">{t.language}</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(t.id)} className="text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {t.headerText && (
                <div className="mt-3 text-xs font-semibold text-gray-700">{t.headerText}</div>
              )}
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{t.bodyText}</p>
              {t.footerText && (
                <div className="mt-2 text-xs text-gray-500 italic">{t.footerText}</div>
              )}
              {t.rejectionReason && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{t.rejectionReason}</span>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => submit(t, 'META_CLOUD')}
                  disabled={submitting === t.id}
                  className="gap-1 text-xs"
                >
                  {submitting === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Submeter Meta
                </Button>
                <Button variant="outline" size="sm" onClick={() => submit(t, 'TAKE_BLIP')} disabled={submitting === t.id} className="gap-1 text-xs">
                  <Send className="h-3 w-3" />Take Blip
                </Button>
                <Button variant="outline" size="sm" onClick={() => submit(t, 'ZENVIA')} disabled={submitting === t.id} className="gap-1 text-xs">
                  <Send className="h-3 w-3" />Zenvia
                </Button>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                Enviadas: <strong>{t.totalSent}</strong> • Usos em campanhas: <strong>{t._count?.campaigns ?? 0}</strong>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar template' : 'Novo template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome interno (snake_case)</Label>
                <Input
                  placeholder="ex: reserva_confirmada"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  disabled={!!editing}
                />
                <p className="text-[11px] text-gray-500 mt-1">Deve coincidir com o nome aprovado no provedor.</p>
              </div>
              <div>
                <Label>Nome exibido</Label>
                <Input
                  placeholder="Reserva confirmada"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <select
                  className="w-full border rounded-md p-2 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="UTILITY">Utilitário (confirmações)</option>
                  <option value="MARKETING">Marketing (promoções)</option>
                  <option value="AUTHENTICATION">Autenticação (OTP)</option>
                </select>
              </div>
              <div>
                <Label>Idioma</Label>
                <select
                  className="w-full border rounded-md p-2 text-sm"
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                >
                  <option value="pt_BR">Português (pt_BR)</option>
                  <option value="en_US">English (en_US)</option>
                  <option value="es_ES">Español (es_ES)</option>
                </select>
              </div>
            </div>

            <div>
              <Label>Header (opcional)</Label>
              <Input
                placeholder="Ex: Restaurante do João"
                value={form.headerText}
                onChange={(e) => setForm({ ...form, headerText: e.target.value })}
              />
            </div>
            <div>
              <Label>Corpo da mensagem *</Label>
              <Textarea
                rows={6}
                placeholder="Olá {{1}}, sua reserva para {{2}} pessoas em {{3}} foi confirmada!"
                value={form.bodyText}
                onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
              />
              <p className="text-[11px] text-gray-500 mt-1">Use {`{{1}}`}, {`{{2}}`}... para variáveis.</p>
            </div>
            <div>
              <Label>Footer (opcional)</Label>
              <Input
                placeholder="Obrigado pela preferência!"
                value={form.footerText}
                onChange={(e) => setForm({ ...form, footerText: e.target.value })}
              />
            </div>

            {form.bodyText && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs">
                <div className="font-semibold text-emerald-700 mb-1">Pré-visualização das variáveis detectadas:</div>
                <div className="flex gap-1 flex-wrap">
                  {parseVariables(form.bodyText).map((v) => (
                    <Badge key={v.name} variant="outline">{`{{${v.name}}}`}</Badge>
                  ))}
                  {parseVariables(form.bodyText).length === 0 && <span className="text-gray-500">Nenhuma</span>}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
