'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOutbox } from '@/components/offline/outbox-provider';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { KeyHint, PaymentPanel, panelState, type PanelPayment } from '@/components/caixa/payment-panel';
import { addRemaining, finishHint, toApiAmount } from '@/components/caixa/panel-state';
import { COUNTER_KEYS_LEGEND, counterKeyAction } from '@/lib/vender/counter-keys';
import { OpenShiftCard } from '@/components/caixa/open-shift-card';
import { brl } from '@/components/caixa/money';
import { useDeviceShift } from '@/lib/caixa/use-device-shift';
import { WeightSheet } from '@/components/vender/weight-sheet';
import { kgLabel, weightLineCents } from '@/lib/comanda/weight';

/** The "Venda registrada" notices, one per sale (each keeps its own "Imprimir cupom"); a comanda screen
 *  dismisses them all (they stayed over the next comanda, 2026-10-12) */
const saleNotices = new Set<string>();
export function dismissSaleNotices() {
  saleNotices.forEach((id) => toast.dismiss(id));
  saleNotices.clear();
}

interface MenuEntry {
  id: string;
  name: string;
  recipeId: string | null;
  price?: number | string;
  sellingPrice?: number;
  recipe?: { id: string; sellingPrice: number | string } | null;
  available?: boolean;
  /** Price per kg; each weighing is its own line (spec 2026-10-25 venda-por-peso) */
  soldByWeight?: boolean;
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
  // Products sold by weight: one line per weighing
  const [weighed, setWeighed] = useState<Array<{ key: string; entry: MenuEntry; grams: number }>>([]);
  const [weighing, setWeighing] = useState<MenuEntry | null>(null);
  const [search, setSearch] = useState('');
  const [cpf, setCpf] = useState('');
  // The customer for the cashback and the CRM (spec 2026-10-23 §7.2): earns, never uses; a new phone needs the name
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  // Coupon (spec 2026-11-16 cupom-whatsapp-balcao, parte 1b): checked on the server (nothing written), needs internet;
  // the sale sends only the code and the server computes the discount again
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  // Payments of the sale and this device's cash shift (spec docs/superpowers/specs/2026-10-04-caixa-turnos-design.md §8.3)
  const [payments, setPayments] = useState<PanelPayment[]>([]);
  const shift = useDeviceShift();
  const [toKitchen, setToKitchen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Keyboard (atalhos no balcão, 2026-10-26): the highlighted search result, Enter adds it
  const searchRef = useRef<HTMLInputElement>(null);
  const [highlight, setHighlight] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);

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
  const subtotalCents = lines.reduce((sum, l) => sum + Math.round(priceOf(l.entry) * 100) * l.quantity, 0)
    + weighed.reduce((sum, w) => sum + weightLineCents(priceOf(w.entry), w.grams), 0);
  const total = Math.max(0, subtotalCents - (coupon?.discountCents ?? 0)) / 100;
  const itemCount = lines.length + weighed.length;
  const saleItems = () => [
    ...lines.map((l) => ({ menuItemId: l.entry.id, quantity: l.quantity })),
    ...weighed.map((w) => ({ menuItemId: w.entry.id, weightGrams: w.grams })),
  ];
  const checkCoupon = async (code: string, quiet = false) => {
    setCheckingCoupon(true);
    try {
      const res = await fetch('/api/comanda/coupon-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, customerPhone: phone.trim() || undefined, items: saleItems() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCoupon(null);
        setCouponError(data.error || 'Não foi possível conferir o cupom');
        return;
      }
      setCoupon({ code: data.code, discountCents: data.discountCents });
      setCouponError('');
      if (!quiet) setCouponInput('');
    } catch {
      // The connection dropped: an applied coupon stays (the server computes it again on the sale)
      if (!quiet) setCouponError('Cupom precisa de internet');
    } finally {
      setCheckingCoupon(false);
    }
  };
  // The items or the phone changed: the discount (a percent, the minimum, the per-phone rules) is checked again
  const couponKey = JSON.stringify([saleItems(), phone.trim()]);
  useEffect(() => {
    if (!coupon || !online) return;
    const t = setTimeout(() => (itemCount === 0 ? setCoupon(null) : checkCoupon(coupon.code, true)), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponKey]);
  const hint = finishHint(Math.round(total * 100), payments);
  const visible = menu.filter((m) => m.available !== false && m.name?.toLowerCase().includes(search.toLowerCase()));
  const change = (id: string, delta: number) =>
    setCart((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));
  const picked = visible[Math.min(highlight, Math.max(0, visible.length - 1))];
  useEffect(() => {
    if (searchFocused) document.querySelector('[data-counter-picked="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlight, searchFocused]);

  const finish = async () => {
    // The discount is being checked again (items or phone changed): wait for it, the total may still change
    if (checkingCoupon) return;
    if (itemCount === 0) {
      toast.error('Adicione itens à venda');
      return;
    }
    if (!shift.shiftId) {
      toast.error('Abra o caixa para receber');
      return;
    }
    if (!panelState(Math.round(total * 100), payments).valid) {
      toast.error('Confira as formas de pagamento');
      return;
    }
    setSaving(true);
    try {
      const clientId = `bal-${crypto.randomUUID()}`;
      const result = await send({
        method: 'POST',
        url: '/api/comanda/quick-sale',
        label: `Venda balcão ${brl(Math.round(total * 100))}${coupon ? ` (cupom ${coupon.code})` : ''}`,
        scope: 'counter-sale',
        queueable: true,
        body: {
          clientId,
          items: saleItems(),
          couponCode: coupon?.code,
          customerCPF: cpf.replace(/\D/g, '') || undefined,
          customerPhone: phone.trim() || undefined,
          customerName: customerName.trim() || undefined,
          cashSessionId: shift.shiftId,
          payments: payments.map((p) => ({ method: p.method, amount: toApiAmount(p.amount) })),
          // Made without internet: the server records it in this shift even if it closes before the sale arrives
          ...(typeof navigator !== 'undefined' && !navigator.onLine ? { queuedAt: new Date().toISOString() } : {}),
          sendToKitchen: toKitchen,
        },
      });
      if (result.queued) {
        toast.info(`Sem internet: venda guardada neste aparelho. Ela é registrada e a NFC-e emitida quando a internet voltar${phone.trim() ? '; o cashback entra quando a venda chegar' : ''}.`, { duration: 10000 });
      } else {
        const data = await result.response.json().catch(() => ({}));
        if (!result.response.ok) {
          if (data.code === 'CASH_SESSION_REQUIRED') shift.refresh();
          toast.error(data.error || 'Erro ao registrar a venda');
          return;
        }
        if (data.changeCents > 0) toast.success(`Troco: ${brl(data.changeCents)}`, { duration: 15000 });
        if (data.cashbackEarnedCents > 0) toast.success(`O cliente ganhou ${brl(data.cashbackEarnedCents)} de cashback`, { duration: 15000 });
        saleNotices.add(`counter-sale-done:${clientId}`);
        toast.success('Venda registrada', {
          action: { label: 'Imprimir cupom', onClick: () => printInHiddenFrame(`/imprimir/cupom/${clientId}`) },
          duration: 15000,
          id: `counter-sale-done:${clientId}`,
          onDismiss: () => saleNotices.delete(`counter-sale-done:${clientId}`),
          onAutoClose: () => saleNotices.delete(`counter-sale-done:${clientId}`),
        });
        if (data.nfce?.message) {
          (data.nfce.nfce?.status === 'authorized' ? toast.success : toast.warning)(data.nfce.message);
        }
        // Last, so it sits on top of the stack of notices
        if (data.changeWarning) toast.warning(data.changeWarning, { duration: 20000 });
        // The coupon no longer met a rule when the sale arrived: it went in with the discount, marked out of rule
        if (data.couponWarning) toast.warning(`Cupom aceito fora da regra: ${data.couponWarning}`, { duration: 20000 });
      }
      setCart({});
      setWeighed([]);
      setCpf('');
      setPhone('');
      setCustomerName('');
      setCoupon(null);
      setCouponInput('');
      setCouponError('');
      setPayments([]);
      onDone?.();
    } finally {
      setSaving(false);
    }
  };

  // The latest state for the key handler, which is registered once
  const keyState = useRef({ visible, picked, total, payments, itemCount });
  keyState.current = { visible, picked, total, payments, itemCount };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);
      // A dialog over the sale (Pesar, a confirm) keeps its own keys
      if (t?.closest?.('[role="dialog"]')) return;
      const action = counterKeyAction({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, inField, inSearch: t === searchRef.current });
      if (!action) return;
      e.preventDefault();
      const s = keyState.current;
      if (action === 'focusSearch') { searchRef.current?.focus(); searchRef.current?.select(); return; }
      if (action === 'next') { setHighlight((h) => Math.min(h + 1, Math.max(0, s.visible.length - 1))); return; }
      if (action === 'prev') { setHighlight((h) => Math.max(0, h - 1)); return; }
      if (action === 'leaveSearch') { setSearch(''); searchRef.current?.blur(); return; }
      if (action === 'pick') {
        if (!s.picked) return;
        if (s.picked.soldByWeight) setWeighing(s.picked);
        else { change(s.picked.id, 1); toast.success(`+1 ${s.picked.name}`, { duration: 1200 }); }
        setSearch('');
        return;
      }
      if (action === 'finish') { if (!saving) finishRef.current(); return; }
      if (action.startsWith('pay:') && s.itemCount > 0) {
        setPayments(addRemaining(Math.round(s.total * 100), s.payments, action.slice(4) as PanelPayment['method']));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving]);

  return (
    <Card className="p-6 mb-8 bg-white shadow-lg">
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
        <ShoppingBag className="w-5 h-5" /> Venda balcão
      </h2>
      {!online && (
        <p className="text-sm text-amber-700 mb-3">Sem internet: a venda fica guardada neste aparelho e é enviada quando a conexão voltar.</p>
      )}
      <p className="hidden md:block text-xs text-slate-500 mb-2">{COUNTER_KEYS_LEGEND}</p>
      <div className="relative mb-3">
        <Input
          ref={searchRef}
          placeholder="Buscar item..."
          aria-label="Buscar item (F2)"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setHighlight(0); }}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="pr-12"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2"><KeyHint k="F2" /></span>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto mb-4">
        {visible.map((entry) => (
          <div key={entry.id} data-counter-picked={searchFocused && entry === picked ? 'true' : undefined} className={`flex items-center justify-between gap-2 border rounded-md p-2 ${searchFocused && entry === picked ? 'ring-2 ring-green-600 bg-green-50' : ''}`}>
            <div>
              <div className="font-semibold text-sm">{entry.name}</div>
              <div className="text-xs text-green-700">{brl(Math.round(priceOf(entry) * 100))}{entry.soldByWeight ? '/kg' : ''}</div>
            </div>
            {entry.soldByWeight ? (
              <Button size="sm" variant="outline" aria-label={`Pesar ${entry.name}`} onClick={() => setWeighing(entry)}>
                Pesar
              </Button>
            ) : (
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" aria-label={`Menos ${entry.name}`} onClick={() => change(entry.id, -1)}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-6 text-center font-semibold">{cart[entry.id] ?? 0}</span>
              <Button size="icon" variant="outline" aria-label={`Mais ${entry.name}`} onClick={() => change(entry.id, 1)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            )}
          </div>
        ))}
      </div>
      {weighed.length > 0 && (
        <ul className="mb-4 space-y-1">
          {weighed.map((w) => (
            <li key={w.key} className="flex items-center justify-between gap-2 text-sm border rounded-md p-2 bg-amber-50">
              <span>{kgLabel(w.grams)} {w.entry.name}</span>
              <span className="flex items-center gap-2">
                {brl(weightLineCents(priceOf(w.entry), w.grams))}
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setWeighed((prev) => prev.filter((x) => x.key !== w.key))}>Remover</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {weighing && (
        <WeightSheet
          name={weighing.name}
          pricePerKg={priceOf(weighing)}
          onAdd={async (grams) => { setWeighed((prev) => [...prev, { key: crypto.randomUUID(), entry: weighing, grams }]); return true; }}
          onClose={() => setWeighing(null)}
        />
      )}
      <div className="grid sm:grid-cols-2 gap-3 items-end">
        <div>
          <label htmlFor="counter-cpf" className="text-sm font-semibold block mb-1">CPF na nota?</label>
          <Input id="counter-cpf" placeholder="Opcional" value={cpf} onChange={(e) => setCpf(e.target.value)} />
        </div>
        <div>
          <label htmlFor="counter-phone" className="text-sm font-semibold block mb-1">Celular do cliente (cashback)</label>
          <Input id="counter-phone" inputMode="tel" placeholder="Opcional" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label htmlFor="counter-coupon" className="text-sm font-semibold block mb-1">Cupom</label>
          <div className="flex gap-2">
            <Input
              id="counter-coupon"
              placeholder={online ? 'Opcional' : 'Cupom precisa de internet'}
              value={couponInput}
              disabled={!online || checkingCoupon}
              onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && couponInput.trim() && itemCount > 0) { e.preventDefault(); checkCoupon(couponInput.trim()); } }}
            />
            <Button type="button" variant="outline" disabled={!online || checkingCoupon || !couponInput.trim() || itemCount === 0} onClick={() => checkCoupon(couponInput.trim())}>
              {checkingCoupon ? 'Conferindo...' : 'Aplicar'}
            </Button>
          </div>
          {!online && <p className="text-xs text-amber-700 mt-1">Cupom precisa de internet</p>}
          {couponError && <p role="alert" className="text-xs text-red-600 mt-1">{couponError}</p>}
        </div>
        {phone.trim() && (
          <div>
            <label htmlFor="counter-customer" className="text-sm font-semibold block mb-1">Nome (cliente novo)</label>
            <Input id="counter-customer" placeholder="Só se for a primeira compra" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm h-10">
          <input type="checkbox" checked={toKitchen} onChange={(e) => setToKitchen(e.target.checked)} /> Enviar para a cozinha
        </label>
      </div>
      <div className="mt-4">
        {shift.loading ? (
          <p className="text-sm">Carregando caixa...</p>
        ) : !shift.shiftId && shift.register ? (
          <div className="rounded-md bg-amber-50 p-3 space-y-2">
            <p className="text-sm font-semibold">Abra o caixa para receber</p>
            <OpenShiftCard registerId={shift.register.id} registerName={shift.register.name} onOpened={() => shift.refresh()} />
          </div>
        ) : (
          itemCount > 0 && <PaymentPanel totalCents={Math.round(total * 100)} payments={payments} onChange={setPayments} disabled={saving} keys />
        )}
      </div>
      {/* Why the button is still grey (2026-10-12: it stayed disabled with no reason on screen) */}
      {itemCount > 0 && shift.shiftId && hint && (
        <p className="text-sm text-amber-700 mt-3 text-right">{hint}</p>
      )}
      {coupon && (
        <div className="flex items-center justify-between gap-2 text-sm mt-3 border rounded-md p-2 bg-green-50">
          <span>Cupom {coupon.code} − {brl(coupon.discountCents)}</span>
          <Button size="sm" variant="ghost" className="text-red-600" disabled={saving} onClick={() => { setCoupon(null); setCouponError(''); }}>Tirar</Button>
        </div>
      )}
      <div className="flex items-center justify-between mt-4">
        <span className="text-2xl font-bold text-green-700">{brl(Math.round(total * 100))}</span>
        <Button onClick={finish} disabled={saving || checkingCoupon || itemCount === 0 || !shift.shiftId || !panelState(Math.round(total * 100), payments).valid} className="bg-green-600">
          {saving ? 'Registrando...' : <>Finalizar venda<KeyHint k="Ctrl+Enter" /></>}
        </Button>
      </div>
    </Card>
  );
}
