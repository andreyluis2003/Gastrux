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
import { Plus, Trash2, Edit2, Eye, EyeOff, ChefHat, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

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
  available: boolean;
  active: boolean;
  displayOnQR: boolean;
  categoryId: string;
  images: { id: string; imageUrl: string }[];
}

interface Recipe {
  id: string;
  name: string;
  sellingPrice?: string | number | null;
}

export default function AdminCardapioPage() {
  const { status } = useSession();
  const router = useRouter();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', emoji: '', description: '' });
  const [showNewItem, setShowNewItem] = useState<string | null>(null); // categoryId when open
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    price: '',
    recipeId: '',
  });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  useEffect(() => {
    Promise.all([fetchCategories(), fetchRecipes()]);
  }, []);

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
        setRecipes(list);
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

  const handleCreateItem = async (categoryId: string) => {
    if (!newItem.name.trim() || !newItem.price) {
      toast.error('Nome e preço obrigatórios');
      return;
    }
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
          position: 0,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Item criado');
      setNewItem({ name: '', description: '', price: '', recipeId: '' });
      setShowNewItem(null);
      fetchCategories();
    } catch (err) {
      toast.error('Erro ao criar item');
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
          categoryId: editingItem.categoryId,
        }),
      });
      if (!res.ok) throw new Error('Failed');
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

  const handleToggleAvailable = async (item: MenuItem) => {
    try {
      const res = await fetch(`/api/cardapio/itens/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: !item.available }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(item.available ? 'Item desativado' : 'Item ativado');
      fetchCategories();
    } catch (err) {
      toast.error('Erro ao alterar status');
    }
  };

  if (status === 'loading' || loading) {
    return <div className="p-8 text-center">Carregando...</div>;
  }

  const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
              <ChefHat className="w-7 h-7 text-amber-600" />
              Cardápio Digital
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {categories.length} categorias • {totalItems} itens
          </p>
        </div>
        <div className="flex gap-2">
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
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  {cat.emoji && <span>{cat.emoji}</span>}
                  {cat.name}
                  <span className="text-sm font-normal text-gray-500">
                    ({cat.items.length})
                  </span>
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNewItem(showNewItem === cat.id ? null : cat.id)}
                  className="gap-2"
                >
                  <Plus className="w-3 h-3" /> Item
                </Button>
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
                      placeholder="Preço (R$) *"
                      value={newItem.price}
                      onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                    />
                  </div>
                  <Input
                    placeholder="Descrição (opcional)"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  />
                  <div>
                    <Label className="text-xs">Vincular à receita (obrigatório para pedidos QR)</Label>
                    <select
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded bg-white text-sm"
                      value={newItem.recipeId}
                      onChange={(e) => setNewItem({ ...newItem, recipeId: e.target.value })}
                    >
                      <option value="">Nenhuma (não poderá ser pedido via QR)</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleCreateItem(cat.id)}>
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
                      className={`flex items-center gap-3 p-2 rounded-lg border ${
                        item.available ? 'bg-white' : 'bg-gray-50 opacity-60'
                      }`}
                    >
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
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500 truncate">{item.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <span className="font-bold text-amber-700">
                            R$ {Number(item.price).toFixed(2)}
                          </span>
                          {!item.recipeId && (
                            <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                              Sem receita
                            </span>
                          )}
                          {!item.displayOnQR && (
                            <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              Oculto no QR
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleAvailable(item)}
                          className="h-8 w-8 p-0"
                          title={item.available ? 'Desativar' : 'Ativar'}
                        >
                          {item.available ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
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
            <div>
              <Label>Descrição</Label>
              <Input
                value={editingItem.description || ''}
                onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Preço (R$) *</Label>
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
              <Label>Vincular à receita</Label>
              <select
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded bg-white"
                value={editingItem.recipeId || ''}
                onChange={(e) => setEditingItem({ ...editingItem, recipeId: e.target.value || null })}
              >
                <option value="">Nenhuma</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingItem.available}
                  onChange={(e) => setEditingItem({ ...editingItem, available: e.target.checked })}
                />
                Disponível
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingItem.displayOnQR}
                  onChange={(e) => setEditingItem({ ...editingItem, displayOnQR: e.target.checked })}
                />
                Mostrar no QR
              </label>
            </div>
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
    </div>
  );
}
