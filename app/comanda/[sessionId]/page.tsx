'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { lineTotal } from '@/lib/comanda/line-total';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useOutbox } from '@/components/offline/outbox-provider';
import { OfflineUnavailableError } from '@/lib/offline/outbox';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { ArrowLeft, Trash2, Plus, Send, Receipt, FileText, CheckCircle2, Printer } from 'lucide-react';

interface MenuItemEntry {
  id: string;
  name: string;
  recipeId: string | null;
  price?: number | string;
  sellingPrice?: number;
  recipe?: { id: string; name: string; sellingPrice: number | string } | null;
  available?: boolean;
}

interface SessionItem {
  id: string;
  addedAt?: string;
  /** A line made offline, still waiting in the device outbox. */
  pending?: boolean;
  quantity: number;
  price: string | number;
  recipe: { name: string };
  modifiers?: { priceAdjustment: string | number; modifier?: { name: string } }[];
}

interface Modifier {
  id: string;
  name: string;
  category?: string;
  priceAdjustment: number;
}

interface Session {
  id: string;
  items: SessionItem[];
  table?: {
    number: number;
    section: { name: string };
  };
  customerName?: string;
  tableNumber?: number | null;
  status?: string;
  sentToKitchenAt?: string | null;
}

export default function ComandaDetailPage() {
  const router = useRouter();
  const { sessionId } = useParams();

  const [session, setSession] = useState<Session | null>(null);
  const [recipes, setRecipes] = useState<MenuItemEntry[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<MenuItemEntry | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sendingToKitchen, setSendingToKitchen] = useState(false);
  const [showNfceModal, setShowNfceModal] = useState(false);
  const [nfceCpf, setNfceCpf] = useState('');
  const [nfceName, setNfceName] = useState('');
  const [emittingNfce, setEmittingNfce] = useState(false);
  const [emittedDoc, setEmittedDoc] = useState<any>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeCpf, setCloseCpf] = useState('');
  const [closePayment, setClosePayment] = useState('dinheiro');
  const [closingBill, setClosingBill] = useState(false);
  const { send, pendingFor, online } = useOutbox();
  // When the comanda shown is the copy kept on this device (no internet), since when
  const [staleSince, setStaleSince] = useState<string | null>(null);

  // What this device still has to send for this comanda (made offline): shown on the screen
  const pendingOps = pendingFor(String(sessionId));
  const pendingRemovals = new Set(
    pendingOps.filter((e) => e.method === 'DELETE').map((e) => e.url.split('/').pop())
  );
  const pendingLines: SessionItem[] = pendingOps
    .filter((e) => e.method === 'POST' && e.url.endsWith('/items'))
    .map((e) => ({
      id: e.id,
      pending: true,
      quantity: Number((e.display as any)?.quantity ?? 1),
      price: Number((e.display as any)?.unitPrice ?? 0),
      recipe: { name: String((e.display as any)?.name ?? 'Item') },
      modifiers: ((e.display as any)?.modifiers ?? []) as SessionItem['modifiers'],
    }));
  const visibleItems: SessionItem[] = [
    ...(session?.items ?? []).filter((item) => !pendingRemovals.has(item.id)),
    ...pendingLines,
  ];
  const closePending = pendingOps.some((e) => e.method === 'PUT' && (e.body as any)?.status === 'CLOSED');
  const isClosed = session?.status === 'CLOSED' || session?.status === 'CANCELLED' || closePending;

  // Changes of this comanda go through the device outbox (components/offline/outbox-provider.tsx):
  // offline they wait on this device and are sent once, in order, when the internet returns.
  const mutate = async (
    method: 'POST' | 'PUT' | 'DELETE',
    url: string,
    body: unknown,
    label: string,
    display?: Record<string, unknown>
  ): Promise<Response | null> => {
    const result = await send({ method, url, body, label, scope: String(sessionId), queueable: true, display });
    if (result.queued) {
      toast.info(`Sem internet: "${label}" ficou guardado neste aparelho e será enviado quando a conexão voltar.`);
      return null;
    }
    return result.response;
  };

  // A change made offline reached the server: show the comanda as the server has it now
  useEffect(() => {
    const onSent = (event: Event) => {
      if ((event as CustomEvent).detail?.scope === String(sessionId)) fetchSession();
    };
    window.addEventListener('gastrux:outbox-sent', onSent);
    return () => window.removeEventListener('gastrux:outbox-sent', onSent);
  }, [sessionId]);

  useEffect(() => {
    Promise.all([fetchSession(), fetchRecipes(), fetchModifiers()]);
  }, []);

  const handleEmitNFCe = async () => {
    if (!session?.items?.length) {
      toast.error('Comanda sem itens');
      return;
    }
    try {
      setEmittingNfce(true);
      // Needs the internet (a note cannot be signed on this device): refused offline, never queued
      const result = await send({
        method: 'POST',
        url: '/api/nfe/emit',
        label: 'Emitir NFC-e',
        queueable: false,
        body: {
          orderSessionId: sessionId,
          customerCPF: nfceCpf.replace(/\D/g, '') || undefined,
          customerName: nfceName.trim() || undefined,
        },
      });
      if (result.queued) return;
      const res = result.response;
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.rejectionReason || data.error || 'Erro ao emitir NFC-e');
      } else {
        toast.success('NFC-e emitida!');
        setEmittedDoc(data.document);
      }
    } catch (e: any) {
      toast.error(e instanceof OfflineUnavailableError ? e.message : e?.message || 'Erro');
    } finally {
      setEmittingNfce(false);
    }
  };

  // Closing the bill issues the NFC-e automatically when the restaurant enabled it (market practice:
  // "CPF na nota?" is asked here, before closing). A fiscal problem never blocks the close.
  const handleCloseBill = async () => {
    try {
      setClosingBill(true);
      const res = await mutate(
        'PUT',
        `/api/comanda/sessions/${sessionId}`,
        { status: 'CLOSED', customerCPF: closeCpf.replace(/\D/g, '') || undefined, paymentMethod: closePayment },
        'Fechar conta'
      );
      if (!res) {
        // Closed on this device; the server closes it (and issues the NFC-e) when the internet returns
        toast.warning('A NFC-e será emitida quando a internet voltar.', { duration: 8000 });
        setShowCloseModal(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao fechar a conta');
        return;
      }
      toast.success('Conta fechada', {
        action: { label: 'Imprimir cupom', onClick: () => printInHiddenFrame(`/imprimir/cupom/${sessionId}`) },
        duration: 15000,
      });
      const nfce = data.nfce;
      if (nfce?.nfce?.status === 'authorized') {
        toast.success(nfce.message);
        setEmittedDoc({ id: nfce.nfce.id, documentNumber: nfce.nfce.number });
      } else if (nfce?.nfce) {
        toast.warning(nfce.message, { duration: 10000 });
      } else if (nfce?.message) {
        toast.info(nfce.message);
      }
      setShowCloseModal(false);
      await fetchSession();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao fechar a conta');
    } finally {
      setClosingBill(false);
    }
  };

  const fetchSession = async () => {
    try {
      const res = await fetch(`/api/comanda/sessions/${sessionId}`);
      if (res.ok) {
        setSession(await res.json());
        // Served from this device's copy (service worker) while offline
        setStaleSince(res.headers.get('x-gastrux-cache') === 'stale' ? res.headers.get('x-gastrux-cached-at') : null);
      } else if (res.status === 503) {
        toast.error('Sem internet e esta comanda não está guardada neste aparelho.');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar comanda');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipes = async () => {
    try {
      const res = await fetch('/api/cardapio/itens');
      if (res.ok) {
        const items = await res.json();
        setRecipes(items || []);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const fetchModifiers = async () => {
    try {
      const res = await fetch('/api/modifiers');
      if (res.ok) {
        const data = await res.json();
        setModifiers(data.modifiers || []);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleAddItem = async () => {
    if (!selectedRecipe || quantity < 1) {
      toast.error('Selecione um item e quantidade valida');
      return;
    }

    try {
      const chosen = modifiers.filter((m) => selectedModifiers.includes(m.id));
      const res = await mutate(
        'POST',
        `/api/comanda/sessions/${sessionId}/items`,
        {
          menuItemId: selectedRecipe.id,
          recipeId: selectedRecipe.recipeId || selectedRecipe.recipe?.id || null,
          quantity: quantity,
          modifierIds: selectedModifiers,
        },
        `${quantity}x ${selectedRecipe.name}`,
        {
          name: selectedRecipe.name,
          quantity,
          unitPrice: Number(selectedRecipe.price || selectedRecipe.sellingPrice || 0),
          modifiers: chosen.map((m) => ({ priceAdjustment: m.priceAdjustment, modifier: { name: m.name } })),
        }
      );

      if (!res) {
        setSelectedRecipe(null);
        setSelectedModifiers([]);
        setQuantity(1);
      } else if (res.ok) {
        toast.success('Item adicionado');
        setSelectedRecipe(null);
        setSelectedModifiers([]);
        setQuantity(1);
        fetchSession();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erro ao adicionar item');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao adicionar item');
    }
  };

  // An item the kitchen already has is a cancellation: a manager, with a reason (asked when needed)
  const handleRemoveItem = async (itemId: string, reason?: string) => {
    try {
      // Known on this device too, so the reason is asked before (online or not)
      const item = session?.items?.find((i) => i.id === itemId);
      const kitchenHasIt =
        !!session?.sentToKitchenAt && !!item?.addedAt && new Date(item.addedAt) <= new Date(session.sentToKitchenAt);
      if (kitchenHasIt && !reason) {
        const asked = window.prompt('A cozinha já recebeu este item (exige gerente). Motivo do cancelamento:');
        if (!asked || !asked.trim()) return;
        reason = asked.trim();
      }
      const res = await mutate(
        'DELETE',
        `/api/comanda/sessions/${sessionId}/items/${itemId}`,
        reason ? { reason } : {},
        `Remover ${item?.recipe?.name ?? 'item'}`
      );
      if (!res) return;
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success('Item removido');
        fetchSession();
      } else if (res.status === 400 && !reason) {
        const asked = window.prompt('A cozinha já recebeu este item. Motivo do cancelamento:');
        if (asked && asked.trim()) await handleRemoveItem(itemId, asked.trim());
      } else {
        toast.error(data.error || 'Erro ao remover item');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao remover item');
    }
  };

  const handleSendToKitchen = async () => {
    if (visibleItems.length === 0) {
      toast.error('Adicione itens antes de enviar');
      return;
    }

    try {
      setSendingToKitchen(true);
      const res = await mutate('POST', `/api/comanda/sessions/${sessionId}/send-to-kitchen`, {}, 'Enviar para a cozinha');
      if (!res) {
        // Honest: the kitchen screen only gets it when the internet returns
        toast.warning('A cozinha só recebe este pedido quando a internet voltar: avise a cozinha agora.', { duration: 10000 });
        return;
      }

      if (res.ok) {
        const data: any = await res.json();
        toast.success(`Pedido ${data.order.orderNumber} enviado!`);
        setTimeout(() => router.push('/comanda'), 2000);
      } else {
        const data: any = await res.json().catch(() => ({}));
        toast.error(data.error || 'Erro ao enviar');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao enviar');
    } finally {
      setSendingToKitchen(false);
    }
  };

  const toggleModifier = (modifierId: string) => {
    setSelectedModifiers((prev) =>
      prev.includes(modifierId)
        ? prev.filter((id) => id !== modifierId)
        : [...prev, modifierId]
    );
  };

  // The subtotal of the line being added: each modifier's surcharge applies to EACH unit.
  const getLineSubtotal = (unitPrice: number) =>
    lineTotal(
      unitPrice,
      quantity,
      selectedModifiers.map((modId) => modifiers.find((m) => m.id === modId)?.priceAdjustment || 0)
    );

  const filteredRecipes = recipes.filter((r) =>
    r.name?.toLowerCase().includes(searchTerm.toLowerCase()) && r.available !== false
  );

  // Same rule as the PIX charged for this tab (lib/comanda/line-total.ts), modifiers included.
  const totalPrice =
    visibleItems.reduce(
      (sum: number, item: SessionItem) =>
        sum + lineTotal(item.price, item.quantity, (item.modifiers ?? []).map((m) => m.priceAdjustment)),
      0
    ) || 0;

  const modifiersByCategory = modifiers.reduce((acc, mod) => {
    const category = mod.category || 'Modificadores';
    if (!acc[category]) acc[category] = [];
    acc[category].push(mod);
    return acc;
  }, {} as Record<string, Modifier[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button onClick={() => router.back()} variant="ghost" size="icon">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-3xl font-bold">
            {session?.table?.number || session?.tableNumber
              ? `Mesa ${session?.table?.number || session?.tableNumber}`
              : session?.customerName || 'Balcão'}
          </h1>
        </div>

        {(staleSince || !online) && (
          <div role="status" className="mb-6 rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
            Sem internet: esta é a comanda como estava
            {staleSince ? ` às ${new Date(staleSince).toLocaleTimeString('pt-BR')}` : ' na última atualização'}. O que você
            fizer agora fica guardado neste aparelho e é enviado quando a conexão voltar.
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card className="p-6">
              <h2 className="text-2xl font-bold mb-4">Cardapio</h2>

              <Input
                placeholder="Buscar item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mb-4"
              />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                {filteredRecipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() => {
                      setSelectedRecipe(recipe);
                      setQuantity(1);
                      setSelectedModifiers([]);
                    }}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      selectedRecipe?.id === recipe.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-800 border-gray-200'
                    }`}
                  >
                    <div className="font-bold text-sm line-clamp-2">
                      {recipe.name}
                    </div>
                    <div
                      className={`text-sm font-semibold mt-2 ${
                        selectedRecipe?.id === recipe.id
                          ? 'text-blue-100'
                          : 'text-green-600'
                      }`}
                    >
                      R$ {Number(recipe.price || recipe.sellingPrice || 0).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>

              {selectedRecipe && (
                <div className="border-t pt-6 mt-6">
                  <h3 className="font-bold text-lg mb-4">
                    {selectedRecipe.name}
                  </h3>

                  <div className="flex gap-3 mb-4">
                    <div className="flex-1">
                      <label className="text-sm font-semibold block mb-2">
                        Qtd
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                        className="text-lg"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-sm font-semibold block mb-2">
                        Subtotal
                      </label>
                      <div className="text-2xl font-bold text-green-600">
                        R$ {getLineSubtotal(Number(selectedRecipe.price || selectedRecipe.sellingPrice || 0)).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {modifiers.length > 0 && (
                    <div className="bg-blue-50 p-4 rounded-lg mb-4 border border-blue-200">
                      <h4 className="font-semibold text-sm mb-3">Modificadores</h4>
                      {Object.entries(modifiersByCategory).map(([category, mods]) => (
                        <div key={category} className="mb-3">
                          <p className="text-xs font-semibold text-gray-600 mb-2">{category}</p>
                          <div className="space-y-2">
                            {mods.map((modifier) => (
                              <button
                                key={modifier.id}
                                onClick={() => toggleModifier(modifier.id)}
                                className={`w-full p-2 rounded text-sm text-left transition-all ${
                                  selectedModifiers.includes(modifier.id)
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-800 border border-gray-200'
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <span>{modifier.name}</span>
                                  {modifier.priceAdjustment > 0 && (
                                    <span className="text-xs">+R$ {modifier.priceAdjustment.toFixed(2)}</span>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    onClick={handleAddItem}
                    className="w-full bg-green-600"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Adicionar
                  </Button>
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-4">
              <h2 className="text-2xl font-bold mb-4">Comanda</h2>

              <div className="space-y-3 mb-6 max-h-48 overflow-y-auto">
                {visibleItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex justify-between items-start gap-2 p-3 rounded-lg ${item.pending ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {item.recipe.name}
                        {item.pending && <span className="ml-2 text-xs font-normal text-amber-700">aguardando envio</span>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.quantity}x R$ {Number(item.price).toFixed(2)}
                      </div>
                      {(item.modifiers ?? []).map((m, idx) => (
                        <div key={idx} className="text-xs text-gray-500">
                          + {m.modifier?.name ?? 'Adicional'}
                          {Number(m.priceAdjustment) !== 0 && ` (R$ ${Number(m.priceAdjustment).toFixed(2)} cada)`}
                        </div>
                      ))}
                    </div>
                    {!item.pending && !isClosed && (
                      <Button
                        onClick={() => handleRemoveItem(item.id)}
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total:</span>
                  <span className="text-2xl font-bold text-green-600">
                    R$ {totalPrice.toFixed(2)}
                  </span>
                </div>
              </div>

              <Button
                onClick={handleSendToKitchen}
                disabled={sendingToKitchen || visibleItems.length === 0 || isClosed}
                className="w-full bg-blue-600"
                size="lg"
              >
                <Send className="w-5 h-5 mr-2" />
                {sendingToKitchen ? 'Enviando...' : 'Enviar para Cozinha'}
              </Button>

              <Button
                onClick={() => setShowNfceModal(true)}
                disabled={!session?.items?.length || !!emittedDoc}
                variant="outline"
                className="w-full mt-2 gap-2"
                size="lg"
              >
                <Receipt className="w-5 h-5" />
                {emittedDoc ? 'NFC-e emitida' : 'Emitir NFC-e'}
              </Button>

              <Button
                onClick={() => setShowCloseModal(true)}
                disabled={!session?.items?.length || isClosed}
                className="w-full mt-2 gap-2 bg-green-600"
                size="lg"
              >
                <CheckCircle2 className="w-5 h-5" />
                {session?.status === 'CLOSED' ? 'Conta fechada' : 'Fechar conta'}
              </Button>

              {session?.status === 'CLOSED' && (
                <Button
                  onClick={() => printInHiddenFrame(`/imprimir/cupom/${sessionId}`)}
                  variant="outline"
                  className="w-full mt-2 gap-2"
                  size="lg"
                >
                  <Printer className="w-5 h-5" />
                  Imprimir cupom
                </Button>
              )}

              {emittedDoc && (
                <a
                  href={`/admin/nfe/documents/${emittedDoc.id}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center justify-center w-full mt-2 text-sm text-primary font-semibold gap-1 underline"
                >
                  <FileText className="w-4 h-4" /> Ver NFC-e #{String(emittedDoc.documentNumber).padStart(6, '0')}
                </a>
              )}
            </Card>
          </div>
        </div>

        {/* Close bill modal */}
        {showCloseModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Fechar conta
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Total: <strong>R$ {totalPrice.toFixed(2)}</strong>. A NFC-e é emitida ao fechar, se a emissão automática estiver ligada.
              </p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="close-cpf" className="text-sm font-semibold block mb-1">CPF na nota?</label>
                  <Input
                    id="close-cpf"
                    placeholder="Opcional. Ex: 123.456.789-09"
                    value={closeCpf}
                    onChange={(e) => setCloseCpf(e.target.value)}
                    disabled={closingBill}
                  />
                </div>
                <div>
                  <label htmlFor="close-payment" className="text-sm font-semibold block mb-1">Forma de pagamento</label>
                  <select
                    id="close-payment"
                    className="w-full border rounded-md h-10 px-3 bg-background"
                    value={closePayment}
                    onChange={(e) => setClosePayment(e.target.value)}
                    disabled={closingBill}
                  >
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao de credito">Cartão de crédito</option>
                    <option value="cartao de debito">Cartão de débito</option>
                    <option value="pix">PIX</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4 justify-end">
                <Button variant="outline" onClick={() => setShowCloseModal(false)} disabled={closingBill}>
                  Voltar
                </Button>
                <Button onClick={handleCloseBill} disabled={closingBill} className="bg-green-600">
                  {closingBill ? 'Fechando...' : 'Fechar conta'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* NFC-e Modal */}
        {showNfceModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                <Receipt className="w-5 h-5" /> Emitir NFC-e
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Dados do cliente (opcionais). Informe CPF para nota fiscal "com CPF na nota".
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold block mb-1">CPF do cliente</label>
                  <Input
                    placeholder="Ex: 123.456.789-09"
                    value={nfceCpf}
                    onChange={(e) => setNfceCpf(e.target.value)}
                    disabled={emittingNfce}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1">Nome do cliente</label>
                  <Input
                    placeholder="Opcional"
                    value={nfceName}
                    onChange={(e) => setNfceName(e.target.value)}
                    disabled={emittingNfce}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4 justify-end">
                <Button variant="outline" onClick={() => setShowNfceModal(false)} disabled={emittingNfce}>
                  Fechar
                </Button>
                <Button onClick={handleEmitNFCe} disabled={emittingNfce}>
                  {emittingNfce ? 'Emitindo...' : 'Emitir'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}