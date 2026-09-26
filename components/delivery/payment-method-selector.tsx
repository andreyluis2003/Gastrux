'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Banknote, CreditCard, QrCode, Ticket, Wallet } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';
import {
  VOUCHER_BRANDS,
  hasAnyPaymentOption,
  type DeliveryPaymentMethod,
  type DeliveryPaymentOptions,
} from '@/lib/delivery-payments/choice';
import {
  EMPTY_PAYMENT_CHOICE,
  parseChangeInput,
  toPaymentPayload,
  type PaymentChoice,
} from '@/lib/delivery-payments/payment-payload';

// The pure logic lives in lib/ (unit-testable without React); re-exported for the delivery page.
export { EMPTY_PAYMENT_CHOICE, parseChangeInput, toPaymentPayload };
export type { PaymentChoice };

interface Row {
  method: DeliveryPaymentMethod;
  label: string;
  hint: string;
  icon: ReactNode;
}

interface Props {
  options?: DeliveryPaymentOptions;
  total: number;
  value: PaymentChoice;
  onChange: (value: PaymentChoice) => void;
}

function OptionRow({ row, selected, onSelect }: { row: Row; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
        selected ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-300' : 'border-gray-200 bg-white hover:border-orange-300'
      }`}
    >
      <span className={selected ? 'text-orange-600' : 'text-gray-500'}>{row.icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{row.label}</span>
        <span className="block text-xs text-gray-500">{row.hint}</span>
      </span>
      <span
        className={`h-4 w-4 rounded-full border ${selected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}
        aria-hidden="true"
      />
    </button>
  );
}

export function PaymentMethodSelector({ options, total, value, onChange }: Props) {
  if (!options) {
    return (
      <Card className="p-4">
        <p className="text-sm text-gray-600">Não foi possível carregar as formas de pagamento. Recarregue a página.</p>
      </Card>
    );
  }
  if (!hasAnyPaymentOption(options)) {
    return (
      <Card className="p-4">
        <p className="text-sm text-gray-600">
          Este restaurante ainda não configurou as formas de pagamento do delivery. Fale com o restaurante.
        </p>
      </Card>
    );
  }

  const online: Row[] = [];
  if (options.online.pix) {
    online.push({ method: 'ONLINE_PIX', label: 'PIX', hint: 'Pague agora com QR Code', icon: <QrCode className="h-5 w-5" /> });
  }
  if (options.online.card) {
    online.push({
      method: 'ONLINE_CARD',
      label: 'Cartão de crédito ou débito',
      hint: 'Pague agora pelo Mercado Pago (aceita também saldo Mercado Pago)',
      icon: <CreditCard className="h-5 w-5" />,
    });
  }

  const onDelivery: Row[] = [];
  const d = options.onDelivery;
  if (d.cash) onDelivery.push({ method: 'CASH', label: 'Dinheiro', hint: 'Pague ao receber o pedido', icon: <Banknote className="h-5 w-5" /> });
  if (d.credit) {
    onDelivery.push({ method: 'CREDIT_ON_DELIVERY', label: 'Cartão de crédito', hint: 'Na maquininha, na entrega', icon: <CreditCard className="h-5 w-5" /> });
  }
  if (d.debit) {
    onDelivery.push({ method: 'DEBIT_ON_DELIVERY', label: 'Cartão de débito', hint: 'Na maquininha, na entrega', icon: <CreditCard className="h-5 w-5" /> });
  }
  if (d.voucher.enabled) {
    onDelivery.push({ method: 'VOUCHER_ON_DELIVERY', label: 'Vale-refeição / alimentação', hint: 'Na maquininha, na entrega', icon: <Ticket className="h-5 w-5" /> });
  }

  const select = (method: DeliveryPaymentMethod) => onChange({ ...value, method });
  const change = parseChangeInput(value.changeFor, total);

  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-bold text-sm flex items-center gap-2">
        <Wallet className="h-4 w-4" /> Forma de Pagamento
      </h3>

      {online.length > 0 && (
        <div className="space-y-2" role="radiogroup" aria-label="Pagar agora">
          <p className="text-xs font-medium uppercase text-gray-500">Pagar agora</p>
          {online.map((row) => (
            <OptionRow key={row.method} row={row} selected={value.method === row.method} onSelect={() => select(row.method)} />
          ))}
        </div>
      )}

      {onDelivery.length > 0 && (
        <div className="space-y-2" role="radiogroup" aria-label="Pagar na entrega">
          <p className="text-xs font-medium uppercase text-gray-500">Pagar na entrega</p>
          {onDelivery.map((row) => (
            <OptionRow key={row.method} row={row} selected={value.method === row.method} onSelect={() => select(row.method)} />
          ))}
        </div>
      )}

      {value.method === 'CASH' && (
        <div>
          <label htmlFor="delivery-change-for" className="text-xs font-medium text-gray-600">
            Troco para quanto? (opcional)
          </label>
          <Input
            id="delivery-change-for"
            inputMode="decimal"
            placeholder="Ex.: 100,00"
            value={value.changeFor}
            aria-invalid={!change.valid}
            onChange={(e) => onChange({ ...value, changeFor: e.target.value })}
          />
          {!change.valid ? (
            <p className="mt-1 text-xs text-red-600">{change.error}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              Total do pedido: {formatBRL(total)}. Deixe em branco se não precisar de troco.
            </p>
          )}
        </div>
      )}

      {value.method === 'VOUCHER_ON_DELIVERY' && (
        <div>
          <label htmlFor="delivery-voucher-brand" className="text-xs font-medium text-gray-600">
            Bandeira do vale
          </label>
          <select
            id="delivery-voucher-brand"
            className="w-full rounded-lg border p-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-300"
            value={value.voucherBrand}
            onChange={(e) => onChange({ ...value, voucherBrand: e.target.value })}
          >
            <option value="">Escolha a bandeira</option>
            {d.voucher.brands.map((id) => (
              <option key={id} value={id}>
                {VOUCHER_BRANDS[id] ?? id}
              </option>
            ))}
          </select>
        </div>
      )}
    </Card>
  );
}
