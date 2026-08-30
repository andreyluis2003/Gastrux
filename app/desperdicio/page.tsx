'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BackButton } from '@/components/ui/back-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { GlassCard } from '@/components/ui/glass-card';
import { FadeIn } from '@/components/ui/animate';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Trash2, Plus, AlertTriangle, DollarSign, TrendingDown, Package } from 'lucide-react';
import { toast } from 'sonner';

const REASON_LABELS: Record<string, string> = {
  EXPIRED: 'Vencimento',
  PREPARATION: 'Preparo',
  DAMAGED: 'Danificado',
  OVERPRODUCTION: 'Sobreprodução',
  STORAGE: 'Armazenamento',
  OTHER: 'Outro',
};

const REASON_COLORS: Record<string, string> = {
  EXPIRED: 'bg-red-100 text-red-700',
  PREPARATION: 'bg-amber-100 text-amber-700',
  DAMAGED: 'bg-orange-100 text-orange-700',
  OVERPRODUCTION: 'bg-purple-100 text-purple-700',
  STORAGE: 'bg-blue-100 text-blue-700',
  OTHER: 'bg-slate-100 text-slate-700',
};

export default function DesperdicioPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showSkeleton = true) => {
    try {
      if (showSkeleton) setLoading(true);
      // Cache-bust to always get fresh data — crucial so a newly registered
      // waste log appears immediately in the tracking view.
      const res = await fetch(`/api/waste?period=30&_ts=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch { toast.error('Erro ao carregar dados'); }
    finally { if (showSkeleton) setLoading(false); }
  };

  const openDialog = async () => {
    try {
      const res = await fetch('/api/ingredients', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setIngredients(await res.json());
      setShowDialog(true);
    } catch { toast.error('Erro ao carregar insumos'); }
  };

  const handleSubmit = async () => {
    if (!selectedIngredient || !quantity || !reason) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const ing = ingredients.find(i => i.id === selectedIngredient);
      const res = await fetch('/api/waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ingredientId: selectedIngredient,
          quantity: parseFloat(quantity),
          unit: ing?.standardUnit || 'KG',
          reason,
          notes,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Desperdício registrado');
      // Refresh the tracking list BEFORE closing the dialog so the new
      // record is guaranteed to be on screen when the user returns.
      await fetchData(false);
      setShowDialog(false);
      setSelectedIngredient('');
      setQuantity('');
      setReason('');
      setNotes('');
    } catch { toast.error('Erro ao registrar'); }
    finally { setSaving(false); }
  };

  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Desperdício' }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <BackButton href="/dashboard" label="Voltar" />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Rastreamento de Desperdício</h1>
            <p className="text-sm text-muted-foreground">Últimos 30 dias</p>
          </div>
        </div>
        <Button onClick={openDialog} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Registrar Perda
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <LoadingSkeleton key={i} variant="card" height="h-28" />)}
        </div>
      ) : data ? (
        <FadeIn>
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <GlassCard className="p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <DollarSign className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Custo Total Perdido</p>
                    <p className="text-2xl font-bold text-red-600">{fmt(data.totalCost)}</p>
                  </div>
                </div>
              </GlassCard>
              <GlassCard className="p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                    <Trash2 className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total de Registros</p>
                    <p className="text-2xl font-bold">{data.totalItems}</p>
                  </div>
                </div>
              </GlassCard>
              <GlassCard className="p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <TrendingDown className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Custo Médio/Registro</p>
                    <p className="text-2xl font-bold">{data.totalItems > 0 ? fmt(data.totalCost / data.totalItems) : 'R$ 0,00'}</p>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* By Reason */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6">
                <h2 className="text-lg font-bold mb-4">Por Motivo</h2>
                {Object.keys(data.byReason).length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum registro ainda</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(data.byReason).map(([reason, info]: [string, any]) => (
                      <div key={reason} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${REASON_COLORS[reason] || 'bg-slate-100'}`}>
                            {REASON_LABELS[reason] || reason}
                          </span>
                          <span className="text-sm text-muted-foreground">{info.count}x</span>
                        </div>
                        <span className="text-sm font-bold">{fmt(info.cost)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="text-lg font-bold mb-4">Insumos Mais Desperdiçados</h2>
                {data.topWasted.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum registro ainda</p>
                ) : (
                  <div className="space-y-3">
                    {data.topWasted.slice(0, 5).map((item: any, i: number) => {
                      const maxCost = data.topWasted[0]?.cost || 1;
                      return (
                        <div key={item.id}>
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium">{item.name}</span>
                            <span className="text-sm font-bold">{fmt(item.cost)}</span>
                          </div>
                          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 rounded-full" style={{ width: `${(item.cost / maxCost) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* Recent Logs */}
            <Card className="p-6">
              <h2 className="text-lg font-bold mb-4">Registros Recentes</h2>
              {data.wasteLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum desperdício registrado. Clique em "Registrar Perda" para começar.</p>
              ) : (
                <div className="space-y-3">
                  {data.wasteLogs.slice(0, 20).map((log: any) => (
                    <div key={log.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${REASON_COLORS[log.reason] || 'bg-slate-100'}`}>
                          {REASON_LABELS[log.reason] || log.reason}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{log.ingredient.name}</p>
                          <p className="text-xs text-muted-foreground">{log.quantity} {log.unit}{log.notes ? ` — ${log.notes}` : ''}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-red-600">{fmt(log.estimatedCost)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(log.date).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </FadeIn>
      ) : null}

      {/* Register Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Desperdício</DialogTitle>
            <DialogDescription>Registre uma perda de insumo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Insumo *</Label>
              <Select value={selectedIngredient} onValueChange={setSelectedIngredient}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {ingredients.map((ing: any) => (
                    <SelectItem key={ing.id} value={ing.id}>{ing.name} ({ing.standardUnit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade *</Label>
              <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} step="0.01" min="0.01" placeholder="Ex: 2.5" />
            </div>
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue placeholder="Selecione o motivo..." /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REASON_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes opcionais..." rows={2} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving} loading={saving}>Registrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
