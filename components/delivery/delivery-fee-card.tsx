'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Bike, Loader2 } from 'lucide-react';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Taxa de entrega of the delivery link (owner request 2026-11-14): 0 = free delivery. */
export function DeliveryFeeCard() {
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoadError(false);
    try {
      const res = await fetch('/api/admin/delivery/fee', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json.deliveryFee !== 'number') throw new Error();
      setSaved(json.deliveryFee);
      setValue(json.deliveryFee.toFixed(2).replace('.', ','));
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (fee: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/delivery/fee', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryFee: fee }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Não foi possível salvar');
        return;
      }
      setSaved(json.deliveryFee);
      setValue(json.deliveryFee.toFixed(2).replace('.', ','));
      toast.success(json.deliveryFee === 0 ? 'Entrega grátis ativada' : `Taxa de entrega: ${brl(json.deliveryFee)}`);
    } catch {
      toast.error('Não foi possível salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <Card className="p-6 space-y-3">
        <p className="text-sm text-gray-600">Não foi possível carregar a taxa de entrega</p>
        <Button variant="outline" onClick={load}>Tentar novamente</Button>
      </Card>
    );
  }
  if (saved === null) {
    return (
      <Card className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="font-bold flex items-center gap-2"><Bike className="h-5 w-5 text-orange-600" /> Taxa de entrega</h3>
        <p className="text-sm text-gray-500">
          Cobrada nos pedidos com entrega feitos pelo link. Retirada no local não paga taxa.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-600 mb-1">Valor (R$)</span>
          <Input
            inputMode="decimal"
            className="w-32"
            value={value}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(value); }}
            aria-label="Taxa de entrega em reais"
          />
        </label>
        <Button onClick={() => save(value)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
        </Button>
        {saved !== 0 && (
          <Button variant="outline" onClick={() => save('0')} disabled={saving}>Entrega grátis</Button>
        )}
      </div>
      <p className="text-sm">
        Agora: <span className="font-medium">{saved === 0 ? 'entrega grátis' : brl(saved)}</span>
      </p>
    </Card>
  );
}
