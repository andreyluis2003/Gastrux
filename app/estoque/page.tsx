import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Suspense } from 'react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { I18nPageHeader, I18nButton } from '@/components/ui/i18n-page-header';
import { Plus, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { formatQuantity } from '@/lib/formatters';
import { EstoqueFilterClient } from '@/components/estoque/estoque-filter-client';

export const revalidate = 120;

interface EstoquePageProps {
  searchParams: {
    search?: string;
    category?: string;
    stockStatus?: string;
    unit?: string;
    quantityMin?: string;
    quantityMax?: string;
  };
}

function EstoqueLoadingSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse h-20"></div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div 
            key={i} 
            className="p-4 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse h-40"
          ></div>
        ))}
      </div>
    </div>
  );
}

async function EstoqueContent({ 
  search, 
  category, 
  stockStatus, 
  unit,
  quantityMin,
  quantityMax 
}: {
  search?: string;
  category?: string;
  stockStatus?: string;
  unit?: string;
  quantityMin?: string;
  quantityMax?: string;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/auth/signin');
  }

  const stocks = await prisma.stock.findMany({
    include: {
      ingredient: {
        include: { category: true },
      },
    },
    orderBy: { ingredient: { name: 'asc' } },
  });

  const categories = await prisma.ingredientCategory.findMany({
    orderBy: { name: 'asc' },
  });

  // Apply filters
  let filtered = stocks;

  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      (stock) =>
        stock.ingredient.name.toLowerCase().includes(searchLower) ||
        stock.ingredient.code?.toLowerCase().includes(searchLower)
    );
  }

  if (category) {
    filtered = filtered.filter((stock) => stock.ingredient.category?.id === category);
  }

  if (unit) {
    filtered = filtered.filter((stock) => stock.ingredient.standardUnit === unit);
  }

  if (quantityMin || quantityMax) {
    const min = quantityMin ? parseFloat(quantityMin) : 0;
    const max = quantityMax ? parseFloat(quantityMax) : Infinity;
    filtered = filtered.filter((stock) => stock.currentQuantity >= min && stock.currentQuantity <= max);
  }

  if (stockStatus) {
    filtered = filtered.filter((stock) => {
      const minStock = stock.ingredient.minimumStock || 0;
      if (stockStatus === 'CRITICAL') {
        return stock.currentQuantity < minStock * 0.5;
      } else if (stockStatus === 'LOW') {
        return stock.currentQuantity >= minStock * 0.5 && stock.currentQuantity < minStock;
      } else if (stockStatus === 'OK') {
        return stock.currentQuantity >= minStock;
      }
      return true;
    });
  }

  const getStockStatus = (currentQty: number, minStock: number) => {
    if (currentQty < minStock * 0.5) return { status: 'CRITICAL', label: '🔴 Crítico', color: 'text-red-600' };
    if (currentQty < minStock) return { status: 'LOW', label: '🟠 Baixo', color: 'text-orange-600' };
    return { status: 'OK', label: '🟢 OK', color: 'text-green-600' };
  };

  const stockStats = {
    critical: stocks.filter((s) => s.currentQuantity < (s.ingredient.minimumStock || 0) * 0.5).length,
    low: stocks.filter((s) => {
      const min = s.ingredient.minimumStock || 0;
      return s.currentQuantity >= min * 0.5 && s.currentQuantity < min;
    }).length,
    ok: stocks.filter((s) => s.currentQuantity >= (s.ingredient.minimumStock || 0)).length,
  };

  return (
    <>
      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">CRÍTICO</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stockStats.critical}</p>
        </Card>
        <Card className="p-4 border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800">
          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">BAIXO</p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stockStats.low}</p>
        </Card>
        <Card className="p-4 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">OK</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stockStats.ok}</p>
        </Card>
      </div>

      {/* Filter Info */}
      <div className="text-sm text-slate-600">
        {filtered.length} {filtered.length === 1 ? 'item' : 'itens'} encontrado(s)
      </div>

      {/* Stock Items */}
      {filtered.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center">
          <p className="text-slate-600">Nenhum item de estoque encontrado</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((stock) => {
            const minStock = stock.ingredient.minimumStock || 0;
            const statusInfo = getStockStatus(stock.currentQuantity, minStock);
            return (
              <Card key={stock.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{stock.ingredient.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{stock.ingredient.code}</p>
                  </div>
                  <span className={`text-sm font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                
                <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Atual:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formatQuantity(stock.currentQuantity, stock.ingredient.standardUnit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Mínimo:</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {minStock} {stock.ingredient.standardUnit}
                    </span>
                  </div>
                </div>

                {statusInfo.status !== 'OK' && (
                  <div className="mt-3 flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded">
                    <AlertTriangle className="h-3 w-3 text-orange-600" />
                    <p className="text-xs text-orange-600 dark:text-orange-400">
                      Considere reabastecer
                    </p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function EstoquePage({ searchParams }: EstoquePageProps) {
  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <I18nPageHeader titleKey="stock.title" subtitleKey="stock.subtitle">
        <Link href="/estoque/movimento">
          <I18nButton labelKey="stock.registerMovement" />
        </Link>
      </I18nPageHeader>

      {/* Filter Component (Client-side) */}
      <EstoqueFilterClient 
        initialSearch={searchParams.search || ''}
        initialCategory={searchParams.category || ''}
        initialStockStatus={searchParams.stockStatus || ''}
        initialUnit={searchParams.unit || ''}
        initialQuantityMin={searchParams.quantityMin || ''}
        initialQuantityMax={searchParams.quantityMax || ''}
      />

      {/* SSR Content with Suspense */}
      <Suspense fallback={<EstoqueLoadingSkeleton />}>
        <EstoqueContent 
          search={searchParams.search}
          category={searchParams.category}
          stockStatus={searchParams.stockStatus}
          unit={searchParams.unit}
          quantityMin={searchParams.quantityMin}
          quantityMax={searchParams.quantityMax}
        />
      </Suspense>
    </div>
  );
}
