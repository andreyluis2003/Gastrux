'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KIND_INFO, addMonths, monthLabel, type Indicators, type UtilityKind } from '@/lib/utility-bills/rules';

interface Bill { referenceMonth: string; amountCents: number; consumption: number | null; dueDate: string | null; notes: string | null }
interface Account { id: string; kind: UtilityKind; name: string; unit: string | null; active: boolean; bills: Bill[]; latest: { referenceMonth: string; indicators: Indicators | null } | null }
interface Screen { insights: boolean; defaultMonth: string; accounts: Account[] }

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const signed = (p: number) => `${p > 0 ? '+' : ''}${Math.round(p)}%`;
const tone = (p: number, alert = false) => (alert ? 'text-red-600 font-semibold' : p > 0 ? 'text-amber-600' : 'text-emerald-600');
const FIXED: UtilityKind[] = ['ENERGY', 'WATER', 'PIPED_GAS', 'PHONE_INTERNET'];

/** Contas de consumo (spec 2026-10-16): enter bills, history, Pro indicators */
export default function UtilityBillsPage() {
  const [data, setData] = useState<Screen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ accountId: string; referenceMonth: string; amount: string; consumption: string; dueDate: string; notes: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/utility-bills', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error || 'Não foi possível carregar as contas');
      setError(null);
      setData(body);
    } catch {
      setError('Sem conexão. Tente de novo.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (url: string, method: string, body: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setError(out.error || 'Não foi possível salvar'); return null; }
      setError(null);
      await load();
      return out;
    } catch {
      setError('Sem conexão: nada foi salvo. Tente de novo.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="max-w-3xl mx-auto p-4 text-muted-foreground">{error ?? 'Carregando…'}</div>;

  const active = data.accounts.filter((a) => a.active);
  const missingFixed = FIXED.filter((k) => !data.accounts.some((a) => a.kind === k && a.active));
  const startForm = (a: Account, ym = data.defaultMonth) => {
    const b = a.bills.find((x) => x.referenceMonth === ym);
    setError(null);
    setForm({ accountId: a.id, referenceMonth: ym, amount: b ? (b.amountCents / 100).toFixed(2).replace('.', ',') : '', consumption: b?.consumption != null ? String(b.consumption).replace('.', ',') : '', dueDate: b?.dueDate ?? '', notes: b?.notes ?? '' });
  };
  const formAccount = form ? data.accounts.find((a) => a.id === form.accountId) : null;
  const correcting = !!(form && formAccount?.bills.some((b) => b.referenceMonth === form.referenceMonth));

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Contas de consumo</h1>
        <p className="text-sm text-muted-foreground">Energia, água, gás, telefone e outras contas do mês. Entram na DRE pelo mês de referência.</p>
      </div>
      {error && !form && <Card className="p-3 text-red-600 text-sm">{error}</Card>}

      {(missingFixed.length > 0 || active.length === 0) && (
        <Card className="p-3 space-y-2">
          <div className="text-sm font-medium">{active.length === 0 ? 'Quais contas o restaurante tem?' : 'Adicionar conta'}</div>
          <div className="flex gap-2 flex-wrap">
            {missingFixed.map((k) => <Button key={k} size="sm" variant="outline" disabled={busy} onClick={() => call('/api/utility-bills/accounts', 'POST', { kind: k })}>+ {KIND_INFO[k].label}</Button>)}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => call('/api/utility-bills/accounts', 'POST', { kind: 'BOTTLED_GAS', name: 'Gás P13' })}>+ Gás P13</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => call('/api/utility-bills/accounts', 'POST', { kind: 'BOTTLED_GAS', name: 'Gás P45' })}>+ Gás P45</Button>
          </div>
          <div className="flex gap-2">
            <input className="flex-1 border rounded p-2 bg-background text-sm" placeholder="Outra conta (ex.: Aluguel, Condomínio)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button size="sm" disabled={busy || !newName.trim()} onClick={async () => { if (await call('/api/utility-bills/accounts', 'POST', { kind: 'OTHER', name: newName })) setNewName(''); }}>Adicionar</Button>
          </div>
        </Card>
      )}

      {!data.insights && active.length > 0 && (
        <Card className="p-3 text-sm">
          Comparação com o mês anterior e a média de 3 meses, preço por kWh/m³, % do faturamento e aviso de consumo alto: no plano Pro. <Link href="/pricing" className="font-medium text-primary hover:underline">Ver planos</Link>
        </Card>
      )}

      {active.map((a) => {
        const last = a.bills[0];
        const ind = a.latest?.indicators;
        const alert = !!(ind?.avg3 && ind.measure > ind.avg3.average * 1.2);
        const max = Math.max(1, ...a.bills.map((b) => (a.unit ? b.consumption ?? 0 : b.amountCents)));
        return (
          <Card key={a.id} className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-semibold">{a.name}{last && <span className="text-muted-foreground font-normal"> · {monthLabel(last.referenceMonth)}</span>}</div>
              <Button size="sm" disabled={busy} onClick={() => startForm(a)}>Lançar conta</Button>
            </div>
            {last ? (
              <div className="text-lg font-bold">{brl(last.amountCents)}{a.unit && last.consumption != null && <span className="text-base font-normal"> · {num(last.consumption)} {a.unit}</span>}</div>
            ) : <div className="text-sm text-muted-foreground">Nenhuma conta lançada.</div>}
            {ind && (
              <ul className="text-sm space-y-0.5">
                {ind.prev && <li>vs mês anterior: <span className={tone(ind.prev.measurePct)}>{signed(ind.prev.measurePct)} {a.unit ? 'consumo' : 'valor'}</span>{a.unit && <> · {signed(ind.prev.amountPct)} valor</>}</li>}
                {ind.avg3 ? <li>vs média de {ind.avg3.months} meses: <span className={tone(ind.avg3.pct, alert)}>{signed(ind.avg3.pct)}</span></li> : <li className="text-muted-foreground">Média: sem base ainda (precisa de 2 meses)</li>}
                {ind.yearAgo && <li>vs mesmo mês do ano passado: <span className={tone(ind.yearAgo.measurePct)}>{signed(ind.yearAgo.measurePct)}</span></li>}
                {ind.unitPrice && <li>Preço: {ind.unitPrice.now.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })}/{a.unit}{ind.unitPrice.prev != null && <> (era {ind.unitPrice.prev.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })})</>}</li>}
                {ind.revenuePct != null && <li>{ind.revenuePct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do faturamento do mês</li>}
                {ind.missing.length > 0 && <li className="text-muted-foreground">Sem conta lançada: {ind.missing.map(monthLabel).join(', ')}</li>}
              </ul>
            )}
            {a.bills.length > 0 && (
              <button className="text-xs text-primary hover:underline" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Esconder histórico' : 'Ver histórico'}</button>
            )}
            {open === a.id && (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th>Mês</th><th className="text-right">Valor</th>{a.unit && <th className="text-right">{a.unit}</th>}{data.insights && <th className="w-1/3"></th>}<th></th></tr></thead>
                <tbody>{a.bills.slice(0, 12).map((b) => {
                  const v = a.unit ? b.consumption ?? 0 : b.amountCents;
                  return (
                    <tr key={b.referenceMonth}>
                      <td>{monthLabel(b.referenceMonth)}</td>
                      <td className="text-right">{brl(b.amountCents)}</td>
                      {a.unit && <td className="text-right">{b.consumption != null ? num(b.consumption) : ''}</td>}
                      {data.insights && <td className="pl-2"><div className="h-2 rounded bg-primary/70" style={{ width: `${Math.round((v / max) * 100)}%` }} /></td>}
                      <td className="text-right"><button className="text-primary hover:underline" onClick={() => startForm(a, b.referenceMonth)}>Corrigir</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
            <button className="text-xs text-muted-foreground hover:underline" disabled={busy} onClick={() => call(`/api/utility-bills/accounts/${a.id}`, 'PATCH', { active: false })}>Desativar conta</button>
          </Card>
        );
      })}

      {data.accounts.some((a) => !a.active) && (
        <p className="text-xs text-muted-foreground">
          Desativadas: {data.accounts.filter((a) => !a.active).map((a) => (
            <button key={a.id} className="underline mr-2" disabled={busy} onClick={() => call(`/api/utility-bills/accounts/${a.id}`, 'PATCH', { active: true })}>{a.name} (reativar)</button>
          ))}
        </p>
      )}

      {form && formAccount && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
            <h2 className="text-lg font-semibold">{correcting ? 'Corrigir' : 'Lançar'} {formAccount.name}</h2>
            <label className="block text-sm">Mês de referência
              <select className="w-full border rounded p-2 bg-background mt-1" value={form.referenceMonth} onChange={(e) => { const ym = e.target.value; startForm(formAccount, ym); }}>
                {Array.from({ length: 13 }, (_, i) => addMonths(data.defaultMonth, 1 - i)).map((ym) => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
              </select>
            </label>
            <label className="block text-sm">Valor (R$)
              <input className="w-full border rounded p-2 bg-background mt-1" inputMode="decimal" placeholder="1.240,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            {formAccount.unit && (
              <label className="block text-sm">Consumo ({formAccount.unit})
                <input className="w-full border rounded p-2 bg-background mt-1" inputMode="decimal" placeholder={formAccount.kind === 'BOTTLED_GAS' ? 'botijões no mês' : 'como está na conta'} value={form.consumption} onChange={(e) => setForm({ ...form, consumption: e.target.value })} />
              </label>
            )}
            <label className="block text-sm">Vencimento (opcional)
              <input type="date" className="w-full border rounded p-2 bg-background mt-1" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            <label className="block text-sm">Observação (opcional)
              <input className="w-full border rounded p-2 bg-background mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end sticky bottom-0 bg-card pt-2">
              <Button variant="outline" onClick={() => { setForm(null); setError(null); }}>Cancelar</Button>
              <Button disabled={busy} onClick={async () => { if (await call('/api/utility-bills', 'PUT', { ...form, consumption: form.consumption || undefined, dueDate: form.dueDate || undefined })) setForm(null); }}>{correcting ? 'Corrigir' : 'Salvar'}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
