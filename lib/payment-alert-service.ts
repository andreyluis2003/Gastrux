// @ts-nocheck
/**
 * Payment Alert Service
 *
 * High-level helpers that:
 *   1. Persist a payment-related notification row via Prisma.
 *   2. Publish an event on the in-memory bus so every connected SSE client
 *      receives the alert in real time.
 *
 * Notification model reuse:
 *   - We keep using the existing Notification table (NotificationType +
 *     NotificationSeverity enums) to avoid a DB migration. The granular
 *     payment alert sub-type (chargeback, refund, dispute, etc.) is stored
 *     inside the `data` JSON field.
 */
import { prisma } from './prisma';
import { NotificationType, NotificationSeverity } from '@prisma/client';
import { publishAlertEvent } from './payment-alerts-bus';

export type PaymentAlertType =
  | 'chargeback'
  | 'failure'
  | 'refund'
  | 'dispute'
  | 'settlement_delay'
  | 'approved'
  | 'pending';

export interface CreatePaymentAlertInput {
  alertType: PaymentAlertType;
  title: string;
  message: string;
  paymentId?: string | null;
  gateway?: string | null;
  amount?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  restaurantId?: string | null;
  userId?: string | null;
  actionUrl?: string | null;
}

/**
 * Default severity per alert type.
 */
function defaultSeverity(type: PaymentAlertType): 'low' | 'medium' | 'high' | 'critical' {
  switch (type) {
    case 'chargeback':
      return 'critical';
    case 'dispute':
      return 'high';
    case 'failure':
      return 'high';
    case 'settlement_delay':
      return 'medium';
    case 'refund':
      return 'medium';
    case 'pending':
      return 'low';
    case 'approved':
    default:
      return 'low';
  }
}

function mapToNotificationType(type: PaymentAlertType): NotificationType {
  switch (type) {
    case 'approved':
      return NotificationType.PAYMENT_RECEIVED;
    case 'pending':
      return NotificationType.PAYMENT_PENDING;
    case 'refund':
    case 'failure':
    case 'chargeback':
    case 'dispute':
    case 'settlement_delay':
    default:
      return NotificationType.PAYMENT_FAILED;
  }
}

function mapToNotificationSeverity(s: 'low' | 'medium' | 'high' | 'critical'): NotificationSeverity {
  switch (s) {
    case 'critical':
      return NotificationSeverity.CRITICAL;
    case 'high':
      return NotificationSeverity.HIGH;
    case 'medium':
      return NotificationSeverity.MEDIUM;
    case 'low':
    default:
      return NotificationSeverity.LOW;
  }
}

/**
 * Create and broadcast a payment alert.
 *
 * Safe to call from webhook handlers — it never throws; all errors are
 * logged so webhook delivery cannot fail because of alerting.
 */
export async function createPaymentAlert(
  input: CreatePaymentAlertInput
): Promise<{ id: string } | null> {
  try {
    const severity = input.severity ?? defaultSeverity(input.alertType);
    const notifType = mapToNotificationType(input.alertType);
    const notifSeverity = mapToNotificationSeverity(severity);

    const notification = await prisma.notification.create({
      data: {
        type: notifType,
        severity: notifSeverity,
        title: input.title,
        message: input.message,
        restaurantId: input.restaurantId ?? null,
        userId: input.userId ?? null,
        data: {
          kind: 'payment_alert',
          alertType: input.alertType,
          paymentId: input.paymentId ?? null,
          gateway: input.gateway ?? null,
          amount: typeof input.amount === 'number' ? input.amount : 0,
        },
        actionUrl: input.actionUrl ?? '/dashboard/pagamentos/alertas',
        actionLabel: 'Ver Alerta',
      },
    });

    const event = {
      type: 'alert.created' as const,
      payload: {
        id: notification.id,
        alertType: input.alertType,
        severity,
        title: input.title,
        message: input.message,
        paymentId: input.paymentId ?? null,
        gateway: input.gateway ?? null,
        amount: typeof input.amount === 'number' ? input.amount : 0,
        createdAt: notification.createdAt.toISOString(),
        read: false,
      },
    };

    publishAlertEvent(event);

    return { id: notification.id };
  } catch (err) {
    console.error('[createPaymentAlert] Failed to create alert:', err);
    return null;
  }
}

/**
 * Convert a Notification row (of any payment-ish type) to the frontend alert shape.
 */
export function notificationToAlert(n: any) {
  const data = n.data || {};
  const alertType: PaymentAlertType =
    (data.alertType as PaymentAlertType) ||
    (n.type === 'PAYMENT_RECEIVED'
      ? 'approved'
      : n.type === 'PAYMENT_PENDING'
      ? 'pending'
      : 'failure');
  const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
  };
  return {
    id: n.id,
    alertType,
    severity: severityMap[n.severity] || 'medium',
    title: n.title,
    message: n.message,
    paymentId: data.paymentId ?? null,
    gateway: data.gateway ?? null,
    amount: typeof data.amount === 'number' ? data.amount : 0,
    createdAt: n.createdAt?.toISOString?.() || n.createdAt,
    read: n.read,
  };
}
