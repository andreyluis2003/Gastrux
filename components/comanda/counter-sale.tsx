'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOutbox } from '@/components/offline/outbox-provider';
import { printInHiddenFrame } from '@/lib/print/print-frame';

interface MenuEntry {
  id: string;
  name: string;
  recipeId: string | null;
  price?: number | string;
  sellingPrice?: number;
  recipe?: { id: string; sellingPrice: number | string } | null;
  available?: boolean;
}

/**
 * Counter sale ("venda balcão"): pick items, "CPF na nota?", payment, done. The whole sale is ONE
 * request (POST /api/comanda/quick-sale) with an id chosen here, so it works offline: it waits in
 * the device outbox and is recorded once when the internet returns, with its NFC-e (owner decision
 * 2026-09-24, offline option (a)). The menu is the copy this device kept when it was last online.
 */
export function CounterSale({ onDone }: { onDone?: () => void }) {
  const { send, online } = useOutbox();
  const [menu, setMenu] = useState<MenuEntry[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [cpf, setCpf] = useState('');
  const [payment, setPayment] = useState('dinheiro');
  const [toKitchen, setToKitchen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/cardapio/itens')
      .then((res) => (res.ok ? res.json() : []))
      .then((items) => setMenu(Array.isArray(items) ? items : []))
      .catch(() => toast.error('Cardápio indisponível neste aparelho (abra-o uma vez com internet).'));
  }, []);

  const priceOf = (entry: MenuEntry) => Number(entry.price || entry.sellingPrice || entry.recipe?.sellingPrice || 0);
  const lines = useMemo(
    () => menu.filter((m) => cart[m.id] > 0).map((m) => ({ entry: m, quantity: cart[m.id] })),
    [menu, cart]
  );
  const total = lines.reduce((sum, l) => sum + Math.round(priceOf(l.entry) * 100) * l.quantity, 0) / 100;
  const visible = menu.filter((m) => m.available !== false && m.name?.toLowerCase().includes(search.toLowerCase()));
  const change = (id: string, delta: number) =>
    setCart((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));

  const finish = async () => {
    if (lines.length === 0) {
      toast.error('Adicione itens à venda');
      return;
    }
    setSaving(true);
    try {
      const clientId = `bal-${crypto.randomUUID()}`;
      const result = await send({
        method: 'POST',
        url: '/api/comanda/quick-sale',
        label: `Venda balcão R$ ${total.toFixed(2)}`,
        scope: 'counter-sale',
        queueable: true,
        body: {
          clientId,
          items: lines.map((l) => ({ menuItemId: l.entry.id, quantity: l.quantity })),
          customerCPF: cpf.replace(/\D/g, '') || undefined,
          paymentMethod: payment,
          sendToKitchen: toKitchen,
        },
      });
      if (result.queued) {
        toast.info('Sem internet: venda guardada neste aparelho. Ela é registrada e a NFC-e emitida quando a internet voltar.', { duration: 10000 });
      } else {
        const data = await result.response.json().catch(() => ({}));
        if (!result.response.ok) {
          toast.error(data.error || 'Erro ao registrar a venda');
          return;
        }
        toast.success('Venda registrada', {
          action: { label: 'Imprimir cupom', onClick: () => printInHiddenFrame(`/imprimir/cupom/${clientId}`) },
          duration: 15000,
        });
        if (data.nfce?.message) {
          (data.nfce.nfce?.status === 'authorized' ? toast.success : toast.warning)(data.nfce.message);
        }
      }
      setCart({});
      setCpf('');
      onDone?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 mb-8 bg-white shadow-lg">
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
        <ShoppingBag className="w-5 h-5" /> Venda balcão
      </h2>
      {!online && (
        <p className="text-sm text-amber-700 mb-3">Sem internet: a venda fica guardada neste aparelho e é enviada quando a conexão voltar.</p>
      )}
      <Input placeholder="Buscar item..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
      <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto mb-4">
        {visible.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-2 border rounded-md p-2">
            <div>
              <div className="font-semibold text-sm">{entry.name}</div>
              <div className="text-xs text-green-700">R$ {priceOf(entry).toFixed(2)}</div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" aria-label={`Menos ${entry.name}`} onClick={() => change(entry.id, -1)}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-6 text-center font-semibold">{cart[entry.id] ?? 0}</span>
              <Button size="icon" variant="outline" aria-label={`Mais ${entry.name}`} onClick={() => change(entry.id, 1)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="text-sm font-semibold block mb-1">CPF na nota?</label>
          <Input placeholder="Opcional" value={cpf} onChange={(e) => setCpf(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Pagamento</label>
          <select className="w-full border rounded-md h-10 px-3 bg-background" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="dinheiro">Dinheiro</option>
            <option value="cartao de credito">Cartão de crédito</option>
            <option value="cartao de debito">Cartão de débito</option>
            <option value="pix">PIX (maquininha)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm h-10">
          <input type="checkbox" checked={toKitchen} onChange={(e) => setToKitchen(e.target.checked)} /> Enviar para a cozinha
        </label>
      </div>
      <div className="flex items-center justify-between mt-4">
        <span className="text-2xl font-bold text-green-700">R$ {total.toFixed(2)}</span>
        <Button onClick={finish} disabled={saving || lines.length === 0} className="bg-green-600">
          {saving ? 'Registrando...' : 'Finalizar venda'}
        </Button>
      </div>
    </Card>
  );
}
