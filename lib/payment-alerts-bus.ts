// @ts-nocheck
/**
 * Payment Alerts In-Memory Event Bus
 *
 * A lightweight Node.js EventEmitter used to fan-out newly created payment
 * alerts to all connected SSE clients.
 *
 * NOTE: This runs per-process. For multi-instance deployments a Redis PubSub
 * adapter can be swapped in here without touching any consumer code.
 */
import { EventEmitter } from 'events';

export type PaymentAlertEvent =
  | {
      type: 'alert.created';
      payload: {
        id: string;
        alertType:
          | 'chargeback'
          | 'failure'
          | 'refund'
          | 'dispute'
          | 'settlement_delay'
          | 'approved'
          | 'pending';
        severity: 'low' | 'medium' | 'high' | 'critical';
        title: string;
        message: string;
        paymentId: string | null;
        gateway: string | null;
        amount: number;
        createdAt: string;
        read: boolean;
      };
    }
  | { type: 'alert.read'; payload: { id: string } }
  | { type: 'alert.deleted'; payload: { id: string } }
  | { type: 'ping'; payload: { ts: number } };

declare global {
  // eslint-disable-next-line no-var
  var __paymentAlertsBus__: EventEmitter | undefined;
}

if (!globalThis.__paymentAlertsBus__) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(1000);
  globalThis.__paymentAlertsBus__ = emitter;
}

export const paymentAlertsBus: EventEmitter = globalThis.__paymentAlertsBus__!;

export function publishAlertEvent(event: PaymentAlertEvent) {
  paymentAlertsBus.emit('payment-alert', event);
}

export function subscribeAlertEvents(handler: (e: PaymentAlertEvent) => void) {
  paymentAlertsBus.on('payment-alert', handler);
  return () => paymentAlertsBus.off('payment-alert', handler);
}
