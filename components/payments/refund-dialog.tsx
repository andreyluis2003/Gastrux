'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatBRL } from '@/lib/formatters';
import { refundableAmount, type RefundablePayment } from '@/lib/payments/refund-eligibility';

/** "12,50" or "12.50" -> 12.5; anything else -> NaN. */
function parseReais(text: string): number {
  const t = text.trim().replace(/\s|R\$/g, '');
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

interface Props {
  payment: RefundablePayment & { id: string; description?: string };
  onDone: () => void;
}

export function RefundDialog({ payment, onDone }: Props) {
  const remaining = refundableAmount(payment);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(remaining.toFixed(2).replace('.', ','));
  const [busy, setBusy] = useState(false);

  const amount = parseReais(value);
  const invalid =
    !Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) > Math.round(remaining * 100);
  const isFull = !invalid && Math.round(amount * 100) === Math.round(remaining * 100);

  async function confirm() {
    if (invalid || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/pagamentos/mp/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.id, amount, reason: 'requested_by_restaurant' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'Não foi possível fazer o estorno');
        return;
      }
      toast.success(`Estorno de ${formatBRL(amount)} feito. O dinheiro volta para o cliente pelo Mercado Pago.`);
      setOpen(false);
      onDone();
    } catch {
      toast.error('Sem conexão. Confira no Mercado Pago antes de tentar de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (next) setValue(remaining.toFixed(2).replace('.', ','));
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Undo2 className="w-4 h-4 mr-1" />
          Estornar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Estornar pagamento</AlertDialogTitle>
          <AlertDialogDescription>
            {payment.description ? `${payment.description}. ` : ''}
            Pode ser estornado até {formatBRL(remaining)}. O valor volta para o cliente pelo Mercado Pago e
            não dá para desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <label className="block text-sm font-medium text-gray-700">
          Valor a estornar (R$)
          <Input
            className="mt-1"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
          />
        </label>
        {invalid ? (
          <p className="text-sm text-red-600">Informe um valor entre R$ 0,01 e {formatBRL(remaining)}.</p>
        ) : (
          <p className="text-sm text-gray-500">{isFull ? 'Estorno total.' : 'Estorno parcial: o restante continua pago.'}</p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={invalid || busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Estornar {invalid ? '' : formatBRL(amount)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
