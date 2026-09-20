'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Wallet } from 'lucide-react';
import { VOUCHER_BRANDS, VOUCHER_BRAND_IDS, type DeliveryPaymentSettingsData } from '@/lib/delivery-payments/choice';

interface Loaded {
  settings: DeliveryPaymentSettingsData;
  online: { connected: boolean };
}

/** The server writes its messages in Portuguese; anything else (raw field names, empty) gets the fallback. */
function serverMessage(json: unknown, fallback: string): string {
  const error = json && typeof json === 'object' ? (json as { error?: unknown }).error : undefined;
  if (typeof error !== 'string' || !error.trim() || /^Campo inválido:/i.test(error)) return fallback;
  return error;
}

export function PaymentSettingsCard() {
  const [data, setData] = useState<Loaded | null>(null);
  const [settings, setSettings] = useState<DeliveryPaymentSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/delivery/payment-settings', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(serverMessage(json, 'Não foi possível carregar as formas de pagamento'));
        return;
      }
      setData(json as Loaded);
      setSettings((json as Loaded).settings);
    } catch {
      setLoadError('Não foi possível carregar as formas de pagamento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    if (settings.acceptVoucherOnDelivery && settings.voucherBrands.length === 0) {
      toast.error('Escolha ao menos uma bandeira de vale-refeição');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/delivery/payment-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(serverMessage(json, 'Não foi possível salvar'));
        return;
      }
      setData(json as Loaded);
      setSettings((json as Loaded).settings);
      toast.success('Formas de pagamento salvas');
    } catch {
      toast.error('Não foi possível salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </Card>
    );
  }
  if (!data || !settings) {
    return (
      <Card className="p-6 space-y-3">
        <p className="text-sm text-gray-600">{loadError ?? 'Não foi possível carregar as formas de pagamento'}</p>
        <Button variant="outline" onClick={load}>
          Tentar novamente
        </Button>
      </Card>
    );
  }

  const toggleBrand = (id: string) =>
    setSettings({
      ...settings,
      voucherBrands: settings.voucherBrands.includes(id)
        ? settings.voucherBrands.filter((b) => b !== id)
        : [...settings.voucherBrands, id],
    });

  const check = (label: string, key: 'acceptCash' | 'acceptCreditOnDelivery' | 'acceptDebitOnDelivery' | 'acceptVoucherOnDelivery') => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
      />
      {label}
    </label>
  );

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Wallet className="h-6 w-6 text-orange-600 mt-0.5" />
        <div>
          <h2 className="text-lg font-semibold">Formas de pagamento do delivery</h2>
          <p className="text-sm text-gray-600">Escolha o que seus clientes podem usar ao pedir pelo link de delivery.</p>
        </div>
      </div>

      <div className="rounded-lg border p-3 text-sm">
        <p className="font-medium">Pagar agora (PIX, cartão de crédito e débito, saldo Mercado Pago)</p>
        {data.online.connected ? (
          <p className="text-green-700">Ativo: seu Mercado Pago está conectado.</p>
        ) : (
          <p className="text-gray-600">
            Indisponível até você conectar o Mercado Pago.{' '}
            <Link href="/dashboard/pagamentos/conectar" className="text-orange-600 underline">
              Conectar agora
            </Link>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Pagar na entrega</p>
        {check('Dinheiro (com troco)', 'acceptCash')}
        {check('Cartão de crédito na maquininha', 'acceptCreditOnDelivery')}
        {check('Cartão de débito na maquininha', 'acceptDebitOnDelivery')}
        {check('Vale-refeição / alimentação na maquininha', 'acceptVoucherOnDelivery')}

        {settings.acceptVoucherOnDelivery && (
          <div className="ml-6 space-y-1">
            <p className="text-xs text-gray-600">Bandeiras aceitas:</p>
            <div className="flex flex-wrap gap-3">
              {VOUCHER_BRAND_IDS.map((id) => (
                <label key={id} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={settings.voucherBrands.includes(id)} onChange={() => toggleBrand(id)} />
                  {VOUCHER_BRANDS[id]}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Salvar
      </Button>
    </Card>
  );
}
