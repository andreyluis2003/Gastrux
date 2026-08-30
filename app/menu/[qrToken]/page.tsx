// FASE 50: Public customer-facing menu page - accessed via QR code scan
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { ShoppingBag, Plus, Minus, X, Check, Search, ChefHat, QrCode, Loader2, CreditCard, Copy, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface MenuBadge {
  type: 'popular' | 'chef';
  label: string;
  emoji: string;
}

interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: string | number;
  recipeId?: string | null;
  available: boolean;
  images: { id: string; imageUrl: string }[];
  badge?: MenuBadge | null;
}

interface ComboItem {
  name: string;
  price: number;
}

interface Combo {
  id: string;
  name: string;
  description: string;
  items: ComboItem[];
  discountPercent: number;
  comboPrice: number;
}

interface MenuCategory {
  id: string;
  name: string;
  emoji?: string | null;
  items: MenuItem[];
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  specialInstructions?: string;
  image?: string;
}

interface MenuData {
  table: { id: string; number: number; section: { name: string } };
  restaurant: { id: string; name: string };
  categories: MenuCategory[];
  combos?: Combo[];
}

export default function PublicMenuPage() {
  const params = useParams();
  const qrToken = params?.qrToken as string;

  const [menu, setMenu] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [success, setSuccess] = useState(false);
  // Pix payment state
  const [showPixPayment, setShowPixPayment] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{ paymentId: string; qrCode: string; qrCodeBase64: string; ticketUrl: string } | null>(null);
  const [pixPaid, setPixPaid] = useState(false);
  const [pixPolling, setPixPolling] = useState(false);
  const [orderTotal, setOrderTotal] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/public/menu/${qrToken}`);
        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error || 'Erro ao carregar cardápio');
          setLoading(false);
          return;
        }
        const data = await res.json();
        setMenu(data);
        if (data.categories[0]) setActiveCategoryId(data.categories[0].id);
      } catch (err) {
        console.error(err);
        toast.error('Erro ao carregar cardápio');
      } finally {
        setLoading(false);
      }
    };
    if (qrToken) load();
  }, [qrToken]);

  const filteredCategories = useMemo(() => {
    if (!menu) return [];
    if (!search.trim()) return menu.categories;
    const q = search.toLowerCase();
    return menu.categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.description && i.description.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [menu, search]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [cart]
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, i) => sum + i.quantity, 0),
    [cart]
  );

  const addToCart = (item: MenuItem) => {
    const price = Number(item.price) || 0;
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          price,
          quantity: 1,
          image: item.images?.[0]?.imageUrl,
        },
      ];
    });
    toast.success(`${item.name} adicionado`, { duration: 1500 });
  };

  const updateQty = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.menuItemId === menuItemId
            ? { ...c, quantity: Math.max(0, c.quantity + delta) }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  };

  const removeItem = (menuItemId: string) => {
    setCart((prev) => prev.filter((c) => c.menuItemId !== menuItemId));
  };

  // Generate Pix QR Code for table payment
  const generatePixPayment = async (amount: number) => {
    setPixLoading(true);
    try {
      const tableInfo = menu?.table;
      const res = await fetch('/api/pagamentos/mp/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          description: `Mesa ${tableInfo?.number || '?'} - ${menu?.restaurant?.name || 'Restaurante'}`,
          payerEmail: 'cliente@restaurante.com',
          payerName: customerName || 'Cliente',
          externalReference: `mesa-${tableInfo?.id || 'unknown'}-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (data.success && data.qrCode) {
        setPixData({
          paymentId: data.paymentId,
          qrCode: data.qrCode,
          qrCodeBase64: data.qrCodeBase64 || '',
          ticketUrl: data.ticketUrl || '',
        });
        setShowPixPayment(true);
        setOrderTotal(amount);
        // Start polling for payment status
        startPixPolling(data.paymentId);
      } else {
        toast.error('Erro ao gerar QR Code Pix');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar pagamento Pix');
    } finally {
      setPixLoading(false);
    }
  };

  const startPixPolling = (paymentId: string) => {
    setPixPolling(true);
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes (every 5s)
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        setPixPolling(false);
        return;
      }
      try {
        const res = await fetch(`/api/pagamentos/mp/pix/status?paymentId=${paymentId}`);
        const data = await res.json();
        if (data.approved) {
          clearInterval(interval);
          setPixPaid(true);
          setPixPolling(false);
          toast.success('Pagamento confirmado! ✅');
        }
      } catch { /* ignore polling errors */ }
    }, 5000);
    // Cleanup on unmount
    return () => clearInterval(interval);
  };

  const copyPixCode = () => {
    if (pixData?.qrCode) {
      navigator.clipboard.writeText(pixData.qrCode).then(() => {
        toast.success('Código Pix copiado!');
      }).catch(() => {
        toast.error('Erro ao copiar');
      });
    }
  };

  const submitOrder = async () => {
    if (cart.length === 0) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/public/orders/${qrToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim() || undefined,
          items: cart.map((c) => ({
            menuItemId: c.menuItemId,
            quantity: c.quantity,
            specialInstructions: c.specialInstructions,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Erro ao enviar pedido');
        return;
      }

      setOrderTotal(cartTotal);
      setSuccess(true);
      setCart([]);
      setCartOpen(false);
      toast.success('Pedido enviado para a cozinha!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar pedido');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100">
        <div className="text-center">
          <ChefHat className="w-12 h-12 text-amber-600 mx-auto mb-3 animate-pulse" />
          <p className="text-gray-600">Carregando cardápio...</p>
        </div>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center">
          <h1 className="text-xl font-bold mb-2">Mesa não encontrada</h1>
          <p className="text-gray-600 text-sm">
            O QR Code utilizado é inválido ou está desativado. Por favor, solicite ajuda ao
            atendente.
          </p>
        </Card>
      </div>
    );
  }

  // Pix Payment Screen
  if (showPixPayment && pixData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-cyan-100">
        <Card className="p-6 max-w-md w-full text-center">
          {pixPaid ? (
            <>
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold mb-2 text-green-700">Pagamento confirmado!</h1>
              <p className="text-gray-600 text-sm mb-4">
                R$ {orderTotal.toFixed(2)} pago via Pix com sucesso.
              </p>
              <Button onClick={() => { setShowPixPayment(false); setPixData(null); setPixPaid(false); setSuccess(false); }} className="w-full">
                Fazer outro pedido
              </Button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                <QrCode className="w-8 h-8 text-blue-600" />
              </div>
              <h1 className="text-xl font-bold mb-1">Pagar com Pix</h1>
              <p className="text-2xl font-bold text-blue-700 mb-4">R$ {orderTotal.toFixed(2)}</p>

              {/* QR Code */}
              {pixData.qrCodeBase64 ? (
                <div className="bg-white p-4 rounded-lg inline-block mb-4 border">
                  <img
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code Pix"
                    className="w-48 h-48 mx-auto"
                  />
                </div>
              ) : pixData.ticketUrl ? (
                <div className="mb-4">
                  <a href={pixData.ticketUrl} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 underline text-sm">
                    Abrir QR Code no Mercado Pago
                  </a>
                </div>
              ) : null}

              {/* Pix Copia e Cola */}
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Ou copie o código Pix:</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={pixData.qrCode}
                    className="flex-1 text-xs px-3 py-2 border rounded-md bg-gray-50 truncate"
                  />
                  <Button size="sm" variant="outline" onClick={copyPixCode}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Polling indicator */}
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguardando pagamento...
              </div>

              <div className="space-y-2">
                <Button variant="outline" className="w-full" onClick={() => { setShowPixPayment(false); setPixData(null); }}>
                  Voltar
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-100">
        <Card className="p-8 max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Pedido enviado!</h1>
          <p className="text-gray-600 text-sm mb-6">
            Seu pedido foi encaminhado para a cozinha. Em breve um atendente entregará em sua
            mesa.
          </p>
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => generatePixPayment(cartTotal > 0 ? cartTotal : orderTotal)}
              disabled={pixLoading}
            >
              {pixLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              Pagar com Pix
            </Button>
            <Button onClick={() => setSuccess(false)} className="w-full">
              Fazer outro pedido
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{menu.restaurant.name}</h1>
              <p className="text-xs text-gray-500">
                Mesa {menu.table.number} • {menu.table.section.name}
              </p>
            </div>
            <Button
              onClick={() => setCartOpen(true)}
              className="relative shrink-0 gap-2"
              disabled={cart.length === 0}
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
              <span className="hidden sm:inline">R$ {cartTotal.toFixed(2)}</span>
            </Button>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar no cardápio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category tabs */}
          {filteredCategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto mt-3 -mx-1 px-1 pb-1">
              {filteredCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategoryId(cat.id);
                    document
                      .getElementById(`cat-${cat.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                    activeCategoryId === cat.id
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat.emoji && <span className="mr-1">{cat.emoji}</span>}
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Categories + items */}
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-6">
        {filteredCategories.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum item encontrado</p>
          </div>
        )}

        {filteredCategories.map((cat) => (
          <div key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-48">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              {cat.emoji && <span>{cat.emoji}</span>}
              {cat.name}
            </h2>
            <div className="space-y-3">
              {cat.items.map((item) => {
                const inCart = cart.find((c) => c.menuItemId === item.id);
                return (
                  <Card
                    key={item.id}
                    className="p-3 flex gap-3 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => addToCart(item)}
                  >
                    {item.images?.[0]?.imageUrl && (
                      <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-100">
                        <Image
                          src={item.images[0].imageUrl}
                          alt={item.name}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-sm line-clamp-1">{item.name}</h3>
                        {item.badge && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                            item.badge.type === 'popular'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}>
                            {item.badge.emoji} {item.badge.label}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-amber-700">
                          R$ {Number(item.price).toFixed(2)}
                        </span>
                        {inCart ? (
                          <div
                            className="flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-7 h-7 p-0"
                              onClick={() => updateQty(item.id, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="font-semibold text-sm w-5 text-center">
                              {inCart.quantity}
                            </span>
                            <Button
                              size="sm"
                              className="w-7 h-7 p-0"
                              onClick={() => updateQty(item.id, 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" className="gap-1 h-7">
                            <Plus className="w-3 h-3" /> Adicionar
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        {/* Sprint 2: Combos Section */}
        {menu?.combos && menu.combos.length > 0 && (
          <div className="scroll-mt-48">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              🎁 Combos Especiais
            </h2>
            <div className="space-y-3">
              {menu.combos.map((combo) => (
                <Card key={combo.id} className="p-4 border-2 border-dashed border-amber-300 bg-amber-50/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-bold text-sm text-amber-900">{combo.name}</h3>
                      <p className="text-xs text-amber-700 mt-0.5">{combo.description}</p>
                      {combo.items.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {combo.items.map((ci, i) => (
                            <span key={i} className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                              {ci.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {combo.discountPercent > 0 && (
                        <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                          -{combo.discountPercent}%
                        </span>
                      )}
                      {combo.comboPrice > 0 && (
                        <p className="font-bold text-amber-700 text-sm mt-1">
                          R$ {Number(combo.comboPrice).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fixed cart button (mobile) */}
      {cart.length > 0 && !cartOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-20 max-w-3xl mx-auto">
          <Button
            onClick={() => setCartOpen(true)}
            className="w-full justify-between gap-3 shadow-lg h-14 text-base"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Ver carrinho ({cartCount})
            </span>
            <span className="font-bold">R$ {cartTotal.toFixed(2)}</span>
          </Button>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setCartOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-bold">Seu pedido</h2>
                <p className="text-xs text-gray-500">Mesa {menu.table.number}</p>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center"
                aria-label="Fechar carrinho"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.map((item) => (
                <div key={item.menuItemId} className="flex gap-3">
                  {item.image && (
                    <div className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-gray-100">
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{item.name}</h3>
                    <p className="text-xs text-gray-500">R$ {item.price.toFixed(2)} cada</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-7 h-7 p-0"
                        onClick={() => updateQty(item.menuItemId, -1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="font-semibold text-sm w-5 text-center">{item.quantity}</span>
                      <Button
                        size="sm"
                        className="w-7 h-7 p-0"
                        onClick={() => updateQty(item.menuItemId, 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <button
                        onClick={() => removeItem(item.menuItemId)}
                        className="ml-auto text-xs text-red-600 hover:underline"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  <div className="text-sm font-bold shrink-0">
                    R$ {(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}

              <div className="pt-3 border-t">
                <label className="text-xs text-gray-600 block mb-1">
                  Seu nome (opcional)
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex: João"
                  maxLength={40}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="border-t p-4 space-y-3 bg-white">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total</span>
                <span className="text-xl font-bold">R$ {cartTotal.toFixed(2)}</span>
              </div>
              <Button
                onClick={submitOrder}
                disabled={submitting || cart.length === 0}
                className="w-full h-12 text-base"
              >
                {submitting ? 'Enviando...' : 'Enviar pedido para cozinha'}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setOrderTotal(cartTotal); generatePixPayment(cartTotal); }}
                disabled={pixLoading || cart.length === 0}
                className="w-full h-10 text-sm gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                {pixLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Pagar com Pix agora
              </Button>
              <p className="text-xs text-gray-500 text-center">
                Envie o pedido ou pague direto com Pix.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
