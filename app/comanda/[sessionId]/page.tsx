'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, Plus, Send, Receipt, FileText } from 'lucide-react';

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
  quantity: number;
  price: string | number;
  recipe: { name: string };
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
      const res = await fetch('/api/nfe/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderSessionId: sessionId,
          customerCPF: nfceCpf.replace(/\D/g, '') || undefined,
          customerName: nfceName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.rejectionReason || data.error || 'Erro ao emitir NFC-e');
      } else {
        toast.success('NFC-e emitida!');
        setEmittedDoc(data.document);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    } finally {
      setEmittingNfce(false);
    }
  };

  const fetchSession = async () => {
    try {
      const res = await fetch(`/api/comanda/sessions/${sessionId}`);
      if (res.ok) {
        setSession(await res.json());
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
      const res = await fetch(`/api/comanda/sessions/${sessionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId: selectedRecipe.id,
          recipeId: selectedRecipe.recipeId || selectedRecipe.recipe?.id || null,
          quantity: quantity,
          modifierIds: selectedModifiers,
        }),
      });

      if (res.ok) {
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

  const handleRemoveItem = async (itemId: string) => {
    try {
      const res = await fetch(
        `/api/comanda/sessions/${sessionId}/items/${itemId}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        toast.success('Item removido');
        fetchSession();
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao remover item');
    }
  };

  const handleSendToKitchen = async () => {
    if (!session?.items || session.items.length === 0) {
      toast.error('Adicione itens antes de enviar');
      return;
    }

    try {
      setSendingToKitchen(true);
      const res = await fetch(
        `/api/comanda/sessions/${sessionId}/send-to-kitchen`,
        { method: 'POST' }
      );

      if (res.ok) {
        const data: any = await res.json();
        toast.success(`Pedido ${data.order.orderNumber} enviado!`);
        setTimeout(() => router.push('/comanda'), 2000);
      } else {
        toast.error('Erro ao enviar');
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

  const getModifierPrice = () => {
    return selectedModifiers.reduce((sum, modId) => {
      const mod = modifiers.find((m) => m.id === modId);
      return sum + (mod?.priceAdjustment || 0);
    }, 0);
  };

  const filteredRecipes = recipes.filter((r) =>
    r.name?.toLowerCase().includes(searchTerm.toLowerCase()) && r.available !== false
  );

  const totalPrice =
    session?.items?.reduce(
      (sum: number, item: SessionItem) =>
        sum + Number(item.price) * item.quantity,
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
            Mesa {session?.table?.number || session?.customerName}
          </h1>
        </div>

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
                        R$ {(Number(selectedRecipe.price || selectedRecipe.sellingPrice || 0) * quantity + getModifierPrice()).toFixed(2)}
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
                {session?.items?.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-start gap-2 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {item.recipe.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.quantity}x R$ {Number(item.price).toFixed(2)}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleRemoveItem(item.id)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
                disabled={sendingToKitchen || !session?.items?.length}
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