import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Suspense } from 'react';
import { authOptions } from '@/lib/auth';
import { DashboardAlertsLoadingSkeleton } from '@/components/dashboard/dashboard-loading-skeleton';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { FirstSteps } from '@/components/dashboard/first-steps';
import { TodayPanel } from '@/components/dashboard/today-panel';
import { firstSteps } from '@/lib/onboarding/first-steps';
import { todayData } from '@/lib/dashboard/today';
import { panelTiles } from '@/lib/dashboard/today-tiles';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { canSeeModule } from '@/lib/navigation/app-nav';

/**
 * Início = "Painel do dia" (2026-10-18 UX research, proposal 1): today's sales, register, comandas, delivery, kitchen,
 * bills and stock, each tile opening its screen. The old grid of 49 module cards (a second menu with other names and
 * features that did not exist) is gone; the side menu is the only navigation.
 */
export const dynamic = 'force-dynamic';

async function Today({ restaurantId, role }: { restaurantId: string; role?: string }) {
  return <TodayPanel tiles={panelTiles(await todayData(restaurantId), role)} />;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/auth/signin');
  const user = session.user as { name?: string | null; email?: string | null; role?: string };
  const restaurantId = await getCurrentRestaurantId();

  // Primeiros passos (the address left for later is one of them) for who can do them; "Vender" for everyone
  const canEditRestaurant = ['OWNER', 'MANAGER', 'ADMIN'].includes(String(user.role));
  const steps = restaurantId && canEditRestaurant ? await firstSteps(restaurantId) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50">
      <DashboardHeader userName={user.name || user.email || ''} />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {/* The Vender button and what is left to set up (it can be closed), then the day */}
        <FirstSteps steps={steps} canSell={canSeeModule('/vender', user.role)} />
        {restaurantId && (
          <Suspense fallback={<DashboardAlertsLoadingSkeleton />}>
            <Today restaurantId={restaurantId} role={user.role} />
          </Suspense>
        )}
      </main>
    </div>
  );
}
