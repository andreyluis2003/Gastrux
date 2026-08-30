'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BackButton } from '@/components/ui/back-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { formatDate } from '@/lib/formatters';
import { ArrowLeft, Trash2, Edit2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface ProductionItem {
  id: string;
  quantity: number;
  estimatedCost: number;
  recipe: {
    id: string;
    name: string;
    code: string;
  };
}

interface ProductionPlan {
  id: string;
  planDate: string;
  status: string;
  notes?: string;
  items: ProductionItem[];
  createdAt: string;
}

export default function ProductionPlanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const planId = params.id as string;
  
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [saving, setSaving] = useState(false);

  // Add item dialog
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [availableRecipes, setAvailableRecipes] = useState<any[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [addingItem, setAddingItem] = useState(false);

  // Edit item dialog
  const [showEditItemDialog, setShowEditItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductionItem | null>(null);
  const [editItemQuantity, setEditItemQuantity] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  useEffect(() => {
    fetchPlan();
  }, [planId]);

  const fetchPlan = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/production-plans/${planId}`);
      if (!res.ok) throw new Error('Plano não encontrado');
      const data = await res.json();
      setPlan(data);
    } catch (error) {
      toast.error('Erro ao carregar plano de produção');
      router.push('/planejamento');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja deletar este plano de produção?')) return;
    
    try {
      setDeleting(true);
      const res = await fetch(`/api/production-plans/${planId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Erro ao deletar');
      toast.success('Plano deletado com sucesso');
      router.push('/planejamento');
    } catch (error) {
      toast.error('Erro ao deletar plano');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenEditDialog = () => {
    if (plan) {
      setEditNotes(plan.notes || '');
      setEditStatus(plan.status || 'DRAFT');
      setShowEditDialog(true);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/production-plans/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editNotes, status: editStatus }),
      });
      if (!res.ok) throw new Error('Erro ao salvar');
      const updated = await res.json();
      setPlan(updated);
      setShowEditDialog(false);
      toast.success('Plano atualizado com sucesso');
    } catch (error) {
      toast.error('Erro ao atualizar plano');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddItemDialog = async () => {
    try {
      const res = await fetch('/api/recipes');
      if (!res.ok) throw new Error('Erro ao carregar receitas');
      const recipes = await res.json();
      setAvailableRecipes(recipes);
      setShowAddItemDialog(true);
    } catch (error) {
      toast.error('Erro ao carregar receitas');
    }
  };

  const handleAddItem = async () => {
    if (!selectedRecipe || !itemQuantity) {
      toast.error('Selecione uma receita e quantidade');
      return;
    }

    setAddingItem(true);
    try {
      const res = await fetch(`/api/production-plans/${planId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: selectedRecipe,
          quantity: parseFloat(itemQuantity),
        }),
      });
      if (!res.ok) throw new Error('Erro ao adicionar item');
      await fetchPlan();
      setShowAddItemDialog(false);
      setSelectedRecipe('');
      setItemQuantity('1');
      toast.success('Item adicionado ao plano');
    } catch (error) {
      toast.error('Erro ao adicionar item');
    } finally {
      setAddingItem(false);
    }
  };

  const handleOpenEditItemDialog = (item: ProductionItem) => {
    setEditingItem(item);
    setEditItemQuantity(String(item.quantity));
    setShowEditItemDialog(true);
  };

  const handleSaveEditItem = async () => {
    if (!editingItem) return;
    setSavingItem(true);
    try {
      const res = await fetch(`/api/production-plans/${planId}/items/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: parseFloat(editItemQuantity) }),
      });
      if (!res.ok) throw new Error('Erro ao editar item');
      await fetchPlan();
      setShowEditItemDialog(false);
      setEditingItem(null);
      toast.success('Item atualizado com sucesso');
    } catch (error) {
      toast.error('Erro ao atualizar item');
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Tem certeza que deseja remover este item do plano?')) return;
    setDeletingItemId(itemId);
    try {
      const res = await fetch(`/api/production-plans/${planId}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Erro ao deletar item');
      await fetchPlan();
      toast.success('Item removido do plano');
    } catch (error) {
      toast.error('Erro ao remover item');
    } finally {
      setDeletingItemId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Breadcrumb items={[
          { label: 'Planejamento', href: '/planejamento' },
          { label: 'Carregando...' }
        ]} />
        <LoadingSkeleton variant="card" height="h-40" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" height="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Breadcrumb items={[
          { label: 'Planejamento', href: '/planejamento' },
          { label: 'Não encontrado' }
        ]} />
        <BackButton href="/planejamento" />
        <Card className="p-6 text-center">
          <p className="text-slate-600">Plano de produção não encontrado</p>
        </Card>
      </div>
    );
  }

  const totalCost = plan.items.reduce((sum, item) => sum + item.estimatedCost, 0);

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <Breadcrumb items={[
        { label: 'Planejamento', href: '/planejamento' },
        { label: `Plano de ${formatDate(new Date(plan.planDate))}` }
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <BackButton href="/planejamento" label="Voltar" />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Plano de Produção</h1>
            <p className="text-slate-600">{formatDate(new Date(plan.planDate))}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleOpenAddItemDialog}
          >
            <Plus className="h-4 w-4 mr-2" />
            Inserir Item
          </Button>
          <Button
            variant="outline"
            onClick={handleOpenEditDialog}
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleting ? 'Deletando...' : 'Deletar'}
          </Button>
        </div>
      </div>

      {/* Plan Information */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-600 font-medium">Data do Plano</p>
            <p className="text-lg font-semibold">{formatDate(new Date(plan.planDate))}</p>
          </div>
          {plan.notes && (
            <div>
              <p className="text-sm text-slate-600 font-medium">Notas</p>
              <p className="text-base">{plan.notes}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Items */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Itens da Produção</h2>
        {plan.items.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-slate-600">Nenhum item neste plano</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {plan.items.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{item.recipe.name}</h3>
                    <p className="text-sm text-slate-600">{item.recipe.code}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditItemDialog(item)}
                      className="h-8 w-8 p-0"
                      title="Editar item"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={deletingItemId === item.id}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Remover item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Quantidade:</span>
                    <span className="font-medium">{item.quantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Custo estimado:</span>
                    <span className="font-medium">R$ {item.estimatedCost.toFixed(2)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <Card className="p-6 bg-slate-50 dark:bg-slate-900/50">
        <div className="space-y-2">
          <div className="flex justify-between text-lg">
            <span className="font-semibold">Custo Total:</span>
            <span className="font-bold text-emerald-600">R$ {totalCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-600">
            <span>Total de itens:</span>
            <span>{plan.items.length}</span>
          </div>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Plano de Produção</DialogTitle>
            <DialogDescription>Atualize as informações do plano</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Rascunho</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmado</SelectItem>
                  <SelectItem value="PRODUCTION">Em Produção</SelectItem>
                  <SelectItem value="COMPLETED">Concluído</SelectItem>
                  <SelectItem value="CANCELLED">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Observações</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notas sobre o plano..."
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={saving} loading={saving}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={showEditItemDialog} onOpenChange={setShowEditItemDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Item</DialogTitle>
            <DialogDescription>
              {editingItem ? `Alterar quantidade de "${editingItem.recipe.name}"` : 'Editar item do plano'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-item-quantity">Quantidade *</Label>
              <Input
                id="edit-item-quantity"
                type="number"
                value={editItemQuantity}
                onChange={(e) => setEditItemQuantity(e.target.value)}
                step="1"
                min="1"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowEditItemDialog(false)} disabled={savingItem}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEditItem} disabled={savingItem} loading={savingItem}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inserir Item no Plano</DialogTitle>
            <DialogDescription>Selecione uma receita para adicionar ao plano de produção</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-recipe">Receita *</Label>
              <Select value={selectedRecipe} onValueChange={setSelectedRecipe}>
                <SelectTrigger id="add-recipe">
                  <SelectValue placeholder="Selecione uma receita..." />
                </SelectTrigger>
                <SelectContent>
                  {availableRecipes.map((recipe) => (
                    <SelectItem key={recipe.id} value={recipe.id}>
                      {recipe.name} ({recipe.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-quantity">Quantidade *</Label>
              <Input
                id="add-quantity"
                type="number"
                placeholder="1"
                value={itemQuantity}
                onChange={(e) => setItemQuantity(e.target.value)}
                step="1"
                min="1"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowAddItemDialog(false)} disabled={addingItem}>
                Cancelar
              </Button>
              <Button onClick={handleAddItem} disabled={addingItem} loading={addingItem}>
                Inserir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
