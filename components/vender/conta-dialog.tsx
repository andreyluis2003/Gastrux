'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { FileText, Printer, Receipt, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaymentPanel, panelState, type PanelPayment } from '@/components/caixa/payment-panel';
import { toApiAmount } from '@/components/caixa/panel-state';
import { OpenShiftCard } from '@/components/caixa/open-shift-card';
import { brl, reaisToCents } from '@/components/caixa/money';
import { useDeviceShift } from '@/lib/caixa/use-device-shift';
import { useOutbox } from '@/components/offline/outbox-provider';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { nextEqualShare, shareForItems, splitEqually } from '@/lib/comanda/bill';
import { noteLabel } from '@/lib/nfe/access-key';
import type { Bill } from '@/lib/comanda/bill-service';

const METHOD: Record<string, string> = { CASH: 'Dinheiro', PIX: 'PIX', CREDIT: 'Crédito', DEBIT: 'Débito', OTHER: 'Outro' };

/**
 * The Conta (spec 2026-10-07, 4.3): subtotal, service charge (suggested, removable), total, payments
 * so far, what is left; split equally or by item; one payment at a time; the bill closes itself when
 * paid. Needs the internet (never queued). Replaces the stage-1 close dialog.
 */
export function ContaDialog({ sessionId, onClosed, onCancel }: { sessionId: string; onClosed: () => void; onCancel: () => void }) {
  const shift = useDeviceShift();
  const { online, send } = useOutbox();
  const { data } = useSession();
  const role = (data?.user as any)?.role as string | undefined;
  const manager = ['OWNER', 'MANAGER', 'ADMIN'].includes(role ?? '');
  const [bill, setBill] = useState<Bill | null>(null);
  const [people, setPeople] = useState(2);
  const [mode, setMode] = useState<'all' | 'equal' | 'items'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [amountText, setAmountText] = useState('');
  const [payments, setPayments] = useState<PanelPayment[]>([]);
  const [cpf, setCpf] = useState('');
  const [busy, setBusy] = useState(false);
  const [emittedDoc, setEmittedDoc] = useState<{ id: string; documentType?: string; documentNumber: number; accessKey?: string | null } | null>(null);
  const [nfceOpen, setNfceOpen] = useState(false);
  // What happened to the NFC-e, written on the closed bill: a toast alone was gone in seconds,
  // behind "Conta fechada", so the cashier never knew why there was no note (2026-10-09)
  const [nfceNote, setNfceNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  // One key per payment as typed: a second tap after a lost answer sends the same key and the server
  // records it once; any change to the amount or the methods is a new payment with a new key
  const attemptKey = useRef('');
  const dueKey = `${mode}|${people}|${picked.join(',')}|${amountText}|${bill?.remainingCents ?? ''}`;
  // The methods typed were for the amount shown: when that amount changes they no longer apply (the
  // change they showed would be wrong)
  useEffect(() => { setPayments([]); }, [dueKey]);
  useEffect(() => { attemptKey.current = crypto.randomUUID(); }, [dueKey, JSON.stringify(payments)]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/comanda/sessions/${sessionId}/bill`, { cache: 'no-store' });
    if (res.ok) setBill(await res.json());
    else toast.error('Não foi possível carregar a conta');
  }, [sessionId]);
  useEffect(() => { load(); }, [load]);

  if (!bill) return <Shell onCancel={onCancel}><p>Carregando...</p></Shell>;
  const closed = bill.status === 'CLOSED';

  // What to receive now: the whole remainder, one person's equal share, or the picked items' share
  const suggested = mode === 'equal'
    ? nextEqualShare(bill.totalCents, bill.remainingCents, people)
    : mode === 'items'
      ? Math.min(bill.remainingCents, shareForItems(bill.items.filter((i) => picked.includes(i.id)).reduce((n, i) => n + i.totalCents, 0), bill.subtotalCents, bill.serviceCents))
      : bill.remainingCents;
  const typed = amountText.trim() ? reaisToCents(amountText) : null;
  const dueNow = typed && typed > 0 ? Math.min(typed, bill.remainingCents) : suggested;

  async function toggleService(charge: boolean) {
    const res = await fetch(`/api/comanda/sessions/${sessionId}/bill`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceChargeWaived: !charge }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(out.error || 'Não foi possível mudar a taxa'); return; }
    setBill(out);
  }

  async function receive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/comanda/sessions/${sessionId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attemptKey.current },
        body: JSON.stringify({
          payments: payments.map((p) => ({ method: p.method, amount: toApiAmount(p.amount) })),
          cashSessionId: shift.shiftId,
          customerCPF: cpf.replace(/\D/g, '') || undefined,
          // The share being paid now: the change shown on screen is counted against it
          dueCents: dueNow,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (out.code === 'CASH_SESSION_REQUIRED') shift.refresh();
        toast.error(out.error || 'Não foi possível receber');
        // Another device may have received meanwhile: show the bill as it is now
        load();
        return;
      }
      if (out.changeCents > 0) toast.success(`Troco: ${brl(out.changeCents)}`, { duration: 15000 });
      setPayments([]); setAmountText(''); setPicked([]);
      setBill(out.bill);
      if (out.closed) {
        toast.success('Conta fechada', { action: { label: 'Imprimir cupom', onClick: () => printInHiddenFrame(`/imprimir/cupom/${sessionId}`) }, duration: 15000 });
        const n = out.nfce as any;
        if (n?.nfce?.status === 'authorized') { toast.success(n.message); setEmittedDoc({ id: n.nfce.id, documentNumber: n.nfce.number, accessKey: n.nfce.accessKey }); }
        else if (n?.nfce) toast.warning(n.message, { duration: 10000 });
        else if (n?.message) toast.info(n.message);
        if (n?.message) setNfceNote({ tone: n?.nfce?.status === 'authorized' ? 'ok' : 'warn', text: n.message });
        onClosed();
      } else {
        toast.success(`Recebido. Falta ${brl(out.bill.remainingCents)}`);
      }
    } catch {
      // No answer (the connection dropped): the payment may have gone through. Show the bill as the
      // server has it before anyone charges again; the same tap resends the same key, recorded once
      toast.error('Sem resposta do servidor: confira a conta antes de cobrar de novo.');
      load();
    } finally {
      setBusy(false);
    }
  }

  async function refund(entryId: string) {
    const reason = window.prompt('Motivo do estorno deste pagamento:');
    if (!reason || reason.trim().length < 3) return;
    const res = await fetch(`/api/comanda/sessions/${sessionId}/payments/${entryId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim(), cashSessionId: shift.shiftId }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(out.error || 'Não foi possível estornar'); return; }
    setBill(out);
    toast.success('Pagamento estornado');
  }

  async function preBill() {
    const res = await fetch(`/api/comanda/sessions/${sessionId}/pre-bill`, { method: 'POST' });
    if (!res.ok) { toast.error('Não foi possível imprimir a pré-conta'); return; }
    printInHiddenFrame(`/imprimir/pre-conta/${sessionId}${mode === 'equal' ? `?people=${people}` : ''}`);
    load();
  }

  async function emitNfce() {
    setBusy(true);
    try {
      // Needs the internet (a note cannot be signed on this device): refused offline, never queued
      const result = await send({ method: 'POST', url: '/api/nfe/emit', label: 'Emitir NFC-e', queueable: false, body: { orderSessionId: sessionId, customerCPF: cpf.replace(/\D/g, '') || undefined } });
      if (result.queued) return;
      const d = await result.response.json();
      if (!result.response.ok || !d.success) {
        const text = d.rejectionReason || d.error || 'Erro ao emitir NFC-e';
        toast.error(text);
        setNfceNote({ tone: 'warn', text: `NFC-e não emitida: ${text}` });
      } else { toast.success('NFC-e emitida!'); setEmittedDoc(d.document); setNfceOpen(false); setNfceNote(null); }
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell onCancel={onCancel}>
      <h2 className="text-xl font-bold">{bill.label} · Conta</h2>

      <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
        {bill.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            {mode === 'items' && !closed ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={picked.includes(i.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))} />
                {i.quantity}x {i.name}
              </label>
            ) : <span>{i.quantity}x {i.name}</span>}
            <span>{brl(i.totalCents)}</span>
          </li>
        ))}
      </ul>

      <div className="border-t pt-2 space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{brl(bill.subtotalCents)}</span></div>
        {bill.applies && bill.percent > 0 && (
          <label className="flex justify-between items-center gap-2">
            <span className="flex items-center gap-2">
              <input type="checkbox" disabled={closed} checked={!bill.waived} onChange={(e) => toggleService(e.target.checked)} />
              Taxa de serviço ({bill.percent}%){bill.waived ? ' — cliente não quis pagar' : ''}
            </span>
            <span>{brl(bill.serviceCents)}</span>
          </label>
        )}
        <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{brl(bill.totalCents)}</span></div>
        {bill.payments.map((p) => (
          <div key={p.id} className={`flex justify-between items-center ${p.refunded ? 'line-through text-slate-400' : 'text-emerald-700'}`}>
            <span>
              {METHOD[p.method] ?? p.method} · {new Date(p.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              {p.changeCents ? ` (troco ${brl(p.changeCents)})` : ''}
            </span>
            <span className="flex items-center gap-2">
              {brl(p.amountCents - p.changeCents)}
              {manager && !closed && !p.refunded && (
                <button aria-label="Estornar pagamento" onClick={() => refund(p.id)}><Undo2 className="h-4 w-4" /></button>
              )}
            </span>
          </div>
        ))}
        {!closed && <div className="flex justify-between font-semibold"><span>Falta</span><span>{brl(bill.remainingCents)}</span></div>}
      </div>

      {closed ? (
        <div className="space-y-2">
          <p className="font-semibold text-emerald-700">Conta fechada.</p>
          {nfceNote && (
            <p role="status" className={`rounded-md p-3 text-sm ${nfceNote.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{nfceNote.text}</p>
          )}
          <Button variant="outline" className="w-full gap-2" onClick={() => printInHiddenFrame(`/imprimir/cupom/${sessionId}`)}>
            <Printer className="h-4 w-4" /> Imprimir cupom
          </Button>
          {emittedDoc ? (
            <a href={`/admin/nfe/documents/${emittedDoc.id}`} target="_blank" rel="noopener" className="inline-flex items-center justify-center w-full text-sm font-semibold gap-1 underline">
              <FileText className="w-4 h-4" /> Ver {noteLabel({ documentType: 'NFCe', ...emittedDoc })}
            </a>
          ) : nfceOpen ? (
            <div className="space-y-2 rounded-md border p-3">
              <Input placeholder="CPF do cliente (opcional)" value={cpf} onChange={(e) => setCpf(e.target.value)} />
              <Button className="w-full" disabled={busy} onClick={emitNfce}>Emitir NFC-e</Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full gap-2" onClick={() => setNfceOpen(true)}><Receipt className="h-4 w-4" /> Emitir NFC-e</Button>
          )}
        </div>
      ) : !online ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm">Sem internet: receber pagamentos precisa de conexão. Lançar itens e enviar à cozinha continuam funcionando.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {(['all', 'equal', 'items'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setAmountText(''); }} className={`px-3 py-1.5 rounded-full ${mode === m ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>
                {m === 'all' ? 'Tudo' : m === 'equal' ? 'Dividir igual' : 'Por item'}
              </button>
            ))}
            {mode === 'equal' && (
              <span className="flex items-center gap-1">
                por <Input className="w-16 h-8" type="number" min={2} max={20} value={people} onChange={(e) => setPeople(Math.min(20, Math.max(2, Number(e.target.value) || 2)))} />
                = {brl(splitEqually(bill.totalCents, people)[0])} cada
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>Receber agora</span>
            <Input className="w-32" inputMode="decimal" placeholder={(suggested / 100).toFixed(2).replace('.', ',')} value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          </div>
          <Input placeholder="CPF na nota? (opcional)" value={cpf} onChange={(e) => setCpf(e.target.value)} />
          {shift.loading ? <p className="text-sm">Carregando caixa...</p> : !shift.shiftId && shift.register ? (
            <div className="rounded-md bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold">Abra o caixa para receber</p>
              <OpenShiftCard registerId={shift.register.id} registerName={shift.register.name} onOpened={() => shift.refresh()} />
            </div>
          ) : (
            <PaymentPanel totalCents={dueNow} payments={payments} onChange={setPayments} disabled={busy} />
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-end">
        {!closed && <Button variant="outline" className="gap-2 mr-auto" onClick={preBill}><Printer className="h-4 w-4" /> Pré-conta</Button>}
        <Button variant="ghost" onClick={onCancel}>Voltar</Button>
        {!closed && online && (
          <Button className="bg-green-600" disabled={busy || !shift.shiftId || dueNow <= 0 || !panelState(dueNow, payments).valid} onClick={receive}>
            {dueNow >= bill.remainingCents ? 'Receber e fechar' : `Receber ${brl(dueNow)}`}
          </Button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end lg:items-center justify-center" onClick={onCancel}>
      <div
        role="dialog"
        aria-label="Conta"
        className="bg-white w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl p-5 max-h-[92vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
