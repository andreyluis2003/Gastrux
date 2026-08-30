'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { FadeIn } from '@/components/ui/animate';
import { GlassCard } from '@/components/ui/glass-card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatBRL, formatDate } from '@/lib/formatters';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Edit2,
  Plus,
  Trash2,
  Package,
  ShoppingCart,
  Truck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface ShoppingListItem {
  id: string;
  ingredientId: string;
  quantity: number;
  unit: string;
  estimatedCost: number;
  actualCost: number | null;
  priority: string;
  checked: boolean;
  notes: string | null;
  supplier: {
    id: string;
    supplierName: string;
    unitPrice: number;
    ingredient: {
      id: string;
      name: string;
      code: string;
      standardUnit: string;
      category?: {
        name: string;
        color: string;
      };
      currentStock?: {
        currentQuantity: number;
      };
    };
  };
}

interface ShoppingList {
  id: string;
  listDate: string;
  status: string;
  totalCost: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: ShoppingListItem[];
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Circle },
  ORDERED: { label: 'Pedido Feito', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Truck },
  RECEIVED: { label: 'Recebido', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  PARTIAL: { label: 'Parcial', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: Package },
  CANCELLED: { label: 'Cancelado', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: 'Crítico', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  HIGH: { label: 'Alta', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  MEDIUM: { label: 'Média', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  LOW: { label: 'Baixa', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

export default function ShoppingListDetailPage() {
  const { data: session } = useSession() || {};
  const params = useParams();
  const router = useRouter();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddItemsDialog, setShowAddItemsDialog] = useState(false);
  const [availableIngredients, setAvailableIngredients] = useState<any[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<string>('');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemPriority, setItemPriority] = useState('MEDIUM');
  const [addingItems, setAddingItems] = useState(false);
  const [addItemMode, setAddItemMode] = useState<'select' | 'new'>('select');
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('un');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemPriority, setNewItemPriority] = useState('MEDIUM');

  const user = session?.user as any;
  const canEdit = user?.role !== 'COOK';

  useEffect(() => {
    fetchList();
  }, [params.id]);

  async function fetchList() {
    try {
      const res = await fetch(`/api/shopping-lists/${params.id}`);
      if (!res.ok) throw new Error('Lista não encontrada');
      const data = await res.json();
      setList(data);
    } catch (error) {
      toast.error('Erro ao carregar lista de compras');
      router.push('/compras');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleItem(itemId: string, checked: boolean) {
    try {
      const res = await fetch(`/api/shopping-lists/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, checked: !checked }),
      });
      if (!res.ok) throw new Error('Erro ao atualizar');
      setList((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === itemId ? { ...item, checked: !checked } : item
              ),
            }
          : null
      );
    } catch (error) {
      toast.error('Erro ao marcar item');
    }
  }

  async function handleUpdateStatus(newStatus: string) {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/shopping-lists/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, notes: list?.notes }),
      });
      if (!res.ok) throw new Error('Erro ao atualizar status');
      const data = await res.json();
      setList(data);
      toast.success(`Status atualizado para ${statusConfig[newStatus]?.label || newStatus}`);
    } catch (error) {
      toast.error('Erro ao atualizar status');
    } finally {
      setUpdatingStatus(false);
    }
  }

  function handleOpenEditDialog() {
    setEditNotes(list?.notes || '');
    setShowEditDialog(true);
  }

  async function handleSaveEdit() {
    if (!list) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/shopping-lists/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: list.status, notes: editNotes }),
      });
      if (!res.ok) throw new Error('Erro ao atualizar');
      const data = await res.json();
      setList(data);
      setShowEditDialog(false);
      toast.success('Lista atualizada com sucesso');
    } catch (error) {
      toast.error('Erro ao atualizar lista');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/shopping-lists/${params.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Erro ao deletar');
      toast.success('Lista de compras deletada com sucesso');
      router.push('/compras');
    } catch (error) {
      toast.error('Erro ao deletar lista de compras');
      setDeleting(false);
    }
  }

  async function handleOpenAddItemsDialog() {
    try {
      const res = await fetch('/api/ingredients');
      if (!res.ok) throw new Error('Erro ao carregar ingredientes');
      const data = await res.json();
      setAvailableIngredients(data);
      setShowAddItemsDialog(true);
    } catch (error) {
      toast.error('Erro ao carregar ingredientes disponíveis');
    }
  }

  async function handleAddItem() {
    setAddingItems(true);
    try {
      if (addItemMode === 'select') {
        // Modo: Selecionar ingrediente cadastrado
        if (!selectedIngredient || !selectedSupplier || !itemQuantity) {
          toast.error('Preencha todos os campos obrigatórios');
          setAddingItems(false);
          return;
        }

        // Encontrar o ingrediente e fornecedor selecionados
        const ingredient = availableIngredients.find((i) => i.id === selectedIngredient);
        const supplier = ingredient?.suppliers?.find((s: any) => s.id === selectedSupplier);

        if (!supplier) {
          toast.error('Fornecedor inválido');
          setAddingItems(false);
          return;
        }

        const estimatedCost = parseFloat(itemQuantity) * supplier.unitPrice;

        const res = await fetch(`/api/shopping-lists/${params.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                ingredientId: selectedIngredient,
                supplierId: selectedSupplier,
                quantity: parseFloat(itemQuantity),
                unit: ingredient.standardUnit,
                estimatedCost: parseFloat(estimatedCost.toFixed(2)),
                priority: itemPriority,
              },
            ],
          }),
        });

        if (!res.ok) throw new Error('Erro ao adicionar item');
        const updatedList = await res.json();
        setList(updatedList);
        setShowAddItemsDialog(false);
        setSelectedIngredient('');
        setSelectedSupplier('');
        setItemQuantity('1');
        setItemPriority('MEDIUM');
        toast.success('Item adicionado com sucesso');
      } else {
        // Modo: Novo item não cadastrado
        if (!newItemName || !newItemQuantity || !newItemPrice) {
          toast.error('Preencha todos os campos obrigatórios');
          setAddingItems(false);
          return;
        }

        const estimatedCost = parseFloat(newItemQuantity) * parseFloat(newItemPrice);

        const res = await fetch(`/api/shopping-lists/${params.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                ingredientId: null,
                supplierId: null,
                quantity: parseFloat(newItemQuantity),
                unit: newItemUnit,
                estimatedCost: parseFloat(estimatedCost.toFixed(2)),
                priority: newItemPriority,
                notes: `Item não cadastrado: ${newItemName}`,
              },
            ],
          }),
        });

        if (!res.ok) throw new Error('Erro ao adicionar item');
        const updatedList = await res.json();
        setList(updatedList);
        setShowAddItemsDialog(false);
        setNewItemName('');
        setNewItemQuantity('1');
        setNewItemPrice('');
        setNewItemUnit('un');
        setNewItemPriority('MEDIUM');
        toast.success('Item adicionado com sucesso');
      }
    } catch (error) {
      toast.error('Erro ao adicionar item');
    } finally {
      setAddingItems(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <BackButton href="/compras" label="Voltar" />
          <h1 className="text-xl sm:text-3xl font-bold">Carregando...</h1>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <BackButton href="/compras" label="Voltar" />
        </div>
        <Card className="flex h-40 flex-col items-center justify-center">
          <AlertCircle className="mb-2 h-8 w-8 text-slate-400" />
          <p className="text-slate-600">Lista não encontrada</p>
        </Card>
      </div>
    );
  }

  const checkedCount = list.items.filter((i) => i.checked).length;
  const totalItems = list.items.length;
  const progress = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0;
  const status = statusConfig[list.status] || { label: list.status, color: 'bg-slate-100 text-slate-800', icon: Circle };
  const StatusIcon = status.icon;

  const statusTransitions: Record<string, string[]> = {
    PENDING: ['ORDERED', 'CANCELLED'],
    ORDERED: ['RECEIVED', 'PARTIAL', 'CANCELLED'],
    PARTIAL: ['RECEIVED', 'CANCELLED'],
    RECEIVED: [],
    CANCELLED: [],
  };
  const nextStatuses = statusTransitions[list.status] || [];

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <Breadcrumb items={[
        { label: 'Compras', href: '/compras' },
        { label: formatDate(new Date(list.listDate)) }
      ]} />

      <FadeIn>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <BackButton href="/compras" label="Voltar" />
              <div className="min-w-0">
                <h1 className="text-xl sm:text-3xl font-bold truncate">Lista de Compras</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {formatDate(new Date(list.listDate))}
                </p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full w-fit ${status.color}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </span>
          </div>

          {/* Action Buttons */}
          {canEdit && (
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenEditDialog}
                className="flex items-center gap-2"
              >
                <Edit2 className="h-4 w-4" />
                Editar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Deletar
              </Button>
            </div>
          )}
        </div>
      </FadeIn>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <FadeIn delay={0.1}>
          <GlassCard>
            <p className="text-xs text-slate-500 dark:text-slate-400">Itens</p>
            <p className="text-lg sm:text-2xl font-bold">{totalItems}</p>
          </GlassCard>
        </FadeIn>
        <FadeIn delay={0.15}>
          <GlassCard>
            <p className="text-xs text-slate-500 dark:text-slate-400">Marcados</p>
            <p className="text-lg sm:text-2xl font-bold text-emerald-600">{checkedCount}/{totalItems}</p>
          </GlassCard>
        </FadeIn>
        <FadeIn delay={0.2}>
          <GlassCard>
            <p className="text-xs text-slate-500 dark:text-slate-400">Custo Estimado</p>
            <p className="text-lg sm:text-2xl font-bold">{formatBRL(list.totalCost)}</p>
          </GlassCard>
        </FadeIn>
        <FadeIn delay={0.25}>
          <GlassCard>
            <p className="text-xs text-slate-500 dark:text-slate-400">Progresso</p>
            <p className="text-lg sm:text-2xl font-bold">{Math.round(progress)}%</p>
          </GlassCard>
        </FadeIn>
      </div>

      {/* Progress Bar */}
      <FadeIn delay={0.3}>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
          <div
            className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </FadeIn>

      {/* Status Actions */}
      {canEdit && nextStatuses.length > 0 && (
        <FadeIn delay={0.35}>
          <Card className="p-4">
            <p className="text-sm font-medium mb-3">Alterar Status:</p>
            <div className="flex flex-wrap gap-2">
              {nextStatuses.map((s) => {
                const conf = statusConfig[s];
                return (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    disabled={updatingStatus}
                    onClick={() => handleUpdateStatus(s)}
                    className="text-xs"
                  >
                    {conf?.label || s}
                  </Button>
                );
              })}
            </div>
          </Card>
        </FadeIn>
      )}

      {/* Notes */}
      {list.notes && (
        <FadeIn delay={0.4}>
          <Card className="p-4">
            <p className="text-sm font-semibold mb-1">Observações</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{list.notes}</p>
          </Card>
        </FadeIn>
      )}

      {/* Items List */}
      <FadeIn delay={0.45}>
        <Card className="overflow-hidden">
          <div className="p-4 border-b dark:border-slate-700">
            <h3 className="font-semibold">Itens da Lista ({totalItems})</h3>
          </div>

          {totalItems === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-4">
              <ShoppingCart className="mb-2 h-8 w-8" />
              <p>Nenhum item nesta lista</p>
              {canEdit && (
                <Button
                  onClick={handleOpenAddItemsDialog}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Itens
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y dark:divide-slate-700">
              {list.items.map((item) => {
                const prio = priorityConfig[item.priority] || priorityConfig.MEDIUM;
                const ingredient = item.supplier?.ingredient;
                return (
                  <div
                    key={item.id}
                    className={`p-4 transition-colors ${
                      item.checked ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      {canEdit && (
                        <button
                          onClick={() => handleToggleItem(item.id, item.checked)}
                          className="mt-0.5 flex-shrink-0"
                          aria-label={item.checked ? 'Desmarcar item' : 'Marcar item'}
                        >
                          {item.checked ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <Circle className="h-5 w-5 text-slate-400" />
                          )}
                        </button>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <div className="min-w-0">
                            <p className={`font-medium break-words ${item.checked ? 'line-through text-slate-400' : ''}`}>
                              {ingredient?.name || (item.notes?.startsWith('Item não cadastrado:') 
                                ? item.notes.replace('Item não cadastrado: ', '') 
                                : 'Item')}
                            </p>
                            <p className="text-xs text-slate-500 break-words">
                              {ingredient?.code ? `${ingredient.code} • ` : ''}
                              Fornecedor: {item.supplier?.supplierName || (item.notes?.startsWith('Item não cadastrado:') ? '(não cadastrado)' : '—')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${prio.color}`}>
                              {prio.label}
                            </span>
                            {ingredient?.category && (
                              <span
                                className="text-xs px-2 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: ingredient.category.color }}
                              >
                                {ingredient.category.name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm">
                          <span className="text-slate-600 dark:text-slate-400">
                            <strong>{item.quantity}</strong> {item.unit}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">
                            Unit: {formatBRL(item.supplier?.unitPrice || 0)}
                          </span>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {formatBRL(item.estimatedCost)}
                          </span>
                          {ingredient?.currentStock && (
                            <span className="text-xs text-slate-500">
                              Estoque: {ingredient.currentStock.currentQuantity} {ingredient.standardUnit}
                            </span>
                          )}
                        </div>

                        {item.notes && (
                          <p className="text-xs text-slate-500 mt-1 break-words">{item.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </FadeIn>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Lista de Compras</DialogTitle>
            <DialogDescription>
              Atualize os dados da lista de compras
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Observações</Label>
              <Textarea
                id="edit-notes"
                placeholder="Adicione observações sobre esta lista de compras..."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={saving}
                loading={saving}
              >
                Salvar Alterações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar Lista de Compras</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar esta lista de compras? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel disabled={deleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deletando...' : 'Deletar'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Items Dialog */}
      <Dialog open={showAddItemsDialog} onOpenChange={setShowAddItemsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Itens à Lista</DialogTitle>
            <DialogDescription>
              {addItemMode === 'select'
                ? 'Selecione um ingrediente cadastrado'
                : 'Adicione um novo item não cadastrado'}
            </DialogDescription>
          </DialogHeader>

          {/* Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={addItemMode === 'select' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAddItemMode('select')}
              disabled={addingItems}
              className="flex-1"
            >
              Selecionar
            </Button>
            <Button
              variant={addItemMode === 'new' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAddItemMode('new')}
              disabled={addingItems}
              className="flex-1"
            >
              Novo Item
            </Button>
          </div>

          <div className="space-y-4">
            {addItemMode === 'select' ? (
              <>
                {/* MODO: Selecionar Ingrediente Cadastrado */}
                <div className="space-y-2">
                  <Label htmlFor="ingredient-select">Ingrediente *</Label>
                  <Select value={selectedIngredient} onValueChange={setSelectedIngredient}>
                    <SelectTrigger id="ingredient-select">
                      <SelectValue placeholder="Selecione um ingrediente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableIngredients.map((ingredient) => (
                        <SelectItem key={ingredient.id} value={ingredient.id}>
                          {ingredient.name} ({ingredient.standardUnit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Supplier Selection */}
                {selectedIngredient && (
                  <div className="space-y-2">
                    <Label htmlFor="supplier-select">Fornecedor *</Label>
                    <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                      <SelectTrigger id="supplier-select">
                        <SelectValue placeholder="Selecione um fornecedor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableIngredients
                          .find((i) => i.id === selectedIngredient)
                          ?.suppliers?.map((supplier: any) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.supplierName} - {formatBRL(supplier.unitPrice)}/un
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Quantity */}
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantidade *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    placeholder="1"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(e.target.value)}
                    step="0.01"
                    min="0.01"
                  />
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <Label htmlFor="priority-select">Prioridade</Label>
                  <Select value={itemPriority} onValueChange={setItemPriority}>
                    <SelectTrigger id="priority-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Baixa</SelectItem>
                      <SelectItem value="MEDIUM">Média</SelectItem>
                      <SelectItem value="HIGH">Alta</SelectItem>
                      <SelectItem value="CRITICAL">Crítico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Estimated Cost Display */}
                {selectedIngredient && selectedSupplier && itemQuantity && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Custo Estimado</p>
                    <p className="text-lg font-semibold">
                      {formatBRL(
                        parseFloat(itemQuantity) *
                          (availableIngredients
                            .find((i) => i.id === selectedIngredient)
                            ?.suppliers?.find((s: any) => s.id === selectedSupplier)?.unitPrice || 0)
                      )}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* MODO: Novo Item Não Cadastrado */}
                <div className="space-y-2">
                  <Label htmlFor="new-item-name">Nome do Item *</Label>
                  <Input
                    id="new-item-name"
                    placeholder="Ex: Óleo de Soja"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-item-quantity">Quantidade *</Label>
                    <Input
                      id="new-item-quantity"
                      type="number"
                      placeholder="1"
                      value={newItemQuantity}
                      onChange={(e) => setNewItemQuantity(e.target.value)}
                      step="0.01"
                      min="0.01"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-item-unit">Unidade</Label>
                    <Select value={newItemUnit} onValueChange={setNewItemUnit}>
                      <SelectTrigger id="new-item-unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="un">Unidade</SelectItem>
                        <SelectItem value="kg">Kg</SelectItem>
                        <SelectItem value="g">Grama</SelectItem>
                        <SelectItem value="l">Litro</SelectItem>
                        <SelectItem value="ml">ML</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-item-price">Preço Unitário (R$) *</Label>
                  <Input
                    id="new-item-price"
                    type="number"
                    placeholder="0.00"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    step="0.01"
                    min="0.01"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-item-priority">Prioridade</Label>
                  <Select value={newItemPriority} onValueChange={setNewItemPriority}>
                    <SelectTrigger id="new-item-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Baixa</SelectItem>
                      <SelectItem value="MEDIUM">Média</SelectItem>
                      <SelectItem value="HIGH">Alta</SelectItem>
                      <SelectItem value="CRITICAL">Crítico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Estimated Cost Display */}
                {newItemQuantity && newItemPrice && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Custo Estimado</p>
                    <p className="text-lg font-semibold">
                      {formatBRL(parseFloat(newItemQuantity) * parseFloat(newItemPrice))}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setShowAddItemsDialog(false)}
                disabled={addingItems}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddItem}
                disabled={addingItems}
                loading={addingItems}
              >
                Adicionar Item
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}