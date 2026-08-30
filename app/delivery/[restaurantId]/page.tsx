'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import {
  ShoppingBag, Plus, Minus, X, Search, Loader2, MapPin, Phone, User,
  Mail, Copy, CheckCircle, ChevronDown, Bike, Store, Clock, CreditCard, ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: string | number;
  available: boolean;
  images: { id: string; imageUrl: string }[];
}

interface MenuCategory {
  id: string;
  name: string;
  emoji?: string | null;
  items: MenuItem[];
}

interface RestaurantInfo {
  id: string;
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  businessHours?: any;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  specialInstructions?: string;
  image?: string;
}

const DELIVERY_FEE = 5.0;

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DeliveryPage() {
  const params = useParams();
  const restaurantId = params?.restaurantId as string;

  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  // Checkout state
  const [step, setStep] = useState<'menu' | 'checkout' | 'payment' | 'success'>('menu');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryZipCode, setDeliveryZipCode] = useState('');
  const [deliveryComplement, setDeliveryComplement] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [scheduledDelivery, setScheduledDelivery] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Pix payment
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{ paymentId: string; qrCode: string; qrCodeBase64: string; ticketUrl: string } | null>(null);
  const [pixPaid, setPixPaid] = useState(false);
  const [pixPolling, setPixPolling] = useState(false);
  const [orderData, setOrderData] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/public/delivery/menu/${restaurantId}`);
        if (!res.ok) {
          toast.error('Erro ao carregar cardápio');
          setLoading(false);
          return;
        }
        const data = await res.json();
        setRestaurant(data.restaurant);
        setCategories(data.categories);
        if (data.categories[0]) setActiveCategoryId(data.categories[0].id);
      } catch {
        toast.error('Erro de conexão');
      } finally {
        setLoading(false);
      }
    };
    if (restaurantId) load();
  }, [restaurantId]);

  const cartTotal = useMemo(() => cart.reduce((sum, i) => sum + i.price * i.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, i) => sum + i.quantity, 0), [cart]);
  const grandTotal = cartTotal + DELIVERY_FEE;

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.map((cat) => ({
      ...cat,
      items: cat.items.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)),
    })).filter((c) => c.items.length > 0);
  }, [categories, search]);

  // Upsell state
  const [upsellItems, setUpsellItems] = useState<any[]>([]);
  const [upsellFor, setUpsellFor] = useState<string | null>(null);

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) return prev.map((c) => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1, image: item.images[0]?.imageUrl }];
    });
    toast.success(`${item.name} adicionado`);
    // Fetch upsell suggestions
    fetchUpsell(item.id);
  }

  async function fetchUpsell(menuItemId: string) {
    try {
      const res = await fetch(`/api/upsell/suggestions?menuItemId=${menuItemId}&limit=2`);
      if (res.ok) {
        const data = await res.json();
        if (data.suggestions?.length > 0) {
          setUpsellItems(data.suggestions);
          setUpsellFor(menuItemId);
          setTimeout(() => { setUpsellItems([]); setUpsellFor(null); }, 8000);
        }
      }
    } catch { /* ignore */ }
  }

  function updateCartQuantity(menuItemId: string, delta: number) {
    setCart((prev) => prev.map((c) => c.menuItemId === menuItemId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c).filter((c) => c.quantity > 0));
  }

  async function handleSubmitOrder() {
    if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
      toast.error('Preencha nome, telefone e endereço');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/delivery/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          customerName,
          customerPhone,
          customerEmail: customerEmail || undefined,
          deliveryAddress,
          deliveryNeighborhood,
          deliveryCity,
          deliveryZipCode,
          deliveryComplement,
          deliveryReference,
          items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
          specialInstructions: scheduledDelivery && scheduledDate && scheduledTime
            ? `[AGENDADO: ${scheduledDate} às ${scheduledTime}] ${specialInstructions}`.trim()
            : specialInstructions,
          deliveryFee: DELIVERY_FEE,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar pedido');
      setOrderData(data.order);
      setStep('payment');
      toast.success('Pedido criado! Realize o pagamento.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar pedido');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePixPayment() {
    if (!orderData) return;
    setPixLoading(true);
    try {
      const res = await fetch('/api/pagamentos/mp/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: orderData.total,
          description: `Delivery ${orderData.orderNumber}`,
          payerEmail: customerEmail || 'cliente@delivery.com',
          payerName: customerName,
          externalReference: orderData.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar PIX');
      setPixData(data);
      startPixPolling(data.paymentId);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar pagamento PIX');
    } finally {
      setPixLoading(false);
    }
  }

  function startPixPolling(paymentId: string) {
    setPixPolling(true);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pagamentos/mp/pix/status?paymentId=${paymentId}`);
        const data = await res.json();
        if (data.status === 'approved') {
          clearInterval(interval);
          setPixPaid(true);
          setPixPolling(false);
          setStep('success');
          toast.success('Pagamento confirmado!');
        }
      } catch { /* continue polling */ }
    }, 5000);
    // Stop after 10 min
    setTimeout(() => { clearInterval(interval); setPixPolling(false); }, 600000);
  }

  function copyPixCode() {
    if (pixData?.qrCode) {
      navigator.clipboard.writeText(pixData.qrCode);
      toast.success('Código PIX copiado!');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-orange-600" />
          <p className="text-gray-600">Carregando cardápio...</p>
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <Store className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-bold mb-2">Restaurante não encontrado</h2>
          <p className="text-gray-500">O link de delivery é inválido ou o restaurante não está disponível.</p>
        </Card>
      </div>
    );
  }

  // SUCCESS step
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md w-full space-y-4">
          <CheckCircle className="h-16 w-16 mx-auto text-green-600" />
          <h2 className="text-2xl font-bold text-green-800">Pedido Confirmado!</h2>
          <p className="text-gray-600">Seu pedido <span className="font-bold">#{orderData?.orderNumber}</span> foi recebido.</p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-left space-y-1">
            <p className="text-sm"><span className="font-medium">Total:</span> {formatBRL(orderData?.total || 0)}</p>
            <p className="text-sm"><span className="font-medium">Entrega em:</span> {deliveryAddress}</p>
            <p className="text-sm"><span className="font-medium">Status:</span> Pagamento confirmado ✔</p>
          </div>
          <p className="text-sm text-gray-500">Acompanhe seu pedido pelo telefone do restaurante.</p>
          {restaurant.phone && <p className="text-sm font-medium"><Phone className="inline h-4 w-4 mr-1" />{restaurant.phone}</p>}
          <Button className="w-full mt-4" onClick={() => { setStep('menu'); setCart([]); setOrderData(null); setPixData(null); setPixPaid(false); }}>
            Fazer outro pedido
          </Button>
        </Card>
      </div>
    );
  }

  // PAYMENT step
  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
        <header className="bg-white border-b sticky top-0 z-10 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep('checkout')}><ArrowLeft className="h-5 w-5" /></Button>
            <h1 className="text-lg font-bold">Pagamento PIX</h1>
          </div>
        </header>
        <div className="max-w-lg mx-auto p-4 space-y-6">
          <Card className="p-6 space-y-4">
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-1">Pedido #{orderData?.orderNumber}</p>
              <p className="text-3xl font-bold text-orange-600">{formatBRL(orderData?.total || 0)}</p>
            </div>
            {!pixData ? (
              <Button className="w-full bg-orange-600 hover:bg-orange-700" onClick={handlePixPayment} disabled={pixLoading}>
                {pixLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Gerando PIX...</> : <><CreditCard className="h-4 w-4 mr-2" /> Gerar QR Code PIX</>}
              </Button>
            ) : !pixPaid ? (
              <div className="space-y-4">
                {pixData.qrCodeBase64 && (
                  <div className="flex justify-center">
                    <div className="bg-white p-3 rounded-xl border-2 border-orange-200">
                      <Image src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code PIX" width={220} height={220} />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-center">Ou copie o código:</p>
                  <div className="flex gap-2">
                    <Input readOnly value={pixData.qrCode} className="text-xs" />
                    <Button variant="outline" size="icon" onClick={copyPixCode}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-orange-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Aguardando pagamento...</span>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-2">
                <CheckCircle className="h-12 w-12 mx-auto text-green-600" />
                <p className="font-bold text-green-700">Pagamento confirmado!</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // CHECKOUT step
  if (step === 'checkout') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
        <header className="bg-white border-b sticky top-0 z-10 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep('menu')}><ArrowLeft className="h-5 w-5" /></Button>
            <h1 className="text-lg font-bold">Finalizar Pedido</h1>
          </div>
        </header>
        <div className="max-w-lg mx-auto p-4 space-y-4">
          {/* Order summary */}
          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> Resumo do Pedido</h3>
            <div className="space-y-2">
              {cart.map((item) => (
                <div key={item.menuItemId} className="flex justify-between text-sm">
                  <span>{item.quantity}x {item.name}</span>
                  <span className="font-medium">{formatBRL(item.price * item.quantity)}</span>
                </div>
              ))}
              <div className="border-t pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatBRL(cartTotal)}</span></div>
                <div className="flex justify-between text-sm"><span>Taxa de entrega</span><span>{formatBRL(DELIVERY_FEE)}</span></div>
                <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="text-orange-600">{formatBRL(grandTotal)}</span></div>
              </div>
            </div>
          </Card>

          {/* Customer info */}
          <Card className="p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><User className="h-4 w-4" /> Seus Dados</h3>
            <div>
              <label className="text-xs font-medium text-gray-600">Nome *</label>
              <Input placeholder="Seu nome" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Telefone *</label>
              <Input placeholder="(11) 99999-9999" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">E-mail (opcional)</label>
              <Input placeholder="email@exemplo.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
          </Card>

          {/* Delivery address */}
          <Card className="p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> Endereço de Entrega</h3>
            <div>
              <label className="text-xs font-medium text-gray-600">Endereço *</label>
              <Input placeholder="Rua, número" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Complemento</label>
              <Input placeholder="Apto, bloco" value={deliveryComplement} onChange={(e) => setDeliveryComplement(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Bairro</label>
                <Input placeholder="Bairro" value={deliveryNeighborhood} onChange={(e) => setDeliveryNeighborhood(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">CEP</label>
                <Input placeholder="00000-000" value={deliveryZipCode} onChange={(e) => setDeliveryZipCode(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Cidade</label>
              <Input placeholder="Cidade" value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Ponto de Referência</label>
              <Input placeholder="Próximo a..." value={deliveryReference} onChange={(e) => setDeliveryReference(e.target.value)} />
            </div>
          </Card>

          {/* Agendamento */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm flex items-center gap-1">{'🕐'} Agendar Entrega</h3>
              <button
                type="button"
                onClick={() => setScheduledDelivery(!scheduledDelivery)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scheduledDelivery ? 'bg-orange-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${scheduledDelivery ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {scheduledDelivery && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="text-xs text-gray-500">Data</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    max={new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{`Horário`}</label>
                  <input
                    type="time"
                    className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  />
                </div>
                <p className="col-span-2 text-xs text-gray-400">{`Agende com pelo menos 1h de antecedência.`}</p>
              </div>
            )}
          </Card>

          {/* Notes */}
          <Card className="p-4">
            <h3 className="font-bold text-sm mb-2">Observações</h3>
            <textarea
              className="w-full border rounded-lg p-2 text-sm resize-none h-20 focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
              placeholder="Alguma observação para o restaurante?"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
            />
          </Card>

          <Button
            className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold text-base"
            onClick={handleSubmitOrder}
            disabled={submitting || cart.length === 0}
          >
            {submitting ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Enviando...</> : <>Enviar Pedido • {formatBRL(grandTotal)}</>}
          </Button>
        </div>
      </div>
    );
  }

  // MENU step (default)
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {restaurant.logoUrl && (
              <div className="relative h-10 w-10 rounded-full overflow-hidden border">
                <Image src={restaurant.logoUrl} alt={restaurant.name} fill className="object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-lg truncate">{restaurant.name}</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Bike className="h-3 w-3" />
                <span>Delivery</span>
                {restaurant.address && <><span>•</span><span className="truncate">{restaurant.address}</span></>}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar no cardápio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-gray-50"
            />
          </div>

          {/* Category tabs */}
          {!search && categories.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategoryId(cat.id);
                    document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    activeCategoryId === cat.id ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat.emoji && <span className="mr-1">{cat.emoji}</span>}{cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Menu */}
      <main className="max-w-2xl mx-auto px-4 py-4 pb-28">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Search className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p>Nenhum item encontrado</p>
          </div>
        ) : (
          filteredCategories.map((cat) => (
            <div key={cat.id} id={`cat-${cat.id}`} className="mb-6">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                {cat.emoji && <span>{cat.emoji}</span>}{cat.name}
              </h2>
              <div className="space-y-3">
                {cat.items.map((item) => {
                  const inCart = cart.find((c) => c.menuItemId === item.id);
                  return (
                    <Card key={item.id} className="flex overflow-hidden hover:shadow-md transition-shadow">
                      <div className="flex-1 p-3">
                        <h3 className="font-semibold text-sm">{item.name}</h3>
                        {item.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="font-bold text-orange-600">{formatBRL(Number(item.price))}</span>
                          {inCart ? (
                            <div className="flex items-center gap-1 ml-auto">
                              <button onClick={() => updateCartQuantity(item.id, -1)} className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"><Minus className="h-3 w-3" /></button>
                              <span className="text-sm font-bold w-6 text-center">{inCart.quantity}</span>
                              <button onClick={() => updateCartQuantity(item.id, 1)} className="h-7 w-7 rounded-full bg-orange-100 flex items-center justify-center hover:bg-orange-200 text-orange-600"><Plus className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs border-orange-300 text-orange-600 hover:bg-orange-50" onClick={() => addToCart(item)}>
                              <Plus className="h-3 w-3 mr-1" /> Adicionar
                            </Button>
                          )}
                        </div>
                      </div>
                      {item.images[0]?.imageUrl && (
                        <div className="relative w-24 h-24 flex-shrink-0">
                          <Image src={item.images[0].imageUrl} alt={item.name} fill className="object-cover" />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>

      {/* Upsell suggestions */}
      {upsellItems.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-25 px-4 pb-2">
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg border p-3 animate-in slide-in-from-bottom">
            <p className="text-xs font-bold text-orange-600 mb-2">✨ Que tal adicionar?</p>
            <div className="flex gap-2 overflow-x-auto">
              {upsellItems.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => {
                    addToCart({ id: s.id, name: s.name, price: s.price, available: true, images: s.image ? [{ id: '1', imageUrl: s.image }] : [] } as MenuItem);
                    setUpsellItems([]);
                    setUpsellFor(null);
                  }}
                  className="flex items-center gap-2 bg-orange-50 rounded-lg p-2 min-w-[140px] hover:bg-orange-100 transition-colors text-left"
                >
                  {s.image && (
                    <div className="relative w-10 h-10 rounded-md overflow-hidden flex-shrink-0">
                      <Image src={s.image} alt={s.name} fill className="object-cover" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{s.name}</p>
                    <p className="text-xs text-orange-600 font-bold">{formatBRL(s.price)}</p>
                    <p className="text-[10px] text-gray-500 truncate">{s.reason}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-30">
          <div className="max-w-2xl mx-auto p-3">
            {cartOpen && (
              <div className="mb-3 space-y-2 max-h-48 overflow-y-auto">
                {cart.map((item) => (
                  <div key={item.menuItemId} className="flex items-center justify-between text-sm">
                    <span className="flex-1 truncate">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateCartQuantity(item.menuItemId, -1)} className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                      <span className="font-bold w-5 text-center">{item.quantity}</span>
                      <button onClick={() => updateCartQuantity(item.menuItemId, 1)} className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-600"><Plus className="h-3 w-3" /></button>
                      <span className="font-medium w-20 text-right">{formatBRL(item.price * item.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={() => setCartOpen(!cartOpen)} className="flex items-center gap-2 text-sm">
                <div className="relative">
                  <ShoppingBag className="h-6 w-6 text-orange-600" />
                  <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">{cartCount}</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${cartOpen ? 'rotate-180' : ''}`} />
              </button>
              <div className="flex-1">
                <p className="text-xs text-gray-500">Subtotal + entrega</p>
                <p className="font-bold text-orange-600">{formatBRL(grandTotal)}</p>
              </div>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white font-bold" onClick={() => setStep('checkout')}>
                Finalizar Pedido
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}