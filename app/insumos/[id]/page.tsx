'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { FadeIn } from '@/components/ui/animate';
import { formatDate } from '@/lib/formatters';
import { GlassCard } from '@/components/ui/glass-card';

interface Ingredient {
  id: string;
  name: string;
  code: string;
  description?: string;
  category?: {
    id: string;
    name: string;
    color: string;
  };
  standardUnit: string;
  minimumStock: number;
  referenceCost: number;
  suppliers?: Array<{
    id: string;
    supplierName: string;
    supplierCode?: string;
    unitPrice: number;
  }>;
  currentStock?: {
    id: string;
    currentQuantity: number;
  };
  priceTrends?: Array<{
    id: string;
    price: number;
    quantity?: number;
    recordedDate: string;
  }>;
}

export default function IngredientDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const user = session?.user as any;
  const canEdit = user?.role !== 'COOK';
  const canDelete = user?.role === 'OWNER';

  useEffect(() => {
    fetchIngredient();
  }, [params.id]);

  async function fetchIngredient() {
    try {
      const res = await fetch(`/api/ingredients/${params.id}`);
      if (!res.ok) throw new Error('Insumo não encontrado');
      const data = await res.json();
      setIngredient(data);
    } catch (error) {
      toast.error('Erro ao carregar insumo');
      router.push('/insumos');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Tem certeza que deseja deletar este insumo?')) return;
    
    setDeleting(true);
    try {
      const res = await fetch(`/api/ingredients/${params.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Erro ao deletar');
      toast.success('Insumo deletado com sucesso');
      router.push('/insumos');
    } catch (error) {
      toast.error('Erro ao deletar insumo');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Breadcrumb items={[
          { label: 'Insumos', href: '/insumos' },
          { label: 'Carregando...' }
        ]} />
        <div className="flex items-center gap-4">
          <BackButton href="/insumos" label="Voltar" />
          <h1 className="text-xl sm:text-3xl font-bold">Carregando...</h1>
        </div>
      </div>
    );
  }

  if (!ingredient) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Breadcrumb items={[
          { label: 'Insumos', href: '/insumos' },
          { label: 'Não encontrado' }
        ]} />
        <div className="flex items-center gap-4">
          <BackButton href="/insumos" label="Voltar" />
        </div>
        <Card className="flex h-40 flex-col items-center justify-center">
          <AlertCircle className="mb-2 h-8 w-8 text-slate-400" />
          <p className="text-slate-600">Insumo não encontrado</p>
        </Card>
      </div>
    );
  }

  const currentQuantity = ingredient.currentStock?.currentQuantity ?? 0;
  const isLowStock = currentQuantity < ingredient.minimumStock;
  const avgPrice = ingredient.priceTrends && ingredient.priceTrends.length > 0
    ? ingredient.priceTrends.reduce((sum, t) => sum + t.price, 0) / ingredient.priceTrends.length
    : ingredient.referenceCost;

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <Breadcrumb items={[
        { label: 'Insumos', href: '/insumos' },
        { label: ingredient.name }
      ]} />
      <FadeIn>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton href="/insumos" label="Voltar" />
            <div>
              <h1 className="text-xl sm:text-3xl font-bold">{ingredient.name}</h1>
              <p className="text-slate-600">Código: {ingredient.code}</p>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Link href={`/insumos/${ingredient.id}/editar`}>
                <Button variant="outline" aria-label={`Editar insumo ${ingredient.name}`}>
                  <Edit2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Editar
                </Button>
              </Link>
              {canDelete && (
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                  aria-label={`Deletar insumo ${ingredient.name}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {deleting ? 'Deletando...' : 'Deletar'}
                </Button>
              )}
            </div>
          )}
        </div>
      </FadeIn>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column - Basic Info */}
        <div className="space-y-4 md:col-span-1">
          <FadeIn delay={0.1}>
            <GlassCard>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-600">Categoria</h3>
                  {ingredient.category ? (
                    <Badge
                      style={{
                        backgroundColor: ingredient.category.color,
                        color: 'white',
                      }}
                    >
                      {ingredient.category.name}
                    </Badge>
                  ) : (
                    <p className="text-sm text-slate-500">Sem categoria</p>
                  )}
                </div>
              </div>
            </GlassCard>
          </FadeIn>

          <FadeIn delay={0.2}>
            <GlassCard>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-slate-600">Unidade Padrão</h3>
                  <p className="text-lg font-bold">{ingredient.standardUnit}</p>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-slate-600">Estoque Mínimo</h3>
                  <p className="text-lg font-bold">{ingredient.minimumStock}</p>
                </div>
              </div>
            </GlassCard>
          </FadeIn>
        </div>

        {/* Middle Column - Stock & Pricing */}
        <div className="space-y-4 md:col-span-1">
          <FadeIn delay={0.3}>
            <Card className={`border-2 p-4 ${
              isLowStock ? 'border-red-200 bg-red-50 dark:bg-red-950/20' : 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-600">Estoque Atual</p>
                  <p className="mt-2 text-3xl font-bold">
                    {currentQuantity} {ingredient.standardUnit}
                  </p>
                  {isLowStock && (
                    <p className="mt-2 flex items-center text-sm font-semibold text-red-600">
                      <AlertCircle className="mr-1 h-4 w-4" />
                      Abaixo do mínimo
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </FadeIn>

          <FadeIn delay={0.4}>
            <GlassCard>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-slate-600">Custo de Referência</h3>
                  <p className="text-2xl font-bold">R$ {ingredient.referenceCost.toFixed(2)}</p>
                </div>
                {ingredient.priceTrends && ingredient.priceTrends.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="mb-1 text-sm font-semibold text-slate-600">Preço Médio</h3>
                    <p className="text-2xl font-bold">R$ {avgPrice.toFixed(2)}</p>
                  </div>
                )}
              </div>
            </GlassCard>
          </FadeIn>
        </div>

        {/* Right Column - Suppliers */}
        <div className="space-y-4 md:col-span-1">
          <FadeIn delay={0.5}>
            <GlassCard>
              <div className="space-y-3">
                <h3 className="font-semibold">Fornecedores</h3>
                {ingredient.suppliers && ingredient.suppliers.length > 0 ? (
                  <div className="space-y-2">
                    {ingredient.suppliers.map((supplier) => (
                      <div
                        key={supplier.id}
                        className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"
                      >
                        <p className="font-semibold">{supplier.supplierName}</p>
                        {supplier.supplierCode && (
                          <p className="text-xs text-slate-500">Cód: {supplier.supplierCode}</p>
                        )}
                        <p className="mt-1 text-sm font-semibold text-emerald-600">
                          R$ {supplier.unitPrice.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Nenhum fornecedor cadastrado</p>
                )}
              </div>
            </GlassCard>
          </FadeIn>
        </div>
      </div>

      {/* Description */}
      {ingredient.description && (
        <FadeIn delay={0.6}>
          <Card className="p-6">
            <h3 className="mb-3 font-semibold">Descrição</h3>
            <p className="text-slate-600">{ingredient.description}</p>
          </Card>
        </FadeIn>
      )}

      {/* Price Trends */}
      {ingredient.priceTrends && ingredient.priceTrends.length > 0 && (
        <FadeIn delay={0.7}>
          <Card className="p-6">
            <h3 className="mb-4 font-semibold">Histórico de Preços</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left">Data</th>
                    <th className="py-2 text-right">Preço</th>
                    <th className="py-2 text-right">Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredient.priceTrends.slice(-10).reverse().map((trend) => (
                    <tr key={trend.id} className="border-b transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="py-2">
                        {formatDate(new Date(trend.recordedDate))}
                      </td>
                      <td className="py-2 text-right font-semibold">
                        R$ {trend.price.toFixed(2)}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {trend.quantity ? `${trend.quantity} ${ingredient.standardUnit}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}
