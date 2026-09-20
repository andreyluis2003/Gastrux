import { prisma } from '@/lib/prisma';
import { hasActiveConnection } from '@/lib/mercadopago-connect/connection-service';
import {
  DEFAULT_DELIVERY_PAYMENT_SETTINGS,
  buildPaymentOptions,
  type DeliveryPaymentOptions,
  type DeliveryPaymentSettingsData,
} from './choice';

function toData(row: {
  acceptCash: boolean;
  acceptCreditOnDelivery: boolean;
  acceptDebitOnDelivery: boolean;
  acceptVoucherOnDelivery: boolean;
  voucherBrands: string[];
}): DeliveryPaymentSettingsData {
  return {
    acceptCash: row.acceptCash,
    acceptCreditOnDelivery: row.acceptCreditOnDelivery,
    acceptDebitOnDelivery: row.acceptDebitOnDelivery,
    acceptVoucherOnDelivery: row.acceptVoucherOnDelivery,
    voucherBrands: row.voucherBrands,
  };
}

/** Settings a restaurant saved for what it accepts on delivery (defaults when it never did). */
export async function getDeliveryPaymentSettings(restaurantId: string): Promise<DeliveryPaymentSettingsData> {
  const row = await prisma.deliveryPaymentSettings.findUnique({ where: { restaurantId } });
  if (!row) return { ...DEFAULT_DELIVERY_PAYMENT_SETTINGS, voucherBrands: [] };
  return toData(row);
}

/** `data` must already be validated with `parseSettingsInput`. */
export async function saveDeliveryPaymentSettings(
  restaurantId: string,
  data: DeliveryPaymentSettingsData
): Promise<DeliveryPaymentSettingsData> {
  const row = await prisma.deliveryPaymentSettings.upsert({
    where: { restaurantId },
    create: { ...data, restaurantId },
    update: { ...data },
  });
  return toData(row);
}

/** What a customer may pick at checkout: the settings plus the Mercado Pago connection. */
export async function getDeliveryPaymentOptions(restaurantId: string): Promise<DeliveryPaymentOptions> {
  const [settings, connected] = await Promise.all([
    getDeliveryPaymentSettings(restaurantId),
    hasActiveConnection(restaurantId),
  ]);
  return buildPaymentOptions(settings, connected);
}
