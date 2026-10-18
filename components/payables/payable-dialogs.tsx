'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CATEGORIES, CATEGORY_LABEL, METHOD_LABEL, PAY_METHODS, type PayableCategory } from '@/lib/payables/rules';

/** Contas a pagar dialogs (spec 2026-10-18 contas a pagar §8). z-[70]: above the assistant button (z-59) */

export interface PayableItem {
  id: string;
  description: string;
  category: PayableCategory;
  categoryLabel: string;
  supplierName: string | null;
  amountCents: number;
  dueDate: string;
  competenceMonth: string;
  state: 'OVERDUE' | 'TODAY' | 'WEEK' | 'LATER' | 'PAID' | 'CANCELED';
  source: string;
  installment: string | null;
  seriesId: string | null;
  paidAt: string | null;
  paidMethod: string | null;
  paidFrom: string | null;
  notes: string | null;
}

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const br = (day: string) => day.split('-').reverse().join('/');
const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, out };
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const field = 'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm';
const label = 'text-xs font-medium text-slate-600 dark:text-slate-300';

export function NewPayableDialog({ seriesAllowed, suppliers, onClose, onSaved }: { seriesAllowed: boolean; suppliers: Array<{ id: string; name: string }>; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'ONCE' | 'INSTALLMENTS' | 'SERIES'>('ONCE');
  const [form, setForm] = useState({ description: '', category: 'OTHER', supplierId: '', amount: '', dueDate: '', competenceMonth: '', notes: '', installments: '3' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true);
    const { ok, out } = await send('/api/payables', 'POST', { ...form, mode, installments: Number(form.installments), supplierId: form.supplierId || undefined, competenceMonth: form.competenceMonth || undefined });
    setBusy(false);
    if (!ok) return toast.error(out.error || 'Não foi possível salvar');
    toast.success(mode === 'ONCE' ? 'Conta lançada' : `${out.ids.length} contas lançadas`);
    onSaved();
  }

  return (
    <Shell title="Nova conta" onClose={onClose}>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-sm">
        {(['ONCE', 'INSTALLMENTS', 'SERIES'] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={m === 'SERIES' && !seriesAllowed}
            onClick={() => setMode(m)}
            className={`rounded-md py-1.5 ${mode === m ? 'bg-white dark:bg-slate-900 shadow font-medium' : 'text-slate-600'} disabled:opacity-50`}
          >
            {m === 'ONCE' ? 'Uma vez' : m === 'INSTALLMENTS' ? 'Parcelar' : 'Repetir todo mês'}
          </button>
        ))}
      </div>
      {!seriesAllowed && (
        <p className="text-xs text-slate-600"><span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 mr-1">Business</span>Repetir todo mês cria sozinho o aluguel, o contador e as outras contas fixas de cada mês.</p>
      )}
      <div className="space-y-3">
        <div><p className={label}>Descrição</p><input className={field} value={form.description} onChange={set('description')} placeholder="Ex.: Aluguel" maxLength={120} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><p className={label}>Categoria</p>
            <select className={field} value={form.category} onChange={set('category')}>
              {CATEGORIES.filter((c) => c !== 'UTILITIES').map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
          <div><p className={label}>Fornecedor (opcional)</p>
            <select className={field} value={form.supplierId} onChange={set('supplierId')}>
              <option value="">Nenhum</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><p className={label}>{mode === 'INSTALLMENTS' ? 'Valor total (R$)' : 'Valor (R$)'}</p><input className={field} inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="1.240,50" /></div>
          <div><p className={label}>{mode === 'INSTALLMENTS' ? '1º vencimento' : mode === 'SERIES' ? 'Primeiro vencimento' : 'Vencimento'}</p><input className={field} type="date" value={form.dueDate} onChange={set('dueDate')} /></div>
        </div>
        {mode === 'INSTALLMENTS' && (
          <div><p className={label}>Parcelas (2 a 24)</p><input className={field} type="number" min={2} max={24} value={form.installments} onChange={set('installments')} /></div>
        )}
        {mode === 'ONCE' && (
          <div><p className={label}>Mês da conta (competência, se diferente do vencimento)</p><input className={field} type="month" value={form.competenceMonth} onChange={set('competenceMonth')} /></div>
        )}
        <div><p className={label}>Anotação (opcional, ex.: linha digitável do boleto)</p><textarea className={field} rows={2} value={form.notes} onChange={set('notes')} maxLength={500} /></div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={busy || !form.description.trim() || !form.amount || !form.dueDate}>{busy ? 'Salvando...' : 'Salvar'}</Button>
      </div>
    </Shell>
  );
}

export function PayDialog({ item, onClose, onSaved }: { item: PayableItem; onClose: () => void; onSaved: () => void }) {
  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const [paidAt, setPaidAt] = useState(today);
  const [method, setMethod] = useState<string>('PIX');
  const [from, setFrom] = useState<'BANK' | 'DRAWER'>('BANK');
  const [shifts, setShifts] = useState<Array<{ id: string; registerName: string }> | null>(null);
  const [shiftId, setShiftId] = useState('');
  const [needForce, setNeedForce] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pay(force = false) {
    setBusy(true);
    const { ok, out } = await send(`/api/payables/${item.id}/pay`, 'POST', { paidAt, method: from === 'DRAWER' ? 'CASH' : method, from, cashSessionId: shiftId || undefined, force });
    setBusy(false);
    if (ok) {
      toast.success('Conta paga');
      return onSaved();
    }
    if (out.shifts) setShifts(out.shifts);
    if (out.code === 'CASH_NOT_ENOUGH') setNeedForce(true);
    toast.error(out.error || 'Não foi possível registrar o pagamento');
  }

  return (
    <Shell title={`Pagar: ${item.description}`} onClose={onClose}>
      <p className="text-2xl font-bold">{brl(item.amountCents)}</p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-sm">
          <button type="button" onClick={() => setFrom('BANK')} className={`rounded-md py-1.5 ${from === 'BANK' ? 'bg-white dark:bg-slate-900 shadow font-medium' : ''}`}>Banco / outro</button>
          <button type="button" onClick={() => setFrom('DRAWER')} className={`rounded-md py-1.5 ${from === 'DRAWER' ? 'bg-white dark:bg-slate-900 shadow font-medium' : ''}`}>Dinheiro da gaveta</button>
        </div>
        {from === 'BANK' ? (
          <div><p className={label}>Forma</p>
            <select className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAY_METHODS.filter((m) => m !== 'CASH').map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          </div>
        ) : (
          <p className="text-xs text-slate-600">Sai do caixa aberto como despesa ligada a esta conta. Na DRE, conta uma vez só.</p>
        )}
        {from === 'DRAWER' && shifts && (
          <div><p className={label}>De qual caixa?</p>
            <select className={field} value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="">Escolha</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.registerName}</option>)}
            </select>
          </div>
        )}
        <div><p className={label}>Data do pagamento</p><input className={field} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2 flex-wrap">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        {needForce && <Button variant="destructive" onClick={() => pay(true)} disabled={busy}>Confirmar mesmo assim</Button>}
        <Button onClick={() => pay(false)} disabled={busy || (from === 'DRAWER' && !!shifts && !shiftId)}>{busy ? 'Salvando...' : 'Marcar como paga'}</Button>
      </div>
    </Shell>
  );
}

export function EditDialog({ item, onClose, onSaved }: { item: PayableItem; onClose: () => void; onSaved: () => void }) {
  const utility = item.source === 'UTILITY';
  const [form, setForm] = useState({ description: item.description, amount: centsToInput(item.amountCents), dueDate: item.dueDate, notes: item.notes ?? '' });
  const [busy, setBusy] = useState(false);

  async function save(scope: 'THIS' | 'NEXT') {
    setBusy(true);
    // Only what changed: an unchanged date or amount must not move a whole series
    const body: Record<string, unknown> = { scope };
    if (form.description !== item.description) body.description = form.description;
    if (form.notes !== (item.notes ?? '')) body.notes = form.notes;
    if (!utility && form.amount !== centsToInput(item.amountCents)) body.amount = form.amount;
    if (!utility && form.dueDate !== item.dueDate) body.dueDate = form.dueDate;
    const { ok, out } = await send(`/api/payables/${item.id}`, 'PATCH', body);
    setBusy(false);
    if (!ok) return toast.error(out.error || 'Não foi possível salvar');
    toast.success('Conta atualizada');
    onSaved();
  }

  return (
    <Shell title="Editar conta" onClose={onClose}>
      {utility && <p className="text-xs text-slate-600">Valor e vencimento desta conta vêm de Contas de consumo: edite lá.</p>}
      <div className="space-y-3">
        <div><p className={label}>Descrição</p><input className={field} value={form.description} maxLength={120} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><p className={label}>Valor (R$)</p><input className={field} disabled={utility} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><p className={label}>Vencimento</p><input className={field} disabled={utility} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
        </div>
        <div><p className={label}>Anotação</p><textarea className={field} rows={2} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>
      <div className="flex justify-end gap-2 flex-wrap">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        {item.seriesId ? (
          <>
            <Button variant="outline" onClick={() => save('THIS')} disabled={busy}>Só esta</Button>
            <Button onClick={() => save('NEXT')} disabled={busy}>Esta e as próximas</Button>
          </>
        ) : (
          <Button onClick={() => save('THIS')} disabled={busy}>Salvar</Button>
        )}
      </div>
    </Shell>
  );
}

type Shift = { id: string; registerName: string };

/** onConfirm answers true (done), false (failed) or the open registers to choose from (undo with two drawers open) */
export function ReasonDialog({ title, help, confirm, onClose, onConfirm }: { title: string; help: string; confirm: string; onClose: () => void; onConfirm: (reason: string, cashSessionId?: string) => Promise<boolean | Shift[]> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [shiftId, setShiftId] = useState('');
  return (
    <Shell title={title} onClose={onClose}>
      <p className="text-sm text-slate-600">{help}</p>
      <div><p className={label}>Motivo</p><input className={field} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></div>
      {shifts && (
        <div><p className={label}>Para qual caixa volta o dinheiro?</p>
          <select className={field} value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">Escolha</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.registerName}</option>)}
          </select>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Voltar</Button>
        <Button
          variant="destructive"
          disabled={busy || reason.trim().length < 3 || (!!shifts && !shiftId)}
          onClick={async () => {
            setBusy(true);
            const out = await onConfirm(reason.trim(), shiftId || undefined);
            setBusy(false);
            if (Array.isArray(out)) setShifts(out);
            else if (out) onClose();
          }}
        >
          {confirm}
        </Button>
      </div>
    </Shell>
  );
}

export { send };
