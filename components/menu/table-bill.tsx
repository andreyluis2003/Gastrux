'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Copy, CreditCard, Loader2, QrCode, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { isValidPayerKey, MAX_PEOPLE, parseReaisCents, reais, shareCents, type ShareMode } from '@/lib/comanda/table-share';
import type { PublicTableBill, PublicOpenBill } from '@/lib/comanda/public-bill';
import { statusPollUrl } from '@/lib/delivery-payments/return-params';

const KEY_STORAGE = 'gastrux-payer-key';
/** The comanda a phone was paying when it left for the card checkout (per table) */
const SESSION_STORAGE = 'gastrux-paying-session:';

/** The random key of this phone: kept in the browser so a reload keeps its PIX; in memory when storage is blocked */
function payerKey(): string {
  const make = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    const kept = localStorage.getItem(KEY_STORAGE);
    if (kept && isValidPayerKey(kept)) return kept;
    const k = make();
    localStorage.setItem(KEY_STORAGE, k);
    return k;
  } catch {
    return make();
  }
}

type Pix = { paymentId: string; qrCode: string; qrCodeBase64: string; ticketUrl: string; cents: number };

type CardReturn = { paymentId: string; mpPaymentId: string | null; failed: boolean };

/** Pay at the table (spec 2026-10-10 §5.1): the bill, the part, the CPF and the PIX or card of this phone */
export function TableBill({ qrToken, onClose, returning }: { qrToken: string; onClose: () => void; returning?: CardReturn | null }) {
  const [method, setMethod] = useState<'PIX' | 'CARD'>('PIX');
  const [checkingCard, setCheckingCard] = useState<{ paymentId: string; mpPaymentId: string | null } | null>(null);
  const [bill, setBill] = useState<PublicTableBill | null>(null);
  const [mode, setMode] = useState<ShareMode>('ALL');
  const [people, setPeople] = useState(2);
  const [amountText, setAmountText] = useState('');
  const [cpf, setCpf] = useState('');
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState<Pix | null>(null);
  const [paid, setPaid] = useState<{ cents: number } | null>(null);
  const keyRef = useRef<string>('');
  const sessionRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const url = `/api/public/table/${qrToken}/bill${sessionRef.current ? `?session=${encodeURIComponent(sessionRef.current)}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Only the first load closes the screen: later, a passing error (a restart, the proxy) must not take
        // away the bill and the QR the customer may be paying right now; the next poll tries again
        if (!loadedRef.current) { toast.error(data.error || 'Não foi possível abrir a conta'); onClose(); }
        return;
      }
      loadedRef.current = true;
      if (data.status === 'OPEN') sessionRef.current = data.sessionId;
      setBill(data);
    } catch { /* keep the last bill on a network blip */ }
  }, [qrToken, onClose]);

  useEffect(() => {
    keyRef.current = payerKey();
    // Back from the card checkout: the comanda being paid, so a bill closed meanwhile reads "Conta paga"
    if (returning) { try { sessionRef.current = sessionStorage.getItem(SESSION_STORAGE + qrToken); } catch { /* blocked storage */ } }
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  // The PIX of this phone: asks every 5 s until approved (the QR expires in 30 min)
  useEffect(() => {
    if (!pix) return;
    let stopped = false;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/pagamentos/mp/pix/status?paymentId=${encodeURIComponent(pix.paymentId)}`);
        const data = await res.json();
        if (!stopped && data.approved) {
          clearInterval(t);
          setPaid({ cents: pix.cents });
          setPix(null);
          load();
        }
      } catch { /* ignore */ }
    }, 5000);
    const end = setTimeout(() => clearInterval(t), 30 * 60_000);
    return () => { stopped = true; clearInterval(t); clearTimeout(end); };
  }, [pix, load]);

  // Back from the card checkout (stage 3): a failure is said as such; anything else is confirmed only by our
  // status route, with Mercado Pago's id from the return URL as the hint for a webhook still on its way
  useEffect(() => {
    if (!returning) return;
    if (returning.failed) toast.error('O pagamento com cartão não foi concluído. Nada foi cobrado.');
    else setCheckingCard({ paymentId: returning.paymentId, mpPaymentId: returning.mpPaymentId });
  }, [returning]);

  useEffect(() => {
    if (!checkingCard) return;
    let stopped = false;
    const t = setInterval(async () => {
      try {
        const res = await fetch(statusPollUrl(checkingCard.paymentId, checkingCard.mpPaymentId));
        const data = await res.json();
        if (!stopped && data.approved) {
          clearInterval(t);
          toast.success('Pagamento com cartão confirmado.');
          setCheckingCard(null);
          load();
        }
      } catch { /* ignore */ }
    }, 4000);
    const end = setTimeout(() => {
      clearInterval(t);
      if (!stopped) {
        setCheckingCard(null);
        toast.message('Ainda não recebemos a confirmação do cartão. Se o valor foi cobrado, ele aparece na conta em instantes.');
      }
    }, 2 * 60_000);
    return () => { stopped = true; clearInterval(t); clearTimeout(end); };
  }, [checkingCard, load]);

  const open = bill?.status === 'OPEN' ? (bill as PublicOpenBill) : null;
  // "25,50" and "25.50" are both R$ 25,50 (many phone keyboards only have the dot)
  const amountCents = parseReaisCents(amountText);
  const preview = open ? shareCents({ mode, people, amountCents }, open) : null;

  async function pay() {
    if (!preview?.ok) return;
    setBusy(true);
    let leaving = false;
    try {
      const res = await fetch(`/api/public/table/${qrToken}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, mode, people, amountCents, cpf, payerKey: keyRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (method === 'CARD') {
        if (!res.ok || !data.initPoint) { toast.error(data.error || 'Não foi possível abrir o pagamento com cartão'); load(); return; }
        // Leaves the page: the customer pays at Mercado Pago and comes back to /menu/<qrToken>?payment=...
        // The comanda is kept for the way back: if this part closed the bill, the screen says "Conta paga"
        try { if (sessionRef.current) sessionStorage.setItem(SESSION_STORAGE + qrToken, sessionRef.current); } catch { /* blocked storage */ }
        leaving = true;
        window.location.href = data.initPoint;
        return;
      }
      if (!res.ok || !data.qrCode) { toast.error(data.error || 'Não foi possível gerar o Pix'); load(); return; }
      setPaid(null);
      setPix({ paymentId: data.paymentId, qrCode: data.qrCode, qrCodeBase64: data.qrCodeBase64 || '', ticketUrl: data.ticketUrl || '', cents: Math.round(Number(data.amount) * 100) });
    } catch {
      toast.error('Sem conexão. Tente de novo.');
    } finally {
      // Leaving for Mercado Pago keeps the button busy: no second checkout from a second tap
      if (!leaving) setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50 p-4 flex justify-center">
      <Card className="p-5 max-w-md w-full h-fit space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{open?.label ?? 'Conta da mesa'}</h1>
          <Button variant="ghost" size="icon" aria-label="Voltar ao cardápio" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        {children}
      </Card>
    </div>
  );

  if (!bill) return shell(<div className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando a conta...</div>);

  if (bill.status === 'CLOSED') {
    return shell(
      <div className="text-center space-y-3">
        <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
        <p className="text-2xl font-bold text-green-700">Conta paga! Obrigado.</p>
        {bill.nfceUrl && <a href={bill.nfceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-sm">Ver a nota fiscal (NFC-e)</a>}
      </div>
    );
  }

  if (!open) return shell(<p className="text-gray-600">Esta mesa ainda não tem conta aberta. Para pagar, peça a conta ao garçom.</p>);

  if (pix) {
    return shell(
      <div className="text-center space-y-3">
        <QrCode className="w-8 h-8 text-blue-600 mx-auto" />
        <p className="text-sm text-gray-600">Pague com Pix</p>
        <p className="text-2xl font-bold text-blue-700">{reais(pix.cents)}</p>
        {pix.qrCodeBase64 ? (
          <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code Pix" className="w-48 h-48 mx-auto border rounded-lg p-2 bg-white" />
        ) : pix.ticketUrl ? (
          <a href={pix.ticketUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-sm">Abrir o QR Code no Mercado Pago</a>
        ) : null}
        <div className="flex gap-2">
          <input readOnly value={pix.qrCode} className="flex-1 text-xs px-3 py-2 border rounded-md bg-gray-50 truncate" aria-label="Código Pix copia e cola" />
          <Button size="sm" variant="outline" aria-label="Copiar o código Pix" onClick={() => navigator.clipboard.writeText(pix.qrCode).then(() => toast.success('Código Pix copiado!'), () => toast.error('Erro ao copiar'))}><Copy className="h-4 w-4" /></Button>
        </div>
        <p className="flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Aguardando o pagamento...</p>
        <Button variant="outline" className="w-full" onClick={() => setPix(null)}>Escolher outro valor</Button>
      </div>
    );
  }

  return shell(
    <>
      {checkingCard && (
        <div role="status" className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
          <Loader2 className="h-4 w-4 animate-spin" /> Confirmando o pagamento com cartão...
        </div>
      )}
      {paid && (
        <div role="status" className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          Pagamento confirmado: {reais(paid.cents)}. Falta {reais(open.remainingCents)}.
        </div>
      )}

      <ul className="divide-y text-sm">
        {open.items.map((i, n) => (
          <li key={n} className="flex justify-between py-1.5"><span>{i.quantity}x {i.name}</span><span>{reais(i.totalCents)}</span></li>
        ))}
      </ul>
      <div className="text-sm space-y-1 border-t pt-2">
        <div className="flex justify-between"><span>Subtotal</span><span>{reais(open.subtotalCents)}</span></div>
        {open.serviceApplies && (
          <>
            <div className="flex justify-between"><span>Taxa de serviço ({open.servicePercent}%)</span><span>{reais(open.serviceCents)}</span></div>
            <p className="text-xs text-gray-500">A taxa de serviço é opcional. Para retirar, fale com o garçom.</p>
          </>
        )}
        <div className="flex justify-between font-bold text-base"><span>Total</span><span>{reais(open.totalCents)}</span></div>
        {open.paidCents > 0 && <div className="flex justify-between text-green-700"><span>Já pago</span><span>{reais(open.paidCents)}</span></div>}
        <div className="flex justify-between font-bold"><span>Falta pagar</span><span>{reais(open.remainingCents)}</span></div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Quanto você vai pagar?</p>
        <div className="grid grid-cols-3 gap-2">
          {([['ALL', 'Tudo'], ['EQUAL', 'Partes iguais'], ['AMOUNT', 'Outro valor']] as const).map(([m, label]) => (
            <Button key={m} variant={mode === m ? 'default' : 'outline'} className="text-xs px-1" onClick={() => setMode(m)}>{label}</Button>
          ))}
        </div>
        {mode === 'EQUAL' && (
          <label className="flex items-center justify-between text-sm">
            <span>Dividir entre</span>
            <select value={people} onChange={(e) => setPeople(Number(e.target.value))} className="border rounded-md px-2 py-1">
              {Array.from({ length: MAX_PEOPLE - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n} pessoas</option>)}
            </select>
          </label>
        )}
        {mode === 'AMOUNT' && (
          <Input inputMode="decimal" placeholder="Valor, por exemplo 25,00" value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-label="Valor que você vai pagar" />
        )}
        <Input inputMode="numeric" placeholder="CPF na nota (opcional)" value={cpf} onChange={(e) => setCpf(e.target.value)} maxLength={14} aria-label="CPF na nota (opcional)" />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Como você vai pagar?</p>
        <div className="grid grid-cols-2 gap-2">
          {([['PIX', 'Pix'], ['CARD', 'Cartão']] as const).map(([m, label]) => (
            <Button key={m} variant={method === m ? 'default' : 'outline'} onClick={() => setMethod(m)}>{label}</Button>
          ))}
        </div>
      </div>

      {preview && !preview.ok && (mode !== 'AMOUNT' || amountText.trim()) && <p className="text-sm text-red-600">{preview.error}</p>}
      <Button className="w-full h-12 text-base gap-2" disabled={busy || !preview?.ok} onClick={pay}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : method === 'PIX' ? <QrCode className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
        {preview?.ok ? `Pagar ${reais(preview.cents)} com ${method === 'PIX' ? 'Pix' : 'cartão'}` : `Pagar com ${method === 'PIX' ? 'Pix' : 'cartão'}`}
      </Button>
    </>
  );
}
