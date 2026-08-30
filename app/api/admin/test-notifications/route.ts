// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createNotification } from '@/lib/notification-utils';
import { NotificationType, NotificationSeverity } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;

  try {
    const testNotifications = [
      {
        type: NotificationType.STOCK_LOW,
        severity: NotificationSeverity.HIGH,
        title: 'Estoque Baixo: Óleo de Soja',
        message: 'Quantidade atual: 2.5L. Mínimo recomendado: 10L',
        actionUrl: '/insumos',
        actionLabel: 'Ver Estoque',
      },
      {
        type: NotificationType.ORDER_RECEIVED,
        severity: NotificationSeverity.HIGH,
        title: 'Novo Pedido: #1234',
        message: '3 itens recebidos',
        actionUrl: '/kds',
        actionLabel: 'Ver Cozinha',
      },
      {
        type: NotificationType.PAYMENT_RECEIVED,
        severity: NotificationSeverity.MEDIUM,
        title: 'Pagamento Recebido',
        message: 'R$ 250,00 via Débito',
        actionUrl: '/dashboard/financeiro',
        actionLabel: 'Ver Financeiro',
      },
      {
        type: NotificationType.STAFF_CLOCKED_IN,
        severity: NotificationSeverity.LOW,
        title: 'João Silva Registrou Entrada',
        message: '09:30',
        actionUrl: '/admin/staff',
        actionLabel: 'Ver Staff',
      },
      {
        type: NotificationType.ADMIN_USER_CREATED,
        severity: NotificationSeverity.MEDIUM,
        title: 'Novo Usuário Criado',
        message: 'Maria Santos (maria@email.com) - Função: MANAGER',
        actionUrl: '/admin/users',
        actionLabel: 'Ver Usuários',
      },
    ];

    const created = await Promise.all(
      testNotifications.map((notif) =>
        createNotification({
          userId,
          ...notif,
        })
      )
    );

    return NextResponse.json({
      success: true,
      message: 'Test notifications created successfully',
      notifications: created,
    });
  } catch (error) {
    console.error('Error creating test notifications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
