'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  dailyRateCents: number;
  perDeliveryCents: number;
  active: boolean;
}

interface Form { id?: string; name: string; phone: string; dailyRate: string; perDelivery: string }

const EMPTY: Form = { name: '', phone: '', dailyRate: '', perDelivery: '' };
const reais = (cents: number) => (cents ? (cents / 100).toFixed(2).replace('.', ',') : '');
const phoneText = (d: string | null) => {
  if (!d) return '-';
  const rest = d.slice(2);
  return `(${d.slice(0, 2)}) ${rest.length === 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`}`;
};

/** Cadastro de entregadores (spec 2026-11-17): diária e valor por entrega; desativar em vez de apagar. */
export default function EntregadoresPage() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  // The server checks again; the cashier only sees the list
  const [canEdit, setCanEdit] = useState(false);

  const load = async () => {
    const res = await fetch('/api/delivery/drivers?all=1');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Erro ao carregar os entregadores'); setDrivers([]); return; }
    setDrivers(data.drivers);
    setCanEdit(['OWNER', 'MANAGER', 'ADMIN'].includes(data.role));
  };
  useEffect(() => { load(); }, []);

  const send = async (url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Não foi possível salvar'); return false; }
      await load();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!form) return;
    const { id, ...body } = form;
    const ok = id ? await send(`/api/delivery/drivers/${id}`, 'PATCH', body) : await send('/api/delivery/drivers', 'POST', body);
    if (ok) { toast.success(id ? 'Entregador atualizado' : 'Entregador cadastrado'); setForm(null); }
  };

  const toggle = async (d: Driver) => {
    if (await send(`/api/delivery/drivers/${d.id}`, 'PATCH', { active: !d.active })) toast.success(d.active ? 'Entregador desativado' : 'Entregador ativado');
  };

  const field = (key: keyof Form) => ({
    value: form?.[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f)),
  });

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Entregadores</h1>
        <div className="flex items-center gap-3">
          <Link href="/caixa" className="underline text-sm">Voltar ao caixa</Link>
          {canEdit && <Link href="/caixa/entregadores/relatorio" className="underline text-sm">Relatório</Link>}
          {canEdit && !form && <Button onClick={() => setForm({ ...EMPTY })}>Novo entregador</Button>}
        </div>
      </div>
      <p className="text-sm text-gray-600">
        Diária: paga uma vez por dia de trabalho. Por entrega: paga a cada entrega feita. Deixe em branco o que não usa.
      </p>

      {form && (
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">{form.id ? 'Editar entregador' : 'Novo entregador'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Nome<Input {...field('name')} maxLength={60} autoFocus /></label>
            <label className="text-sm">Celular (opcional)<Input {...field('phone')} inputMode="tel" placeholder="(11) 99999-8888" /></label>
            <label className="text-sm">Diária (R$)<Input {...field('dailyRate')} inputMode="decimal" placeholder="0,00" /></label>
            <label className="text-sm">Por entrega (R$)<Input {...field('perDelivery')} inputMode="decimal" placeholder="0,00" /></label>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>Cancelar</Button>
          </div>
        </Card>
      )}

      {drivers === null ? <p>Carregando...</p> : drivers.length === 0 ? (
        <p className="text-gray-500">Nenhum entregador cadastrado.</p>
      ) : (
        <ul className="space-y-2">
          {drivers.map((d) => (
            <li key={d.id}>
              <Card className={`p-3 flex flex-wrap items-center justify-between gap-2 ${d.active ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <p className="font-semibold break-words">{d.name}{!d.active && <span className="ml-2 text-xs font-normal text-gray-500">(desativado)</span>}</p>
                  <p className="text-sm text-gray-600">
                    {phoneText(d.phone)} · Diária {brl(d.dailyRateCents)} · Por entrega {brl(d.perDeliveryCents)}
                  </p>
                </div>
                {canEdit && <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={saving}
                    onClick={() => setForm({ id: d.id, name: d.name, phone: d.phone ?? '', dailyRate: reais(d.dailyRateCents), perDelivery: reais(d.perDeliveryCents) })}>
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => toggle(d)}>{d.active ? 'Desativar' : 'Ativar'}</Button>
                </div>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
