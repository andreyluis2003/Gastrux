import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { stockPositions } from '@/lib/stock/positions';
import { BatchEntryForm } from '@/components/estoque/batch-entry-form';
import { getRestaurantMember, isManager } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

/** Entrada em lote (2026-10-18 UX research, proposal 3): every insumo on one screen, quantity and cost per line */
export default async function EntradaEmLotePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/auth/signin');
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) redirect('/dashboard');
  const member = await getRestaurantMember();
  if (!member || !isManager(member)) redirect('/estoque');
  const rows = await stockPositions(restaurantId);
  return (
    <div className="space-y-4 p-4 sm:p-6 pb-28 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold">Entrada em lote</h1>
        <p className="text-sm text-muted-foreground">
          Digite o que chegou de cada insumo e, se quiser, o custo por unidade. Linhas em branco ficam de fora. No fim, confirme tudo de uma vez.
        </p>
      </div>
      <BatchEntryForm
        rows={rows.map((r) => ({ id: r.ingredientId, name: r.name, unit: r.unit, quantity: r.quantity, minimum: r.minimum, hasStock: r.hasStock, cost: r.referenceCost, below: r.status !== 'OK' }))}
      />
    </div>
  );
}
