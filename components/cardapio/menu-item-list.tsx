'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/formatters';
import { Edit, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  available: boolean;
  category: {
    id: string;
    name: string;
  };
}

export function MenuItemList() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      const response = await fetch('/api/cardapio/itens');
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      toast.error('Erro ao carregar cardápio');
    } finally {
      setLoading(false);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Tem certeza que deseja deletar este item?')) return;

    try {
      const response = await fetch(`/api/cardapio/itens/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setItems(items.filter(item => item.id !== id));
        toast.success('Item deletado com sucesso');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Erro ao deletar item');
    }
  }

  if (loading) {
    return <div className="text-center py-8">Carregando cardápio...</div>;
  }

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const categoryId = item.category.id;
    if (!acc[categoryId]) {
      acc[categoryId] = { category: item.category, items: [] };
    }
    acc[categoryId].items.push(item);
    return acc;
  }, {} as Record<string, { category: any; items: MenuItem[] }>);

  return (
    <div className="space-y-6">
      {Object.values(groupedItems).map(({ category, items: categoryItems }) => (
        <div key={category.id}>
          <h3 className="font-semibold text-lg mb-3">{category.name}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryItems.map(item => (
              <Card key={item.id} className="p-4">
                <div className="flex flex-col h-full">
                  <h4 className="font-medium mb-1">{item.name}</h4>
                  {item.description && (
                    <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-3 border-t">
                    <span className="font-semibold">{formatBRL(item.price)}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteItem(item.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
