'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Award, Plus, Loader2, Trash2, CheckCircle2, XCircle, Gift } from 'lucide-react';

interface Program {
  id: string;
  name: string;
}

interface Milestone {
  id: string;
  programId: string;
  name: string;
  description: string | null;
  orderCount: number;
  bonusPoints: number;
  discountPercent: number | null;
  freeItem: string | null;
  active: boolean;
  redemptionCount: number;
  notifyCustomer: boolean;
  program?: { id: string; name: string };
}

export default function LoyaltyMilestonesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    programId: '',
    name: '',
    description: '',
    orderCount: 2,
    bonusPoints: 50,
    discountPercent: '',
    freeItem: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([
        fetch('/api/loyalty/programs'),
        fetch('/api/loyalty/milestones'),
      ]);
      if (pRes.ok) {
        const pd = await pRes.json();
        const ps = Array.isArray(pd) ? pd : (pd.programs || pd.items || []);
        setPrograms(ps);
        if (ps.length && !form.programId) {
          setForm((f) => ({ ...f, programId: ps[0].id }));
        }
      }
      if (mRes.ok) {
        const md = await mRes.json();
        setMilestones(md.items || []);
      }
    } catch (e) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createMilestone = async () => {
    if (!form.programId || !form.name || !form.orderCount) {
      toast.error('Preencha programa, nome e número de pedidos');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/loyalty/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          bonusPoints: Number(form.bonusPoints || 0),
          discountPercent: form.discountPercent ? Number(form.discountPercent) : null,
          freeItem: form.freeItem || null,
        }),
      });
      if (res.ok) {
        toast.success('Marco criado');
        setShowForm(false);
        setForm({ programId: form.programId, name: '', description: '', orderCount: 2, bonusPoints: 50, discountPercent: '', freeItem: '' });
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Erro ao criar');
      }
    } catch (e) {
      toast.error('Erro');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (m: Milestone) => {
    try {
      const res = await fetch(`/api/loyalty/milestones/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !m.active }),
      });
      if (res.ok) {
        toast.success(m.active ? 'Desativado' : 'Ativado');
        load();
      }
    } catch {
      toast.error('Erro');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este marco?')) return;
    try {
      const res = await fetch(`/api/loyalty/milestones/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Excluido');
        load();
      }
    } catch {
      toast.error('Erro');
    }
  };

  const seedDefaults = async () => {
    if (!form.programId) {
      toast.error('Selecione um programa primeiro');
      return;
    }
    setSaving(true);
    try {
      const defaults = [
        { programId: form.programId, name: '2o Pedido Especial', orderCount: 2, bonusPoints: 50, description: 'Volte sempre! 50 pontos extras no 2o pedido.' },
        { programId: form.programId, name: 'Cliente Frequente', orderCount: 5, bonusPoints: 150, description: 'Obrigado pela fidelidade! 150 pontos extras.' },
        { programId: form.programId, name: 'Cliente VIP', orderCount: 10, bonusPoints: 500, description: 'Voce e VIP! 500 pontos bonus.' },
      ];
      let created = 0;
      for (const d of defaults) {
        const res = await fetch('/api/loyalty/milestones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        if (res.ok) created++;
      }
      toast.success(`${created} marcos padrao criados`);
      load();
    } catch (e) {
      toast.error('Erro ao criar marcos');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <BackButton />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
              <Award className="h-7 w-7 text-amber-600" />
              Marcos de Fidelidade
            </h1>
            <p className="text-gray-600 mt-1">Recompense clientes em numeros especificos de pedidos (aumenta repeat orders)</p>
          </div>
          <div className="flex gap-2">
            {milestones.length === 0 && programs.length > 0 && (
              <Button onClick={seedDefaults} disabled={saving} variant="outline">
                <Gift className="mr-2 h-4 w-4" /> Criar padrao
              </Button>
            )}
            <Button onClick={() => setShowForm((s) => !s)} className="bg-amber-600 hover:bg-amber-700 text-white">
              <Plus className="mr-2 h-4 w-4" /> Novo marco
            </Button>
          </div>
        </div>

        {programs.length === 0 && !loading && (
          <Card className="p-5 bg-amber-50 border-amber-200">
            <p className="text-sm text-amber-900">
              Voce precisa de pelo menos um programa de fidelidade ativo. <a className="underline font-medium" href="/dashboard/loyalty">Configurar programa</a>
            </p>
          </Card>
        )}

        {showForm && (
          <Card className="p-5 space-y-3 border-amber-200">
            <div>
              <Label>Programa</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={form.programId}
                onChange={(e) => setForm({ ...form, programId: e.target.value })}
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Nome do marco</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: 2o Pedido" />
              </div>
              <div>
                <Label>Pedido número</Label>
                <Input type="number" value={form.orderCount} onChange={(e) => setForm({ ...form, orderCount: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Descricao</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Pontos bonus</Label>
                <Input type="number" value={form.bonusPoints} onChange={(e) => setForm({ ...form, bonusPoints: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Desconto %</Label>
                <Input type="number" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
              </div>
              <div>
                <Label>Item gratis</Label>
                <Input value={form.freeItem} onChange={(e) => setForm({ ...form, freeItem: e.target.value })} placeholder="Ex: Sobremesa" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={createMilestone} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>
        ) : milestones.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <Award className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">Nenhum marco de fidelidade criado ainda.</p>
            <p className="text-sm text-gray-500 mt-1">Crie marcos para recompensar clientes em pedidos especificos.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {milestones.map((m) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-amber-100 text-amber-700">
                        Pedido #{m.orderCount}
                      </Badge>
                      {m.program && (
                        <Badge variant="outline" className="text-xs">{m.program.name}</Badge>
                      )}
                      {!m.active && <Badge variant="secondary">Inativo</Badge>}
                      <span className="text-xs text-gray-500 ml-auto">Resgatado {m.redemptionCount}x</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mt-2">{m.name}</h3>
                    {m.description && <p className="text-sm text-gray-600 mt-1">{m.description}</p>}
                    <div className="flex flex-wrap gap-3 mt-2 text-sm">
                      {m.bonusPoints > 0 && (
                        <span className="text-amber-700 font-medium">+{m.bonusPoints} pontos</span>
                      )}
                      {m.discountPercent && (
                        <span className="text-emerald-700 font-medium">{m.discountPercent}% OFF</span>
                      )}
                      {m.freeItem && (
                        <span className="text-violet-700 font-medium">{m.freeItem} gratis</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggle(m)} title={m.active ? 'Desativar' : 'Ativar'}>
                      {m.active ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
