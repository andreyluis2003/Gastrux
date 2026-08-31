// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentRestaurantId: true },
    });

    if (!user?.currentRestaurantId) {
      return NextResponse.json({ error: 'No restaurant' }, { status: 400 });
    }

    const restaurantId = user.currentRestaurantId;

    // Check onboarding record
    const onboarding = await prisma.userOnboarding.findUnique({
      where: { userId },
    });

    // Parallel checks for actual completion
    const [restaurant, menuItemCount, tableCount, firstTable] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, email: true, phone: true, address: true },
      }),
      prisma.menuItem.count({
        where: { restaurantId },
      }),
      prisma.table.count({
        where: { restaurantId },
      }),
      prisma.table.findFirst({
        where: { restaurantId, qrToken: { not: null } },
        select: { id: true, number: true, qrToken: true, section: { select: { name: true } } },
        orderBy: { number: 'asc' },
      }),
    ]);

    // Count menu items via categories (MenuCategory is global, but items are linked)
    const menuCategories = await prisma.menuCategory.findMany({
      where: { active: true, restaurantId },
      include: { _count: { select: { items: true } } },
    });
    const totalMenuItems = menuCategories.reduce((sum, c) => sum + c._count.items, 0);

    const restaurantConfigured = !!(restaurant?.name && restaurant.name !== 'Meu Restaurante' && restaurant.name !== `Restaurante ${session.user.name}`);
    const menuReady = totalMenuItems > 0;
    const tablesReady = tableCount > 0;
    const qrReady = !!firstTable?.qrToken;

    const steps = [
      {
        id: 'configure-restaurant',
        title: 'Configure seu restaurante',
        description: 'Defina nome, endereço, telefone e logo do seu restaurante',
        completed: restaurantConfigured,
        link: '/admin/settings',
        linkLabel: 'Ir para Configurações',
        icon: 'settings',
      },
      {
        id: 'setup-menu',
        title: 'Confira o cardápio',
        description: menuReady
          ? `Você tem ${totalMenuItems} itens no cardápio. Adicione mais ou personalize!`
          : 'Adicione categorias e itens ao seu cardápio digital',
        completed: menuReady,
        link: '/admin/cardapio',
        linkLabel: menuReady ? 'Editar Cardápio' : 'Criar Cardápio',
        icon: 'menu',
      },
      {
        id: 'setup-tables',
        title: 'Organize suas mesas',
        description: tablesReady
          ? `Você tem ${tableCount} mesa(s) configurada(s). Adicione mais ou edite!`
          : 'Crie seções e mesas para seu restaurante',
        completed: tablesReady,
        link: '/admin/tables',
        linkLabel: tablesReady ? 'Gerenciar Mesas' : 'Criar Mesas',
        icon: 'table',
      },
      {
        id: 'test-qr',
        title: 'Teste o QR Code',
        description: qrReady
          ? `Mesa ${firstTable.number} (${firstTable.section.name}) tem QR Code pronto!`
          : 'Gere um QR Code para uma mesa e teste o pedido digital',
        completed: qrReady,
        link: qrReady ? `/admin/tables` : '/admin/tables',
        linkLabel: 'Ver QR Codes',
        icon: 'qr',
        qrToken: firstTable?.qrToken || null,
      },
    ];

    const completedCount = steps.filter((s) => s.completed).length;
    const totalSteps = steps.length;
    const allCompleted = completedCount === totalSteps;

    return NextResponse.json({
      steps,
      completedCount,
      totalSteps,
      allCompleted,
      isOnboardingDone: !!onboarding && (onboarding.completedAt !== null || onboarding.skippedAt !== null),
    });
  } catch (error) {
    console.error('Error fetching onboarding progress:', error);
    return NextResponse.json(
      { error: 'Erro ao obter progresso do onboarding' },
      { status: 500 }
    );
  }
}
