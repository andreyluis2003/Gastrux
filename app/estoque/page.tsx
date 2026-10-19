import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Suspense } from 'react';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { I18nPageHeader, I18nButton } from '@/components/ui/i18n-page-header';
import { AlertTriangle, ListPlus } from 'lucide-react';
import Link from 'next/link';
import { formatQuantity } from '@/lib/formatters';
import { EstoqueFilterClient } from '@/components/estoque/estoque-filter-client';
import { stockPositions, type StockStatus } from '@/lib/stock/positions';
import { getRestaurantMember, isManager } from '@/lib/auth/restaurant-role';

// Right after an entry the page must show it (it used to be cached for 2 minutes)
export const dynamic = 'force-dynamic';

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
          <div key={i} className="p-4 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse h-40"></div>
        ))}
      </div>
    </div>
  );
}

const STATUS: Record<StockStatus, { label: string; color: string }> = {
  CRITICAL: { label: '🔴 Crítico', color: 'text-red-600' },
  LOW: { label: '🟠 Baixo', color: 'text-orange-600' },
  OK: { label: '🟢 OK', color: 'text-green-600' },
};

async function EstoqueContent({ search, category, stockStatus, unit, quantityMin, quantityMax, canEnter }: EstoquePageProps['searchParams'] & { canEnter: boolean }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/auth/signin');

  // Only this restaurant's stock and categories: the page used to list every restaurant's (found 2026-10-06)
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) redirect('/dashboard');

  // Every active insumo, zero when nothing came in yet (2026-10-18: only insumos with a stock row used to show)
  const positions = await stockPositions(restaurantId);

  let filtered = positions;
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(s) || p.code?.toLowerCase().includes(s));
  }
  if (category) filtered = filtered.filter((p) => p.categoryId === category);
  if (unit) filtered = filtered.filter((p) => p.unit === unit);
  if (quantityMin || quantityMax) {
    const min = quantityMin ? parseFloat(quantityMin) : 0;
    const max = quantityMax ? parseFloat(quantityMax) : Infinity;
    filtered = filtered.filter((p) => p.quantity >= min && p.quantity <= max);
  }
  if (stockStatus) filtered = filtered.filter((p) => p.status === stockStatus);

  const count = (st: StockStatus) => positions.filter((p) => p.status === st).length;
  const neverEntered = positions.filter((p) => !p.hasStock).length;

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">CRÍTICO</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{count('CRITICAL')}</p>
        </Card>
        <Card className="p-4 border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800">
          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">BAIXO</p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{count('LOW')}</p>
        </Card>
        <Card className="p-4 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">OK</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{count('OK')}</p>
        </Card>
      </div>

      {canEnter && neverEntered > 0 && (
        <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-primary/30 bg-primary/5">
          <p className="text-sm flex-1">
            {neverEntered === 1 ? '1 insumo ainda não teve entrada.' : `${neverEntered} insumos ainda não tiveram entrada.`} Dê entrada de uma vez com o que você tem hoje.
          </p>
          <Button asChild size="sm"><Link href="/estoque/entrada">Entrada em lote</Link></Button>
        </Card>
      )}

      <div className="text-sm text-slate-600">
        {filtered.length} {filtered.length === 1 ? 'insumo' : 'insumos'}
      </div>

      {filtered.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center gap-2 text-center p-4">
          {positions.length === 0 ? (
            <>
              <p className="text-slate-600">Nenhum insumo cadastrado ainda.</p>
              <Button asChild size="sm" variant="outline"><Link href="/insumos">Cadastrar insumos</Link></Button>
            </>
          ) : (
            <p className="text-slate-600">Nenhum insumo com esses filtros.</p>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const st = STATUS[p.status];
            return (
              <Card key={p.ingredientId} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{p.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{p.code}</p>
                  </div>
                  <span className={`text-sm font-medium ${st.color}`}>{st.label}</span>
                </div>
                <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Atual:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {p.hasStock ? formatQuantity(p.quantity, p.unit) : <span className="text-slate-500 font-normal">sem entrada ainda</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Mínimo:</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{p.minimum ? `${p.minimum} ${p.unit}` : 'não definido'}</span>
                  </div>
                </div>
                {p.status !== 'OK' && (
                  <div className="mt-3 flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded">
                    <AlertTriangle className="h-3 w-3 text-orange-600" />
                    <p className="text-xs text-orange-600 dark:text-orange-400">Considere reabastecer</p>
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

export default async function EstoquePage({ searchParams }: EstoquePageProps) {
  // Entries are for the owner and the manager (the movement routes refuse the cook, who still sees the stock)
  const member = await getRestaurantMember();
  const canEnter = !!member && isManager(member);
  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <I18nPageHeader titleKey="stock.title" subtitleKey="stock.subtitle">
        {canEnter && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href="/estoque/entrada"><ListPlus className="h-4 w-4 mr-1" /> Entrada em lote</Link></Button>
            <Link href="/estoque/movimento">
              <I18nButton labelKey="stock.registerMovement" />
            </Link>
          </div>
        )}
      </I18nPageHeader>

      <EstoqueFilterClient
        initialSearch={searchParams.search || ''}
        initialCategory={searchParams.category || ''}
        initialStockStatus={searchParams.stockStatus || ''}
        initialUnit={searchParams.unit || ''}
        initialQuantityMin={searchParams.quantityMin || ''}
        initialQuantityMax={searchParams.quantityMax || ''}
      />

      <Suspense fallback={<EstoqueLoadingSkeleton />}>
        <EstoqueContent {...searchParams} canEnter={canEnter} />
      </Suspense>
    </div>
  );
}
