'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Gift, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BackButton } from '@/components/ui/back-button';

// Spec docs/superpowers/specs/2026-10-23-cashback-design.md §9: the owner's rule and this month's numbers
interface Settings { enabled: boolean; percent: number; validityMonths: number; minUseCents: number; available: boolean }
interface Summary {
  creditedMonthCents: number;
  usedMonthCents: number;
  openCents: number;
  expiringCents: number;
  movements: Array<{ kind: 'CREDIT' | 'USE'; amountCents: number; at: string; expiresAt: string | null; reversed: boolean; customerName?: string }>;
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CashbackPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [form, setForm] = useState({ enabled: true, percent: '5', validityMonths: '6', minUse: '10' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, m] = await Promise.all([fetch('/api/cashback/settings', { cache: 'no-store' }), fetch('/api/cashback/summary', { cache: 'no-store' })]);
        const st = await s.json();
        if (!s.ok) throw new Error(st.error);
        setSettings(st);
        setForm({ enabled: st.enabled, percent: String(st.percent).replace('.', ','), validityMonths: String(st.validityMonths), minUse: String(st.minUseCents / 100).replace('.', ',') });
        if (m.ok) setSummary(await m.json());
      } catch (e: any) {
        toast.error(e.message || 'Erro ao carregar o cashback');
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const minUseCents = Math.round(Number(form.minUse.replace(',', '.')) * 100);
      const res = await fetch('/api/cashback/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: form.enabled, percent: form.percent, validityMonths: Number(form.validityMonths), minUseCents }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setSettings(out);
      toast.success('Cashback salvo');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <BackButton />
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2 mt-1"><Gift className="h-7 w-7 text-emerald-600" /> Cashback</h1>
        <p className="text-sm text-gray-500 mt-1">
          O cliente ganha um crédito em reais a cada compra e usa como desconto na próxima. O caixa digita o celular do cliente ao fechar a conta.
        </p>
      </div>

      {!settings.available ? (
        <Card className="p-5 bg-amber-50 border-amber-200 space-y-2">
          <p className="font-semibold text-amber-900">O cashback é do plano Business.</p>
          <p className="text-sm text-amber-900">No seu plano, o celular do cliente na conta já soma as compras em Clientes (CRM).</p>
          <Link href="/pricing"><Button size="sm">Ver planos</Button></Link>
        </Card>
      ) : (
        <>
          <Card className="p-5 space-y-4">
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              Cashback ligado
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Percentual de cada compra (%)</label>
                <Input inputMode="decimal" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
                <p className="text-xs text-gray-500 mt-1">De 0,5% a 30%. Sem a taxa de serviço e a entrega.</p>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Validade (meses)</label>
                <Input type="number" min={1} max={24} value={form.validityMonths} onChange={(e) => setForm({ ...form, validityMonths: e.target.value })} />
                <p className="text-xs text-gray-500 mt-1">O crédito mais antigo é usado primeiro.</p>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Mínimo para usar (R$)</label>
                <Input inputMode="decimal" value={form.minUse} onChange={(e) => setForm({ ...form, minUse: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button></div>
          </Card>

          {summary && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="p-4"><p className="text-xs text-gray-500">Creditado no mês</p><p className="text-xl font-bold">{brl(summary.creditedMonthCents)}</p></Card>
                <Card className="p-4"><p className="text-xs text-gray-500">Usado no mês</p><p className="text-xl font-bold">{brl(summary.usedMonthCents)}</p></Card>
                <Card className="p-4"><p className="text-xs text-gray-500">Saldo dos clientes</p><p className="text-xl font-bold">{brl(summary.openCents)}</p></Card>
                <Card className="p-4"><p className="text-xs text-gray-500">Vence em 30 dias</p><p className="text-xl font-bold">{brl(summary.expiringCents)}</p></Card>
              </div>
              <Card className="p-0 overflow-hidden">
                <h2 className="font-semibold px-4 pt-4 pb-2">Últimas movimentações</h2>
                {summary.movements.length === 0 ? (
                  <p className="px-4 pb-4 text-sm text-gray-500">Nenhuma movimentação ainda. O crédito entra quando uma conta com o celular do cliente é fechada.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {summary.movements.map((m, i) => (
                        <tr key={i} className={`border-t ${m.reversed ? 'text-gray-400 line-through' : ''}`}>
                          <td className="px-4 py-2">{new Date(m.at).toLocaleDateString('pt-BR')}</td>
                          <td className="px-4 py-2">{m.customerName}</td>
                          <td className="px-4 py-2">{m.kind === 'CREDIT' ? 'Ganhou' : 'Usou'}</td>
                          <td className={`px-4 py-2 text-right font-medium ${m.kind === 'CREDIT' ? 'text-emerald-700' : ''}`}>{m.kind === 'CREDIT' ? '+' : '−'} {brl(m.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
