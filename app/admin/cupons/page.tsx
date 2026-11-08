'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { brl, reaisToCents } from '@/components/caixa/money';
import { couponLabel, normalizeCode, type CouponKind } from '@/lib/coupons/rules';

interface Coupon {
  id: string;
  code: string;
  kind: CouponKind;
  value: number;
  minOrderCents: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  maxPerCustomer: number | null;
  firstOrderOnly: boolean;
  active: boolean;
  usedCount: number;
  discountGivenCents: number;
}

const EMPTY = { code: '', kind: 'PERCENT' as CouponKind, value: '10', minOrder: '', validUntil: '', maxUses: '', maxPerCustomer: '1', firstOrderOnly: false };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : null);

/**
 * Clientes e marketing > Cupons (spec 2026-11-08 cupons §5): create a coupon for the delivery site, see its uses and
 * the discount given, pause or turn it back on.
 */
export default function CuponsPage() {
  const [list, setList] = useState<Coupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/coupons', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || 'Não foi possível carregar os cupons'); return; }
    setList(body);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const value = form.kind === 'PERCENT' ? Number(form.value) : form.kind === 'FIXED' ? reaisToCents(form.value) : 0;
    if (form.kind === 'FIXED' && value === null) { toast.error('Valor do desconto inválido'); return; }
    const minOrderCents = form.minOrder.trim() ? reaisToCents(form.minOrder, { allowZero: true }) : 0;
    if (minOrderCents === null) { toast.error('Pedido mínimo inválido'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code, kind: form.kind, value, minOrderCents,
          // Valid until the end of the chosen day
          validUntil: form.validUntil ? `${form.validUntil}T23:59:59-03:00` : null,
          maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
          maxPerCustomer: form.maxPerCustomer.trim() ? Number(form.maxPerCustomer) : null,
          firstOrderOnly: form.firstOrderOnly,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível criar'); return; }
      toast.success(`Cupom ${body.code} criado`);
      setForm(EMPTY);
      load();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: Coupon) => {
    const res = await fetch(`/api/admin/coupons/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !c.active }) });
    if (!res.ok) { toast.error('Não foi possível mudar'); return; }
    toast.success(c.active ? `${c.code} pausado` : `${c.code} ativo`);
    load();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <BackButton href="/dashboard" />
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Cupons</h1>
          <p className="text-sm text-muted-foreground">Códigos de desconto que o cliente digita ao finalizar o pedido no site de delivery.</p>
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <h2 className="font-bold">Novo cupom</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Código</Label>
            <Input value={form.code} maxLength={20} placeholder="PRIMEIRA10" onChange={(e) => setForm({ ...form, code: normalizeCode(e.target.value) })} />
          </div>
          <div>
            <Label>Tipo</Label>
            <select className="mt-1 h-10 w-full rounded border px-2" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CouponKind })}>
              <option value="PERCENT">% de desconto</option>
              <option value="FIXED">Valor em reais</option>
              <option value="FREE_DELIVERY">Entrega grátis</option>
            </select>
          </div>
          {form.kind !== 'FREE_DELIVERY' && (
            <div>
              <Label>{form.kind === 'PERCENT' ? 'Desconto (%)' : 'Desconto (R$)'}</Label>
              <Input inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
          )}
          <div>
            <Label>Pedido mínimo (R$, opcional)</Label>
            <Input inputMode="decimal" value={form.minOrder} placeholder="0,00" onChange={(e) => setForm({ ...form, minOrder: e.target.value })} />
          </div>
          <div>
            <Label>Vale até (opcional)</Label>
            <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
          </div>
          <div>
            <Label>Limite de usos no total (opcional)</Label>
            <Input inputMode="numeric" value={form.maxUses} placeholder="Sem limite" onChange={(e) => setForm({ ...form, maxUses: e.target.value.replace(/\D/g, '') })} />
          </div>
          <div>
            <Label>Usos por cliente (pelo celular)</Label>
            <Input inputMode="numeric" value={form.maxPerCustomer} placeholder="Sem limite" onChange={(e) => setForm({ ...form, maxPerCustomer: e.target.value.replace(/\D/g, '') })} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setForm({ ...form, firstOrderOnly: e.target.checked })} />
            Só no primeiro pedido do cliente
          </label>
        </div>
        <Button disabled={busy || form.code.length < 3} onClick={create}>Criar cupom</Button>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {list === null && !error && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {list && list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cupom ainda.</p>}
      {list && list.length > 0 && (
        <div className="space-y-2">
          {list.map((c) => (
            <Card key={c.id} className={`p-3 ${c.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-lg font-bold">{c.code}</p>
                  <p className="text-sm">{couponLabel(c)}{c.minOrderCents ? ` · pedido mínimo ${brl(c.minOrderCents)}` : ''}{c.firstOrderOnly ? ' · só no primeiro pedido' : ''}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.usedCount} {c.usedCount === 1 ? 'uso' : 'usos'}{c.maxUses ? ` de ${c.maxUses}` : ''} · {brl(c.discountGivenCents)} de desconto dado
                    {c.maxPerCustomer ? ` · ${c.maxPerCustomer} por cliente` : ''}{day(c.validUntil) ? ` · vale até ${day(c.validUntil)}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => toggle(c)}>{c.active ? 'Pausar' : 'Ativar'}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
