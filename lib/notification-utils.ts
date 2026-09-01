// @ts-nocheck
import { prisma } from './prisma';
import { NotificationType, NotificationSeverity } from '@prisma/client';

export interface CreateNotificationInput {
  userId?: string;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  data?: any;
  actionUrl?: string;
  actionLabel?: string;
}

/**
 * Create a new notification
 */
export async function createNotification(input: CreateNotificationInput) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        severity: input.severity || NotificationSeverity.MEDIUM,
        title: input.title,
        message: input.message,
        data: input.data,
        actionUrl: input.actionUrl,
        actionLabel: input.actionLabel,
      },
    });
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Create notifications for multiple users
 */
export async function createNotificationForUsers(
  userIds: string[],
  input: Omit<CreateNotificationInput, 'userId'>
) {
  try {
    const notifications = await Promise.all(
      userIds.map((userId) =>
        createNotification({
          ...input,
          userId,
        })
      )
    );
    return notifications;
  } catch (error) {
    console.error('Error creating notifications for users:', error);
    throw error;
  }
}

/**
 * Stock alert notifications
 */
export async function notifyLowStock(
  ingredientId: string,
  ingredientName: string,
  currentQuantity: number,
  minimumStock: number,
  userIds?: string[]
) {
  const severity =
    currentQuantity === 0 ? NotificationSeverity.CRITICAL : NotificationSeverity.HIGH;

  if (userIds && userIds.length > 0) {
    return createNotificationForUsers(userIds, {
      type: NotificationType.STOCK_LOW,
      severity,
      title: `Estoque Baixo: ${ingredientName}`,
      message: `Quantidade atual: ${currentQuantity}. Mínimo recomendado: ${minimumStock}`,
      data: { ingredientId, currentQuantity, minimumStock },
      actionUrl: `/insumos`,
      actionLabel: 'Ver Estoque',
    });
  }
}

/**
 * Order/Transaction notifications
 */
export async function notifyNewOrder(
  orderId: string,
  orderNumber: string,
  totalItems: number,
  userIds?: string[]
) {
  if (userIds && userIds.length > 0) {
    return createNotificationForUsers(userIds, {
      type: NotificationType.ORDER_RECEIVED,
      severity: NotificationSeverity.HIGH,
      title: `Novo Pedido: #${orderNumber}`,
      message: `${totalItems} item${totalItems !== 1 ? 'ns' : ''} recebido${totalItems !== 1 ? 's' : ''}`,
      data: { orderId, orderNumber, totalItems },
      actionUrl: `/kds`,
      actionLabel: 'Ver Cozinha',
    });
  }
}

export async function notifyOrderReady(
  orderId: string,
  orderNumber: string,
  userIds?: string[]
) {
  if (userIds && userIds.length > 0) {
    return createNotificationForUsers(userIds, {
      type: NotificationType.ORDER_READY,
      severity: NotificationSeverity.HIGH,
      title: `Pedido Pronto: #${orderNumber}`,
      message: 'Pedido está pronto para entrega/servir',
      data: { orderId, orderNumber },
      actionUrl: `/kds`,
      actionLabel: 'Ver Detalhes',
    });
  }
}

export async function notifyPaymentReceived(
  paymentId: string,
  amount: number,
  method: string,
  userIds?: string[]
) {
  if (userIds && userIds.length > 0) {
    const formattedAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);

    return createNotificationForUsers(userIds, {
      type: NotificationType.PAYMENT_RECEIVED,
      severity: NotificationSeverity.MEDIUM,
      title: 'Pagamento Recebido',
      message: `${formattedAmount} via ${method}`,
      data: { paymentId, amount, method },
      actionUrl: `/dashboard/financeiro`,
      actionLabel: 'Ver Financeiro',
    });
  }
}

export async function notifyPaymentFailed(
  paymentId: string,
  amount: number,
  reason: string,
  userIds?: string[]
) {
  if (userIds && userIds.length > 0) {
    const formattedAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);

    return createNotificationForUsers(userIds, {
      type: NotificationType.PAYMENT_FAILED,
      severity: NotificationSeverity.CRITICAL,
      title: 'Falha no Pagamento',
      message: `${formattedAmount} - ${reason}`,
      data: { paymentId, amount, reason },
      actionUrl: `/dashboard/financeiro`,
      actionLabel: 'Revisar',
    });
  }
}

/**
 * Staff presence notifications
 */
export async function notifyStaffClockIn(
  staffName: string,
  staffId: string,
  userIds?: string[]
) {
  if (userIds && userIds.length > 0) {
    return createNotificationForUsers(userIds, {
      type: NotificationType.STAFF_CLOCKED_IN,
      severity: NotificationSeverity.LOW,
      title: `${staffName} Registrou Entrada`,
      message: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      data: { staffId },
      actionUrl: `/admin/staff`,
      actionLabel: 'Ver Staff',
    });
  }
}

export async function notifyStaffAbsent(
  staffName: string,
  staffId: string,
  shiftTime: string,
  userIds?: string[]
) {
  if (userIds && userIds.length > 0) {
    return createNotificationForUsers(userIds, {
      type: NotificationType.STAFF_ABSENT,
      severity: NotificationSeverity.HIGH,
      title: `${staffName} Ausente`,
      message: `Falta na entrada programada às ${shiftTime}`,
      data: { staffId },
      actionUrl: `/admin/staff`,
      actionLabel: 'Ver Staff',
    });
  }
}

/**
 * Admin operation notifications
 */
export async function notifyAdminUserCreated(
  userName: string,
  userEmail: string,
  userRole: string,
  createdBy: string,
  userIds?: string[]
) {
  if (userIds && userIds.length > 0) {
    return createNotificationForUsers(userIds, {
      type: NotificationType.ADMIN_USER_CREATED,
      severity: NotificationSeverity.MEDIUM,
      title: 'Novo Usuário Criado',
      message: `${userName} (${userEmail}) - Função: ${userRole}`,
      data: { userName, userEmail, userRole, createdBy },
      actionUrl: `/admin/users`,
      actionLabel: 'Ver Usuários',
    });
  }
}

export async function notifyAdminUserDeleted(
  userName: string,
  userEmail: string,
  deletedBy: string,
  userIds?: string[]
) {
  if (userIds && userIds.length > 0) {
    return createNotificationForUsers(userIds, {
      type: NotificationType.ADMIN_USER_DELETED,
      severity: NotificationSeverity.HIGH,
      title: 'Usuário Deletado',
      message: `${userName} (${userEmail})`,
      data: { userName, userEmail, deletedBy },
      actionUrl: `/admin/users`,
      actionLabel: 'Ver Usuários',
    });
  }
}

export async function notifyAdminRoleChanged(
  userName: string,
  oldRole: string,
  newRole: string,
  changedBy: string,
  userIds?: string[]
) {
  if (userIds && userIds.length > 0) {
    return createNotificationForUsers(userIds, {
      type: NotificationType.ADMIN_ROLE_CHANGED,
      severity: NotificationSeverity.HIGH,
      title: 'Função do Usuário Alterada',
      message: `${userName}: ${oldRole} → ${newRole}`,
      data: { userName, oldRole, newRole, changedBy },
      actionUrl: `/admin/users`,
      actionLabel: 'Ver Detalhes',
    });
  }
}

export async function notifyAdminPriceChanged(
  recipeName: string,
  oldPrice: number,
  newPrice: number,
  changedBy: string,
  userIds?: string[]
) {
  if (userIds && userIds.length > 0) {
    const oldFormatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(oldPrice);
    const newFormatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(newPrice);

    return createNotificationForUsers(userIds, {
      type: NotificationType.ADMIN_PRICE_CHANGED,
      severity: NotificationSeverity.MEDIUM,
      title: 'Preço Alterado',
      message: `${recipeName}: ${oldFormatted} → ${newFormatted}`,
      data: { recipeName, oldPrice, newPrice, changedBy },
      actionUrl: `/receitas`,
      actionLabel: 'Ver Receitas',
    });
  }
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string) {
  return prisma.notification.update({
    where: { id: notificationId },
    data: {
      read: true,
      readAt: new Date(),
    },
  });
}

/**
 * Mark all notifications as read for a user, scoped to one restaurant (a
 * user can belong to more than one - marking read in restaurant A must not
 * touch unread notifications in restaurant B).
 */
export async function markAllAsRead(userId: string, restaurantId: string) {
  return prisma.notification.updateMany({
    where: { userId, restaurantId, read: false },
    data: {
      read: true,
      readAt: new Date(),
    },
  });
}

/**
 * Archive notification
 */
export async function archiveNotification(notificationId: string) {
  return prisma.notification.update({
    where: { id: notificationId },
    data: {
      archived: true,
      archivedAt: new Date(),
    },
  });
}

/**
 * Archive all read notifications for a user, scoped to one restaurant (same
 * reasoning as markAllAsRead - a user can belong to more than one).
 */
export async function archiveReadNotifications(userId: string, restaurantId: string) {
  return prisma.notification.updateMany({
    where: { userId, restaurantId, read: true, archived: false },
    data: {
      archived: true,
      archivedAt: new Date(),
    },
  });
}

/**
 * Get unread count for a user
 */
export async function getUnreadCount(userId: string) {
  return prisma.notification.count({
    where: { userId, read: false, archived: false },
  });
}

/**
 * Get recent notifications for a user
 */
export async function getRecentNotifications(
  userId: string,
  limit: number = 10,
  includeArchived: boolean = false
) {
  return prisma.notification.findMany({
    where: { userId, archived: includeArchived ? undefined : false },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
