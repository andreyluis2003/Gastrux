// FASE 50: Admin page for managing digital menu (categories + items)
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { brl } from '@/components/caixa/money';
import { isProductRecipe } from '@/lib/cardapio/is-product-recipe';
import { ImportFromLink } from '@/components/cardapio/import-from-link';
import { BulkBar } from '@/components/cardapio/bulk-bar';
import { DayPicker } from '@/components/cardapio/day-picker';
import { daysLabel } from '@/lib/cardapio/days';
import { Plus, Trash2, Edit2, ChefHat, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { RecipeCostPanel } from '@/components/cardapio/recipe-cost-panel';
import Image from 'next/image';
import { ProductPhotoField } from '@/components/cardapio/product-photo-field';

interface MenuCategory {
  id: string;
  name: string;
  description?: string | null;
  emoji?: string | null;
  position: number;
  active: boolean;
  items: MenuItem[];
}

interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: string | number;
  recipeId?: string | null;
  /** Product code for the Gastrux order API (plan 2026-10-23 api-de-pedidos) */
  code?: string | null;
  available: boolean;
  active: boolean;
  displayOnQR: boolean;
  /** Sold by weight: the price is per kg (spec 2026-10-25 venda-por-peso) */
  soldByWeight?: boolean;
  /** Weekdays shown to customers, 0 = Sunday; empty = every day (spec 2026-11-06 cardapio-rapido) */
  availableDays?: number[];
  categoryId: string;
  images: { id: string; imageUrl: string }[];
}

interface Recipe {
  code: string;
  ingredients?: unknown[];
  id: string;
  name: string;
  sellingPrice?: string | number | null;
}

export default function AdminCardapioPage() {
  const { status } = useSession();
  const router = useRouter();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  // Cardápio rápido (spec 2026-11-06): ticked items, the price being typed on the list, a bulk call running
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priceEdit, setPriceEdit] = useState<{ id: string; value: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', emoji: '', description: '' });
  // Rename / delete a category (owner request 2026-11-14)
  const [renaming, setRenaming] = useState<{ id: string; name: string; emoji: string } | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [showNewItem, setShowNewItem] = useState<string | null>(null); // categoryId when open
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [photosEnabled, setPhotosEnabled] = useState<boolean | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<Blob | null>(null);
  const [photoFieldKey, setPhotoFieldKey] = useState(0);
  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    price: '',
    recipeId: '',
    code: '',
    soldByWeight: false,
  });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  useEffect(() => {
    Promise.all([fetchCategories(), fetchRecipes()]);
  }, []);

  useEffect(() => {
    fetch('/api/cardapio/fotos')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setPhotosEnabled(!!d.enabled))
      .catch(() => setPhotosEnabled(false));
  }, []);

  // Closing or switching the new-item form drops any picked photo.
  useEffect(() => {
    setPendingPhoto(null);
    setPhotoBusy(false);
    setPhotoFieldKey((k) => k + 1);
  }, [showNewItem]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/cardapio/categorias');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar categorias');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipes = async () => {
    try {
      const res = await fetch('/api/recipes');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.recipes || [];
        // Fichas simples (made for an item sold without a ficha técnica) are not offered to link other items
        setRecipes(list.filter((r: Recipe) => !isProductRecipe(r)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      toast.error('Nome obrigatório');
      return;
    }
    try {
      const res = await fetch('/api/cardapio/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategory.name,
          description: newCategory.description || null,
          emoji: newCategory.emoji || null,
          position: categories.length,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Categoria criada');
      setNewCategory({ name: '', emoji: '', description: '' });
      setShowNewCategory(false);
      fetchCategories();
    } catch (err) {
      toast.error('Erro ao criar categoria');
    }
  };

  const handleRenameCategory = async () => {
    if (!renaming || categoryBusy) return;
    if (!renaming.name.trim()) {
      toast.error('Informe o nome da categoria');
      return;
    }
    setCategoryBusy(true);
    try {
      const res = await fetch(`/api/cardapio/categorias/${renaming.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renaming.name, emoji: renaming.emoji }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Erro ao renomear a categoria');
        return;
      }
      toast.success('Categoria renomeada');
      setRenaming(null);
      fetchCategories();
    } catch {
      toast.error('Erro ao renomear a categoria');
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (categoryBusy) return;
    setCategoryBusy(true);
    try {
      const res = await fetch(`/api/cardapio/categorias/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Erro ao apagar a categoria');
        return;
      }
      toast.success('Categoria apagada');
      setDeletingCategory(null);
      fetchCategories();
    } catch {
      toast.error('Erro ao apagar a categoria');
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleCreateItem = async (categoryId: string) => {
    if (creating || photoBusy) return;
    if (!newItem.name.trim() || !newItem.price) {
      toast.error('Nome e preço obrigatórios');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/cardapio/itens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          name: newItem.name,
          description: newItem.description || null,
          price: newItem.price,
          recipeId: newItem.recipeId || null,
          code: newItem.code || null,
          soldByWeight: newItem.soldByWeight,
          position: 0,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Erro ao criar item');
        return;
      }
      const created = await res.json().catch(() => null);
      if (pendingPhoto && created?.id) {
        try {
          const fd = new FormData();
          fd.append('foto', pendingPhoto, 'foto.jpg');
          const up = await fetch(`/api/cardapio/itens/${created.id}/foto`, { method: 'POST', body: fd });
          if (!up.ok) throw new Error('upload failed');
          toast.success('Item criado');
        } catch {
          toast.error('Item criado, mas a foto não foi salva. Abra o item e tente de novo.');
        }
      } else {
        toast.success('Item criado');
      }
      setPendingPhoto(null);
      setPhotoFieldKey((k) => k + 1);
      setNewItem({ name: '', description: '', price: '', recipeId: '', code: '', soldByWeight: false });
      setShowNewItem(null);
      fetchCategories();
    } catch (err) {
      toast.error('Erro ao criar item');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    try {
      const res = await fetch(`/api/cardapio/itens/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingItem.name,
          description: editingItem.description,
          price: editingItem.price,
          recipeId: editingItem.recipeId,
          available: editingItem.available,
          displayOnQR: editingItem.displayOnQR,
          soldByWeight: !!editingItem.soldByWeight,
          categoryId: editingItem.categoryId,
          code: editingItem.code || null,
          availableDays: editingItem.availableDays ?? [],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Erro ao salvar item');
        return;
      }
      toast.success('Item atualizado');
      setEditingItem(null);
      fetchCategories();
    } catch (err) {
      toast.error('Erro ao atualizar');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Remover este item do cardápio?')) return;
    try {
      const res = await fetch(`/api/cardapio/itens/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Item removido');
      fetchCategories();
    } catch (err) {
      toast.error('Erro ao remover');
    }
  };

  /** One POST /api/cardapio/itens/lote; true when it worked */
  const runBulk = async (ids: string[], body: Record<string, unknown>, okMessage?: string) => {
    setBulkBusy(true);
    try {
      const res = await fetch('/api/cardapio/itens/lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, ...body }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || 'Não foi possível salvar'); return false; }
      toast.success(okMessage ?? (ids.length === 1 ? 'Item atualizado' : `${ids.length} itens atualizados`));
      await fetchCategories();
      return true;
    } catch {
      toast.error('Não foi possível salvar');
      return false;
    } finally {
      setBulkBusy(false);
    }
  };

  const handleToggleAvailable = (item: MenuItem) =>
    runBulk([item.id], { acao: item.available ? 'esgotar' : 'voltar' }, item.available ? `${item.name}: esgotado` : `${item.name}: voltou a vender`);

  /** "34,90", "1.234,50" or "34.90" */
  const parsePrice = (s: string) => Number((s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s).replace(/[^\d.]/g, ''));

  const savePrice = async () => {
    if (!priceEdit) return;
    const item = categories.flatMap((c) => c.items).find((i) => i.id === priceEdit.id);
    const value = parsePrice(priceEdit.value);
    if (!item || Math.round(value * 100) === Math.round(Number(item.price) * 100)) { setPriceEdit(null); return; }
    if (!Number.isFinite(value) || value < 0.01) { toast.error('Preço inválido'); return; }
    if (await runBulk([item.id], { acao: 'preco', preco: value }, `${item.name}: preço salvo`)) setPriceEdit(null);
  };

  const toggleSelected = (ids: string[], on: boolean) =>
    setSelected((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });

  if (status === 'loading' || loading) {
    return <div className="p-8 text-center">Carregando...</div>;
  }

  const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <div className={`p-4 sm:p-6 space-y-6 ${selected.size ? 'pb-40' : ''}`}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
              <ChefHat className="w-7 h-7 text-amber-600" />
              Cardápio digital
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {categories.length} categorias • {totalItems} itens
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportFromLink onImported={fetchCategories} />
          <Button variant="outline" asChild>
            <Link href="/admin/tables" className="gap-2">
              <ImageIcon className="w-4 h-4" /> Ver QR Codes
            </Link>
          </Button>
          <Button onClick={() => setShowNewCategory(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Nova Categoria
          </Button>
        </div>
      </div>

      {/* New category form */}
      {showNewCategory && (
        <Card className="p-4 space-y-3">
          <h2 className="font-bold">Nova Categoria</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Emoji (opcional)</Label>
              <Input
                placeholder="🍔"
                value={newCategory.emoji}
                onChange={(e) => setNewCategory({ ...newCategory, emoji: e.target.value })}
                maxLength={2}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Nome *</Label>
              <Input
                placeholder="Ex: Pratos Principais"
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input
              placeholder="Descrição curta"
              value={newCategory.description}
              onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreateCategory}>Criar</Button>
            <Button variant="outline" onClick={() => setShowNewCategory(false)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {/* Categories list */}
      {categories.length === 0 ? (
        <Card className="p-10 text-center text-gray-500">
          <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="mb-3">Nenhuma categoria criada ainda</p>
          <Button onClick={() => setShowNewCategory(true)}>
            <Plus className="w-4 h-4 mr-2" /> Criar primeira categoria
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => (
            <Card key={cat.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  {cat.items.length > 0 && (
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      aria-label={`Marcar ${cat.name}`}
                      checked={cat.items.every((i) => selected.has(i.id))}
                      onChange={(e) => toggleSelected(cat.items.map((i) => i.id), e.target.checked)}
                    />
                  )}
                  {renaming?.id === cat.id ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <Input
                        className="h-8 w-[4.5rem]"
                        placeholder="Emoji"
                        aria-label="Emoji da categoria"
                        value={renaming.emoji}
                        maxLength={8}
                        onChange={(e) => setRenaming({ ...renaming, emoji: e.target.value })}
                      />
                      <Input
                        autoFocus
                        className="h-8 w-48"
                        aria-label="Nome da categoria"
                        value={renaming.name}
                        maxLength={60}
                        onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameCategory();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                      <Button size="sm" disabled={categoryBusy} onClick={handleRenameCategory}>Salvar</Button>
                      <Button size="sm" variant="ghost" disabled={categoryBusy} onClick={() => setRenaming(null)}>Cancelar</Button>
                    </span>
                  ) : (
                    <>
                      {cat.emoji && <span>{cat.emoji}</span>}
                      {cat.name}
                      <span className="text-sm font-normal text-gray-500">
                        ({cat.items.length})
                      </span>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-gray-700"
                        title="Renomear categoria"
                        aria-label={`Renomear ${cat.name}`}
                        onClick={() => { setDeletingCategory(null); setRenaming({ id: cat.id, name: cat.name, emoji: cat.emoji ?? '' }); }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {cat.items.length === 0 && (
                        <button
                          type="button"
                          className="text-gray-400 hover:text-red-600"
                          title="Apagar categoria vazia"
                          aria-label={`Apagar ${cat.name}`}
                          onClick={() => setDeletingCategory(cat.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </h3>
                {deletingCategory === cat.id && (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-md bg-red-50 p-2 text-sm text-red-800">
                    Apagar a categoria &quot;{cat.name}&quot;?
                    <Button size="sm" variant="destructive" disabled={categoryBusy} onClick={() => handleDeleteCategory(cat.id)}>Apagar</Button>
                    <Button size="sm" variant="ghost" disabled={categoryBusy} onClick={() => setDeletingCategory(null)}>Cancelar</Button>
                  </div>
                )}
                <div className="flex gap-2">
                  {cat.items.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={bulkBusy}
                      onClick={() => {
                        const allOut = cat.items.every((i) => !i.available);
                        runBulk(cat.items.map((i) => i.id), { acao: allOut ? 'voltar' : 'esgotar' }, allOut ? `${cat.name}: voltou a vender` : `${cat.name}: esgotada`);
                      }}
                    >
                      {cat.items.every((i) => !i.available) ? 'Voltar todos' : 'Esgotar todos'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowNewItem(showNewItem === cat.id ? null : cat.id)}
                    className="gap-2"
                  >
                    <Plus className="w-3 h-3" /> Item
                  </Button>
                </div>
              </div>

              {/* New item form */}
              {showNewItem === cat.id && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Nome do item *"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={newItem.soldByWeight ? 'Preço por kg (R$) *' : 'Preço (R$) *'}
                      value={newItem.price}
                      onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newItem.soldByWeight}
                      onChange={(e) => setNewItem({ ...newItem, soldByWeight: e.target.checked })}
                    />
                    Vendido por peso (preço por kg; o caixa digita o peso)
                  </label>
                  <Input
                    placeholder="Descrição (opcional)"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  />
                  <Input
                    placeholder="Código do produto (opcional, para a API de pedidos)"
                    value={newItem.code}
                    maxLength={40}
                    onChange={(e) => setNewItem({ ...newItem, code: e.target.value })}
                  />
                  <div>
                    <Label className="text-xs">Ficha técnica (opcional)</Label>
                    <select
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded bg-white text-sm"
                      value={newItem.recipeId}
                      onChange={(e) => setNewItem({ ...newItem, recipeId: e.target.value })}
                    >
                      <option value="">Sem ficha técnica: vende normalmente, sem baixa de estoque</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <RecipeCostPanel recipeId={newItem.recipeId} price={newItem.price} />
                  </div>
                  <ProductPhotoField
                    key={photoFieldKey}
                    enabled={photosEnabled}
                    imageUrl={null}
                    onPick={setPendingPhoto}
                    onBusyChange={setPhotoBusy}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={creating || photoBusy} onClick={() => handleCreateItem(cat.id)}>
                      Criar Item
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowNewItem(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {/* Items */}
              {cat.items.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">Nenhum item nesta categoria</p>
              ) : (
                <div className="space-y-2">
                  {cat.items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 p-2 rounded-lg border ${
                        item.available ? 'bg-white' : 'bg-gray-50'
                      } ${selected.has(item.id) ? 'ring-2 ring-primary/40' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        aria-label={`Marcar ${item.name}`}
                        checked={selected.has(item.id)}
                        onChange={(e) => toggleSelected([item.id], e.target.checked)}
                      />
                      {item.images?.[0]?.imageUrl ? (
                        <div className="relative w-12 h-12 shrink-0 rounded overflow-hidden bg-gray-100">
                          <Image
                            src={item.images[0].imageUrl}
                            alt={item.name}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 shrink-0 rounded bg-gray-100 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-gray-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-[9rem]">
                        <p className="font-semibold text-sm line-clamp-2">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500 truncate">{item.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          {priceEdit?.id === item.id ? (
                            <input
                              autoFocus
                              inputMode="decimal"
                              aria-label={`Preço de ${item.name}`}
                              className="h-7 w-24 rounded border px-2 text-sm"
                              value={priceEdit.value}
                              disabled={bulkBusy}
                              onChange={(e) => setPriceEdit({ id: item.id, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') savePrice(); if (e.key === 'Escape') setPriceEdit(null); }}
                              onBlur={savePrice}
                            />
                          ) : (
                            <button
                              type="button"
                              title="Tocar para mudar o preço"
                              className="font-bold text-amber-700 underline decoration-dotted underline-offset-2"
                              onClick={() => setPriceEdit({ id: item.id, value: Number(item.price).toFixed(2).replace('.', ',') })}
                            >
                              {brl(Math.round(Number(item.price) * 100))}{item.soldByWeight ? '/kg' : ''}
                            </button>
                          )}
                          {!item.available && (
                            <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Esgotado</span>
                          )}
                          {daysLabel(item.availableDays) && (
                            <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{daysLabel(item.availableDays)}</span>
                          )}
                          {!item.displayOnQR && (
                            <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              Oculto no QR
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-auto flex gap-1">
                        <Button
                          size="sm"
                          variant={item.available ? 'ghost' : 'outline'}
                          disabled={bulkBusy}
                          onClick={() => handleToggleAvailable(item)}
                          className="h-8 px-2 text-xs"
                          title={item.available ? 'Tira o item de todos os canais até voltar' : 'Volta a aparecer em todos os canais'}
                        >
                          {item.available ? 'Esgotar' : 'Voltar a vender'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingItem(item)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteItem(item.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Edit item dialog */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold">Editar Item</h2>
            <div>
              <Label>Nome *</Label>
              <Input
                value={editingItem.name}
                onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
              />
            </div>
            <ProductPhotoField
              enabled={photosEnabled}
              imageUrl={editingItem.images?.[0]?.imageUrl ?? null}
              menuItemId={editingItem.id}
              onChange={(url) => {
                setEditingItem((prev) =>
                  prev ? { ...prev, images: url ? [{ id: prev.images?.[0]?.id ?? 'new', imageUrl: url }] : [] } : prev
                );
                fetchCategories();
              }}
            />
            <div>
              <Label>Descrição</Label>
              <Input
                value={editingItem.description || ''}
                onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Código do produto (opcional)</Label>
              <Input
                value={editingItem.code || ''}
                maxLength={40}
                placeholder="Ex.: ESP-ALC. Outros sistemas mandam este código na API de pedidos"
                onChange={(e) => setEditingItem({ ...editingItem, code: e.target.value })}
              />
            </div>
            <div>
              <Label>{editingItem.soldByWeight ? 'Preço por kg (R$) *' : 'Preço (R$) *'}</Label>
              <Input
                type="number"
                step="0.01"
                value={String(editingItem.price)}
                onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })}
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <select
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded bg-white"
                value={editingItem.categoryId}
                onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Ficha técnica</Label>
              <select
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded bg-white"
                value={editingItem.recipeId || ''}
                onChange={(e) => setEditingItem({ ...editingItem, recipeId: e.target.value || null })}
              >
                <option value="">Sem ficha técnica: vende normalmente, sem baixa de estoque</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <RecipeCostPanel recipeId={editingItem.recipeId} price={editingItem.price} />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingItem.available}
                  onChange={(e) => setEditingItem({ ...editingItem, available: e.target.checked })}
                />
                À venda
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingItem.displayOnQR}
                  onChange={(e) => setEditingItem({ ...editingItem, displayOnQR: e.target.checked })}
                />
                Mostrar no QR
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!editingItem.soldByWeight}
                  onChange={(e) => setEditingItem({ ...editingItem, soldByWeight: e.target.checked })}
                />
                Vendido por peso
              </label>
            </div>
            <div>
              <Label>Dias em que aparece para o cliente</Label>
              <div className="mt-1">
                <DayPicker value={editingItem.availableDays ?? []} onChange={(d) => setEditingItem({ ...editingItem, availableDays: d })} />
              </div>
              <p className="mt-1 text-xs text-gray-500">Fora desses dias o item some do QR Code, do site e do WhatsApp. No Vender continua aparecendo.</p>
            </div>
            {editingItem.soldByWeight && (
              <p className="text-xs text-gray-500">
                O preço é por kg e a ficha técnica descreve 1 kg. No caixa, digite o peso (ex.: 0,350). Não aparece no QR, no site de delivery nem no WhatsApp: o cliente não tem como pesar.
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleUpdateItem} className="flex-1">
                Salvar
              </Button>
              <Button variant="outline" onClick={() => setEditingItem(null)} className="flex-1">
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          busy={bulkBusy}
          run={async (body) => { const ok = await runBulk([...selected], body); if (ok) setSelected(new Set()); return ok; }}
          clear={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
