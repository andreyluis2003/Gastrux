'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Printer, Receipt, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PaymentPanel, panelState, type PanelPayment } from '@/components/caixa/payment-panel';
import { toApiAmount } from '@/components/caixa/panel-state';
import { OpenShiftCard } from '@/components/caixa/open-shift-card';
import { brl } from '@/components/caixa/money';
import { useDeviceShift } from '@/lib/caixa/use-device-shift';
import { useOutbox } from '@/components/offline/outbox-provider';
import { OfflineUnavailableError } from '@/lib/offline/outbox';
import { printInHiddenFrame } from '@/lib/print/print-frame';

type Mutate = (method: 'POST' | 'PUT' | 'DELETE', url: string, body: unknown, label: string) => Promise<Response | null>;

/**
 * Closing the bill (caixa spec 2026-10-04, §8.3) and the NFC-e, moved from the old comanda screen
 * with the same rules. Replaced by the Conta screen in stage 2 (spec 2026-10-07, 4.3).
 */
export function CloseBillDialog({ sessionId, totalCents, status, hasItems, mutate, onClosed, onCancel }: {
  sessionId: string;
  totalCents: number;
  status?: string;
  hasItems: boolean;
  mutate: Mutate;
  onClosed: () => void;
  onCancel: () => void;
}) {
  const shift = useDeviceShift();
  const { send } = useOutbox();
  const [cpf, setCpf] = useState('');
  const [payments, setPayments] = useState<PanelPayment[]>([]);
  const [closing, setClosing] = useState(false);
  const [nfceOpen, setNfceOpen] = useState(false);
  const [nfceName, setNfceName] = useState('');
  const [emitting, setEmitting] = useState(false);
  const [emittedDoc, setEmittedDoc] = useState<{ id: string; documentNumber: number } | null>(null);
  const closed = status === 'CLOSED';

  // Closing issues the NFC-e automatically when the restaurant enabled it ("CPF na nota?" asked
  // here, before closing). A fiscal problem never blocks the close.
  async function close() {
    try {
      setClosing(true);
      const res = await mutate(
        'PUT',
        `/api/comanda/sessions/${sessionId}`,
        {
          status: 'CLOSED',
          customerCPF: cpf.replace(/\D/g, '') || undefined,
          cashSessionId: shift.shiftId,
          payments: payments.map((p) => ({ method: p.method, amount: toApiAmount(p.amount) })),
          // Made without internet: the server records it in this shift even if it closes before the sale arrives
          ...(typeof navigator !== 'undefined' && !navigator.onLine ? { queuedAt: new Date().toISOString() } : {}),
        },
        'Fechar conta',
      );
      if (!res) {
        toast.warning('A NFC-e será emitida quando a internet voltar.', { duration: 8000 });
        onClosed();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'CASH_SESSION_REQUIRED') shift.refresh();
        toast.error(data.error || 'Erro ao fechar a conta');
        return;
      }
      if (data.changeCents > 0) toast.success(`Troco: ${brl(data.changeCents)}`, { duration: 15000 });
      toast.success('Conta fechada', {
        action: { label: 'Imprimir cupom', onClick: () => printInHiddenFrame(`/imprimir/cupom/${sessionId}`) },
        duration: 15000,
      });
      const nfce = data.nfce;
      if (nfce?.nfce?.status === 'authorized') {
        toast.success(nfce.message);
        setEmittedDoc({ id: nfce.nfce.id, documentNumber: nfce.nfce.number });
      } else if (nfce?.nfce) toast.warning(nfce.message, { duration: 10000 });
      else if (nfce?.message) toast.info(nfce.message);
      setPayments([]);
      onClosed();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao fechar a conta');
    } finally {
      setClosing(false);
    }
  }

  async function emit() {
    try {
      setEmitting(true);
      // Needs the internet (a note cannot be signed on this device): refused offline, never queued
      const result = await send({
        method: 'POST', url: '/api/nfe/emit', label: 'Emitir NFC-e', queueable: false,
        body: { orderSessionId: sessionId, customerCPF: cpf.replace(/\D/g, '') || undefined, customerName: nfceName.trim() || undefined },
      });
      if (result.queued) return;
      const data = await result.response.json();
      if (!result.response.ok || !data.success) toast.error(data.rejectionReason || data.error || 'Erro ao emitir NFC-e');
      else { toast.success('NFC-e emitida!'); setEmittedDoc(data.document); setNfceOpen(false); }
    } catch (e: any) {
      toast.error(e instanceof OfflineUnavailableError ? e.message : e?.message || 'Erro');
    } finally {
      setEmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Conta</h2>
        <p className="text-sm text-gray-600 mb-4">
          Total: <strong>{brl(totalCents)}</strong>.{closed ? ' Conta fechada.' : ' A NFC-e é emitida ao fechar, se a emissão automática estiver ligada.'}
        </p>

        {!closed && (
          <div className="space-y-3">
            <div>
              <label htmlFor="close-cpf" className="text-sm font-semibold block mb-1">CPF na nota?</label>
              <Input id="close-cpf" placeholder="Opcional. Ex: 123.456.789-09" value={cpf} onChange={(e) => setCpf(e.target.value)} disabled={closing} />
            </div>
            {shift.loading ? (
              <p className="text-sm">Carregando caixa...</p>
            ) : !shift.shiftId && shift.register ? (
              <div className="rounded-md bg-amber-50 p-3 space-y-2">
                <p className="text-sm font-semibold">Abra o caixa para receber</p>
                <OpenShiftCard registerId={shift.register.id} registerName={shift.register.name} onOpened={() => shift.refresh()} />
              </div>
            ) : (
              <PaymentPanel totalCents={totalCents} payments={payments} onChange={setPayments} disabled={closing} />
            )}
          </div>
        )}

        {closed && (
          <div className="space-y-2">
            <Button variant="outline" className="w-full gap-2" onClick={() => printInHiddenFrame(`/imprimir/cupom/${sessionId}`)}>
              <Printer className="w-4 h-4" /> Imprimir cupom
            </Button>
            {emittedDoc ? (
              <a href={`/admin/nfe/documents/${emittedDoc.id}`} target="_blank" rel="noopener" className="inline-flex items-center justify-center w-full text-sm font-semibold gap-1 underline">
                <FileText className="w-4 h-4" /> Ver NFC-e #{String(emittedDoc.documentNumber).padStart(6, '0')}
              </a>
            ) : nfceOpen ? (
              <div className="space-y-2 rounded-md border p-3">
                <Input placeholder="CPF do cliente (opcional)" value={cpf} onChange={(e) => setCpf(e.target.value)} disabled={emitting} />
                <Input placeholder="Nome do cliente (opcional)" value={nfceName} onChange={(e) => setNfceName(e.target.value)} disabled={emitting} />
                <Button className="w-full" onClick={emit} disabled={emitting}>{emitting ? 'Emitindo...' : 'Emitir NFC-e'}</Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full gap-2" disabled={!hasItems} onClick={() => setNfceOpen(true)}>
                <Receipt className="w-4 h-4" /> Emitir NFC-e
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="outline" onClick={() => { setPayments([]); onCancel(); }} disabled={closing}>Voltar</Button>
          {!closed && (
            <Button onClick={close} disabled={closing || !shift.shiftId || !panelState(totalCents, payments).valid} className="bg-green-600">
              {closing ? 'Fechando...' : 'Fechar conta'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
