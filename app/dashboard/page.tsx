import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Suspense } from 'react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DashboardContent, type DashboardContentProps } from '@/components/dashboard/dashboard-content';
import {
  DashboardAlertsLoadingSkeleton,
} from '@/components/dashboard/dashboard-loading-skeleton';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { AlertsBanner } from '@/components/ai/alerts-banner';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';


// Cache strategy: Revalidate dashboard every 60 seconds (1 minute)
// This balances freshness with performance for metrics, alerts, and recent activity
export const revalidate = 60;

interface User {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string;
}

// CRITICAL DATA - Fetch immediately (< 100ms)
async function CriticalData(restaurantId: string) {
  const [ingredientCount, recipeCount] = await Promise.all([
    prisma.ingredient.count({ where: { active: true, restaurantId } }),
    prisma.recipe.count({ where: { active: true, restaurantId } }),
  ]);

  return { ingredientCount, recipeCount };
}

// HIGH PRIORITY DATA - Fetch after 100-200ms
async function HighPriorityData(restaurantId: string) {
  const lowStockCount = await prisma.stock.count({
    where: {
      restaurantId,
      currentQuantity: {
        lt: 0,
      },
    },
  });

  return { lowStockCount };
}

// MEDIUM PRIORITY DATA - Fetch after 500ms
async function MediumPriorityData(restaurantId: string) {
  const recentPlans = await prisma.productionPlan.findMany({
    take: 3,
    where: { restaurantId },
    orderBy: { planDate: 'desc' },
    include: { items: true },
  });

  return { recentPlans };
}

// LOW PRIORITY DATA - Fetch after 1000ms+
async function LowPriorityData(restaurantId: string) {
  const recentAlerts = await prisma.alert.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    where: { dismissed: false, restaurantId },
  });

  return { recentAlerts };
}

async function DashboardFullContent({ 
  criticalData, 
  modules,
  restaurantId,
}: { 
  criticalData: { ingredientCount: number; recipeCount: number }; 
  modules: DashboardContentProps['modules'];
  restaurantId: string;
}) {
  const [high, medium, low] = await Promise.all([
    HighPriorityData(restaurantId),
    MediumPriorityData(restaurantId),
    LowPriorityData(restaurantId),
  ]);

  return (
    <DashboardContent
      ingredientCount={criticalData.ingredientCount}
      recipeCount={criticalData.recipeCount}
      recentPlans={medium.recentPlans}
      recentAlerts={low.recentAlerts}
      lowStockCount={high.lowStockCount}
      modules={modules}
    />
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/auth/signin');
  }

  const user = session.user as User;

  const restaurantId = await getCurrentRestaurantId();

  // Fetch critical data immediately (scoped to the current restaurant)
  const critical = restaurantId
    ? await CriticalData(restaurantId)
    : { ingredientCount: 0, recipeCount: 0 };

  const modules = [
    { id: 'cardapio-digital', iconName: 'ChefHat' as const, href: '/admin/cardapio', color: 'bg-amber-50', accentColor: 'text-amber-600' },
    { id: 'qr-codes', iconName: 'QrCode' as const, href: '/admin/tables/qrcodes', color: 'bg-yellow-50', accentColor: 'text-yellow-700' },
    { id: 'mesas', iconName: 'Armchair' as const, href: '/admin/tables', color: 'bg-teal-50', accentColor: 'text-teal-600' },
    { id: 'comanda', iconName: 'ClipboardList' as const, href: '/comanda', color: 'bg-rose-50', accentColor: 'text-rose-600' },
    { id: 'whatsapp-bot', iconName: 'MessageSquare' as const, href: '/admin/integrations/whatsapp', color: 'bg-green-50', accentColor: 'text-green-600' },
    { id: 'voice-agent', iconName: 'Mic' as const, href: '/admin/integrations/voice', color: 'bg-rose-50', accentColor: 'text-rose-600' },
    { id: 'messaging-campaigns', iconName: 'Megaphone' as const, href: '/admin/messaging/campaigns', color: 'bg-indigo-50', accentColor: 'text-indigo-600' },
    { id: 'delivery-orders', iconName: 'Bike' as const, href: '/admin/integrations/orders', color: 'bg-red-50', accentColor: 'text-red-600' },
    { id: 'delivery-site', iconName: 'Globe' as const, href: '/admin/delivery-site', color: 'bg-orange-50', accentColor: 'text-orange-600' },
    { id: 'nfe-import', iconName: 'FileText' as const, href: '/admin/nfe-import', color: 'bg-blue-50', accentColor: 'text-blue-600' },
    { id: 'cashback', iconName: 'Gift' as const, href: '/admin/cashback', color: 'bg-purple-50', accentColor: 'text-purple-600' },
    { id: 'insumos', iconName: 'Package' as const, href: '/insumos', color: 'bg-blue-50', accentColor: 'text-blue-600' },
    { id: 'receitas', iconName: 'BookOpen' as const, href: '/receitas', color: 'bg-green-50', accentColor: 'text-green-600' },
    { id: 'escalonamento', iconName: 'TrendingUp' as const, href: '/escalonamento', color: 'bg-purple-50', accentColor: 'text-purple-600' },
    { id: 'planejamento', iconName: 'Calendar' as const, href: '/planejamento', color: 'bg-orange-50', accentColor: 'text-orange-600' },
    { id: 'estoque-rapido', iconName: 'Zap' as const, href: '/estoque-rapido', color: 'bg-cyan-50', accentColor: 'text-cyan-600' },
    { id: 'notas-fiscais', iconName: 'Receipt' as const, href: '/notas-fiscais', color: 'bg-violet-50', accentColor: 'text-violet-600' },
    { id: 'consumo-analise', iconName: 'TrendingUp' as const, href: '/consumo-analise', color: 'bg-blue-50', accentColor: 'text-blue-600' },
    { id: 'custo-analise', iconName: 'DollarSign' as const, href: '/custo-analise', color: 'bg-emerald-50', accentColor: 'text-emerald-600' },
    { id: 'estoque', iconName: 'Warehouse' as const, href: '/estoque', color: 'bg-red-50', accentColor: 'text-red-600' },
    { id: 'compras', iconName: 'ShoppingCart' as const, href: '/compras', color: 'bg-indigo-50', accentColor: 'text-indigo-600' },
    { id: 'alertas', iconName: 'AlertCircle' as const, href: '/alertas', color: 'bg-yellow-50', accentColor: 'text-yellow-600' },
    { id: 'cmv', iconName: 'DollarSign' as const, href: '/cmv', color: 'bg-emerald-50', accentColor: 'text-emerald-600' },
    { id: 'desperdicio', iconName: 'AlertCircle' as const, href: '/desperdicio', color: 'bg-red-50', accentColor: 'text-red-600' },
    { id: 'engenharia-cardapio', iconName: 'TrendingUp' as const, href: '/engenharia-cardapio', color: 'bg-purple-50', accentColor: 'text-purple-600' },
    { id: 'contagem', iconName: 'Package' as const, href: '/contagem', color: 'bg-blue-50', accentColor: 'text-blue-600' },
    { id: 'vendas-rapidas', iconName: 'CreditCard' as const, href: '/vendas-rapidas', color: 'bg-orange-50', accentColor: 'text-orange-600' },
    { id: 'previsoes-demanda', iconName: 'TrendingUp' as const, href: '/previsoes-demanda', color: 'bg-pink-50', accentColor: 'text-pink-600' },
    { id: 'relatorios', iconName: 'FileText' as const, href: '/relatorios', color: 'bg-green-50', accentColor: 'text-green-600' },
    { id: 'crm', iconName: 'Users' as const, href: '/dashboard/crm', color: 'bg-emerald-50', accentColor: 'text-emerald-600' },
    { id: 'loyalty', iconName: 'Gift' as const, href: '/dashboard/loyalty', color: 'bg-purple-50', accentColor: 'text-purple-600' },
    { id: 'alertas-inteligentes', iconName: 'Bell' as const, href: '/alertas-inteligentes', color: 'bg-red-50', accentColor: 'text-red-600' },
    { id: 'settings-pos', iconName: 'Settings' as const, href: '/settings/pos', color: 'bg-gray-50', accentColor: 'text-gray-600' },
    { id: 'survey', iconName: 'MessageSquare' as const, href: '/survey', color: 'bg-blue-50', accentColor: 'text-blue-600' },
    { id: 'survey-analytics', iconName: 'BarChart3' as const, href: '/dashboard/survey-analytics', color: 'bg-indigo-50', accentColor: 'text-indigo-600' },
    { id: 'email-campaigns', iconName: 'Mail' as const, href: '/dashboard/email-campaigns', color: 'bg-pink-50', accentColor: 'text-pink-600' },
    { id: 'tutorial', iconName: 'BookOpen' as const, href: '/tutorial', color: 'bg-cyan-50', accentColor: 'text-cyan-600' },
    { id: 'partnerships', iconName: 'Handshake' as const, href: '/partnerships', color: 'bg-amber-50', accentColor: 'text-amber-600' },
    { id: 'beta-testers', iconName: 'Users' as const, href: '/beta-testers', color: 'bg-violet-50', accentColor: 'text-violet-600' },
    { id: 'monitoring', iconName: 'BarChart3' as const, href: '/dashboard/monitoring', color: 'bg-cyan-50', accentColor: 'text-cyan-600' },
    { id: 'kds', iconName: 'Zap' as const, href: '/admin/kds', color: 'bg-red-50', accentColor: 'text-red-600' },
    { id: 'financeiro', iconName: 'TrendingUp' as const, href: '/dashboard/financeiro', color: 'bg-cyan-50', accentColor: 'text-cyan-600' },
    { id: 'dre', iconName: 'FileText' as const, href: '/dashboard/financeiro/dre', color: 'bg-emerald-50', accentColor: 'text-emerald-600' },
    { id: 'desperdicio-relatorio', iconName: 'Trash2' as const, href: '/admin/desperdicio-relatorio', color: 'bg-red-50', accentColor: 'text-red-600' },
    { id: 'agendamento', iconName: 'Clock' as const, href: '/admin/agendamento', color: 'bg-blue-50', accentColor: 'text-blue-600' },
    { id: 'fornecedores-painel', iconName: 'Truck' as const, href: '/admin/fornecedores-painel', color: 'bg-indigo-50', accentColor: 'text-indigo-600' },
    { id: 'alertas-smart', iconName: 'BellRing' as const, href: '/admin/alertas-smart', color: 'bg-amber-50', accentColor: 'text-amber-600' },
    { id: 'multi-unidade', iconName: 'Building2' as const, href: '/admin/multi-unidade', color: 'bg-violet-50', accentColor: 'text-violet-600' },
    { id: 'indicacao', iconName: 'UserPlus' as const, href: '/admin/indicacao', color: 'bg-pink-50', accentColor: 'text-pink-600' },
    { id: 'cardapio-sazonal', iconName: 'CalendarDays' as const, href: '/admin/cardapio-sazonal', color: 'bg-teal-50', accentColor: 'text-teal-600' },
    { id: 'performance-equipe', iconName: 'Activity' as const, href: '/admin/performance-equipe', color: 'bg-emerald-50', accentColor: 'text-emerald-600' },
    { id: 'suporte-ia', iconName: 'Bot' as const, href: '/suporte/ia', color: 'bg-blue-50', accentColor: 'text-blue-600' },
    { id: 'ia-monitoring', iconName: 'ShieldAlert' as const, href: '/admin/ia-monitoring', color: 'bg-rose-50', accentColor: 'text-rose-600' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50">
      {/* Header */}
      <DashboardHeader userName={user.name || user.email || ''} userRole={user.role || ''} />

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <AlertsBanner />
        <Suspense fallback={<DashboardAlertsLoadingSkeleton />}>
          {restaurantId ? (
            <DashboardFullContent criticalData={critical} modules={modules} restaurantId={restaurantId} />
          ) : (
            <DashboardContent
              ingredientCount={0}
              recipeCount={0}
              recentPlans={[]}
              recentAlerts={[]}
              lowStockCount={0}
              modules={modules}
            />
          )}
        </Suspense>
      </main>
    </div>
  );
}