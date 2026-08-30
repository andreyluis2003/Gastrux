'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Button,
  Card,
  Input,
  Label,
  BackButton,
  LoadingSkeleton,
} from '@/components/ui';
import { toast } from 'sonner';
import {
  Plus,
  Edit2,
  Trash2,
  DollarSign,
  Tag,
} from 'lucide-react';
import { formatBRL } from '@/lib/formatters';

interface Modifier {
  id: string;
  name: string;
  category?: string;
  description?: string;
  priceAdjustment: number;
  active: boolean;
}

export default function ModifiersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    description: '',
    priceAdjustment: '0.00',
  });

  if (status === 'loading') return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  useEffect(() => {
    fetchModifiers();
  }, []);

  const fetchModifiers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/modifiers');
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setModifiers(data.modifiers || []);
    } catch (error) {
      console.error('Error fetching modifiers:', error);
      toast.error('Erro ao carregar modificadores');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name) {
      toast.error('Nome do modificador é obrigatório');
      return;
    }

    try {
      const response = await fetch('/api/modifiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          category: formData.category || null,
          description: formData.description || null,
          priceAdjustment: parseFloat(formData.priceAdjustment),
        }),
      });

      if (!response.ok) throw new Error('Failed to create');

      toast.success('Modificador criado com sucesso');
      setFormData({
        name: '',
        category: '',
        description: '',
        priceAdjustment: '0.00',
      });
      setShowNewDialog(false);
      fetchModifiers();
    } catch (error) {
      console.error('Error creating modifier:', error);
      toast.error('Erro ao criar modificador');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja deletar este modificador?')) return;

    try {
      const response = await fetch(`/api/modifiers/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete');

      toast.success('Modificador deletado com sucesso');
      fetchModifiers();
    } catch (error) {
      console.error('Error deleting modifier:', error);
      toast.error('Erro ao deletar modificador');
    }
  };

  const activeModifiers = modifiers.filter((m) => m.active);

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">Modificadores de Itens</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure opções e customizações para seus itens de cardápio
          </p>
        </div>
        <Button
          onClick={() => setShowNewDialog(true)}
          className="gap-2 w-full sm:w-auto"
        >
          <Plus size={18} />
          Novo Modificador
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      ) : activeModifiers.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Nenhum modificador criado ainda</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeModifiers.map((modifier) => (
            <Card key={modifier.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{modifier.name}</span>
                    {modifier.category && (
                      <span className="text-xs bg-muted px-2 py-1 rounded flex items-center gap-1">
                        <Tag size={12} />
                        {modifier.category}
                      </span>
                    )}
                  </div>
                  {modifier.description && (
                    <p className="text-sm text-muted-foreground">
                      {modifier.description}
                    </p>
                  )}
                  {modifier.priceAdjustment !== 0 && (
                    <p className="text-sm font-semibold flex items-center gap-1">
                      <DollarSign size={16} />
                      {modifier.priceAdjustment > 0 ? '+' : ''}
                      {formatBRL(modifier.priceAdjustment)}
                    </p>
                  )}
                </div>

                <div className="flex w-full gap-2 sm:w-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 sm:flex-none"
                  >
                    <Edit2 size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(modifier.id)}
                    className="flex-1 sm:flex-none text-red-600 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showNewDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="p-6 space-y-4 w-full max-w-md max-h-screen overflow-y-auto">
            <h3 className="font-semibold text-lg">Novo Modificador</h3>

            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Ex: Sem cebola"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Input
                id="category"
                placeholder="Ex: Opções de preparo"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Descrição do modificador"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priceAdjustment">Ajuste de Preco</Label>
              <Input
                id="priceAdjustment"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.priceAdjustment}
                onChange={(e) =>
                  setFormData({ ...formData, priceAdjustment: e.target.value })
                }
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleCreate}
                className="flex-1"
              >
                Criar Modificador
              </Button>
              <Button
                onClick={() => setShowNewDialog(false)}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}