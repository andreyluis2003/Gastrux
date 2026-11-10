import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { acceptDispute, cancellationReasons, confirmOrder, dispatchOrder, readyToPickup, rejectDispute, requestCancellation, startPreparation } from '@/lib/ifood/client';
import * as ninetynine from '@/lib/ninetynine/client';
import { ninetynineCancelReasons, ninetynineReasonProblem } from '@/lib/ninetynine/reasons';
import { DeliveryOrderError } from './ingest';

/**
 * What Gastrux does to an order goes back to its platform (plan 2026-10-24 ifood, Task 4; 99Food: plan 2026-11-09
 * 99food, Task 5): one place for every platform. Any other origin (site, API) is a no-op.
 */
export type PlatformChange = 'confirm' | 'preparing' | 'ready' | 'dispatch' | { cancel: { code: string; reason: string } };

export type SyncedPlatform = 'ifood' | 'ninety_nine_food';

/** How the screens name each platform ("O iFood não recebeu…", "A 99Food não recebeu…") */
export const PLATFORM_WORDS: Record<SyncedPlatform, { name: string; The: string; the: string; of: string }> = {
  ifood: { name: 'iFood', The: 'O iFood', the: 'o iFood', of: 'do iFood' },
  ninety_nine_food: { name: '99Food', The: 'A 99Food', the: 'a 99Food', of: 'da 99Food' },
};

const synced = (platform: string | undefined | null): platform is SyncedPlatform => platform === 'ifood' || platform === 'ninety_nine_food';

async function platformOrder(externalOrderId: string) {
  return prisma.externalOrder.findUnique({
    where: { id: externalOrderId },
    select: { id: true, externalOrderId: true, status: true, platformData: true, integration: { select: { id: true, platform: true } } },
  });
}

type PlatformOrder = NonNullable<Awaited<ReturnType<typeof platformOrder>>>;

async function callIfood(ext: PlatformOrder, change: PlatformChange): Promise<boolean> {
  const integration = { id: ext.integration.id };
  const data = (ext.platformData ?? {}) as { deliveredBy?: string | null; orderType?: string };
  if (change === 'confirm') await confirmOrder(integration, ext.externalOrderId);
  else if (change === 'preparing') await startPreparation(integration, ext.externalOrderId);
  else if (change === 'ready') await readyToPickup(integration, ext.externalOrderId);
  else if (change === 'dispatch') {
    // Only the store's own delivery is dispatched by the store; iFood's couriers and takeouts are not
    if (data.orderType !== 'DELIVERY' || data.deliveredBy !== 'MERCHANT') return false;
    await dispatchOrder(integration, ext.externalOrderId);
  } else await requestCancellation(integration, ext.externalOrderId, { reason: change.cancel.reason, cancellationCode: change.cancel.code });
  return true;
}

/** Adds keys to an order's platformData in one statement, so an event updating it at the same time is not lost */
async function mergePlatformData(externalOrderId: string, patch: Record<string, unknown>): Promise<void> {
  await prisma.$executeRaw`UPDATE "external_orders" SET "platformData" = COALESCE("platformData", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb WHERE "id" = ${externalOrderId}`;
}

async function callNinetynine(ext: PlatformOrder, change: PlatformChange): Promise<boolean> {
  const id = ext.integration.id;
  const data = (ext.platformData ?? {}) as { deliveryType?: number; deliveredSentAt?: string };
  if (change === 'confirm') await ninetynine.confirmOrder(id, ext.externalOrderId);
  // 99Food has no "preparing" step
  else if (change === 'preparing') return false;
  else if (change === 'ready') await ninetynine.orderReady(id, ext.externalOrderId);
  else if (change === 'dispatch') {
    // 99Food's "delivered" means handed to the customer: sent once, when the order reaches Entregue, and only on the
    // store's own delivery (delivery_type 2); 99Food's couriers say it themselves
    if (Number(data.deliveryType) !== 2 || data.deliveredSentAt) return false;
    await ninetynine.orderDelivered(id, ext.externalOrderId);
    await mergePlatformData(ext.id, { deliveredSentAt: new Date().toISOString() });
  } else await ninetynine.cancelOrder(id, ext.externalOrderId, Number(change.cancel.code), change.cancel.reason || undefined);
  return true;
}

const changeName = (c: PlatformChange) => (typeof c === 'string' ? c : 'cancel');

/**
 * Never throws: a failure is logged on the order (the iFood poll or the 99Food sweep retries a missing confirm). A
 * 99Food confirm that keeps failing is logged once: the sweep retries it every 30 s while the 5 minutes last.
 */
export async function pushPlatformStatus(externalOrderId: string, change: PlatformChange): Promise<boolean> {
  const ext = await platformOrder(externalOrderId).catch(() => null);
  if (!ext || !synced(ext.integration.platform)) return true;
  const platform = ext.integration.platform;
  try {
    const sent = platform === 'ifood' ? await callIfood(ext, change) : await callNinetynine(ext, change);
    if (sent && change === 'confirm') await prisma.externalOrder.update({ where: { id: ext.id }, data: { platformConfirmedAt: new Date() } });
    return true;
  } catch (e: any) {
    const name = PLATFORM_WORDS[platform].name;
    const prefix = `${name} não recebeu "${changeName(change)}"`;
    if (platform === 'ninety_nine_food' && change === 'confirm') {
      const logged = await prisma.deliveryLog.findFirst({ where: { externalOrderId: ext.id, message: { startsWith: prefix } }, select: { id: true } }).catch(() => null);
      if (logged) return false;
    }
    console.error(`[platform-sync] ${name} ${changeName(change)} failed:`, e?.message ?? e);
    await prisma.deliveryLog.create({
      data: {
        externalOrderId: ext.id, eventType: 'STATUS_CHANGED', previousStatus: ext.status, newStatus: ext.status, eventTimestamp: new Date(),
        message: `${prefix}: ${String(e?.message ?? e).slice(0, 300)}`,
      },
    }).catch(() => {});
    return false;
  }
}

/** The platform an order talks back to (iFood, 99Food); null for the site and the API */
export async function platformOf(externalOrderId: string): Promise<SyncedPlatform | null> {
  const p = (await platformOrder(externalOrderId))?.integration.platform;
  return synced(p) ? p : null;
}

export async function isPlatformOrder(externalOrderId: string): Promise<boolean> {
  return (await platformOf(externalOrderId)) !== null;
}

/**
 * The reason a refusal or a cancel carries is one the platform takes: iFood checks its own codes; 99Food's list is
 * fixed (lib/ninetynine/reasons.ts) and "Outro motivo" needs a typed reason. Throws the screen's message.
 */
export function checkPlatformReason(platform: SyncedPlatform, platformData: unknown, code: string, reason: string): void {
  if (!code) throw new DeliveryOrderError(`Escolha o motivo ${PLATFORM_WORDS[platform].of}`);
  if (platform !== 'ninety_nine_food') return;
  const problem = ninetynineReasonProblem(code, reason, (platformData as { deliveryType?: number } | null)?.deliveryType);
  if (problem === 'reason') throw new DeliveryOrderError('Escolha o motivo da 99Food');
  if (problem === 'text') throw new DeliveryOrderError('Escreva o motivo');
}

/**
 * The restaurant cancels an accepted platform order (Pedidos de delivery, with a reason from the platform's list). The
 * kitchen order is cancelled when the platform's cancel event arrives (lib/ifood/events.ts, lib/ninetynine/events.ts).
 */
export async function cancelPlatformOrder(member: RestaurantMember, externalOrderId: string, why: { code: unknown; reason: unknown }): Promise<void> {
  const code = typeof why.code === 'string' ? why.code.trim() : '';
  const reason = typeof why.reason === 'string' ? why.reason.trim().slice(0, 200) : '';
  const ext = await prisma.externalOrder.findFirst({
    where: { id: externalOrderId, restaurantId: member.restaurantId },
    select: { id: true, status: true, platformData: true, integration: { select: { platform: true } } },
  });
  const platform: SyncedPlatform = ext?.integration.platform === 'ninety_nine_food' ? 'ninety_nine_food' : 'ifood';
  checkPlatformReason(platform, ext?.platformData ?? null, code, reason);
  if (!ext) throw new DeliveryOrderError('Pedido não encontrado', 404);
  if (ext.status === 'CANCELLED' || ext.status === 'REJECTED' || ext.status === 'DELIVERED') throw new DeliveryOrderError('Este pedido já foi concluído ou cancelado', 409);
  const ok = await pushPlatformStatus(ext.id, { cancel: { code, reason: reason || 'Cancelado pelo restaurante' } });
  if (!ok) throw new DeliveryOrderError(`${PLATFORM_WORDS[platform].The} não recebeu o cancelamento: tente de novo`, 502);
  await recordAudit(member, { action: 'UPDATE', entityType: 'ExternalOrder', entityId: ext.id, changes: { cancelRequested: code, reason } });
}

async function ownPlatformOrder(member: RestaurantMember, externalOrderId: string) {
  const ext = await prisma.externalOrder.findFirst({
    where: { id: externalOrderId, restaurantId: member.restaurantId },
    select: {
      id: true, externalOrderId: true, status: true, platformData: true, disputeId: true, disputeExpiresAt: true,
      integration: { select: { id: true, platform: true } },
    },
  });
  if (!ext) throw new DeliveryOrderError('Pedido não encontrado', 404);
  const platform = ext.integration.platform;
  if (!synced(platform)) throw new DeliveryOrderError('Este pedido não é do iFood nem da 99Food', 400);
  return { ...ext, platform };
}

/** The reasons the platform accepts to refuse or cancel this order (Pedidos de delivery asks one) */
export async function platformCancelReasons(member: RestaurantMember, externalOrderId: string): Promise<Array<{ cancelCodeId: string; description: string }>> {
  const ext = await ownPlatformOrder(member, externalOrderId);
  if (ext.platform === 'ninety_nine_food') return ninetynineCancelReasons((ext.platformData as { deliveryType?: number } | null)?.deliveryType);
  try {
    return await cancellationReasons({ id: ext.integration.id }, ext.externalOrderId);
  } catch (e: any) {
    throw new DeliveryOrderError(`O iFood não mandou os motivos: ${String(e?.message ?? e).slice(0, 200)}`, 502);
  }
}

type NinetynineDispute = { disputeKind?: 'cancel' | 'refund'; disputeReasons?: Array<{ base_reason_id?: unknown; base_reason?: unknown }> };

/**
 * The restaurant answers a customer's request. iFood: a cancel request (handshake dispute). 99Food: a cancel request
 * (orderCancelApply) or a refund request (orderRefundApply); refusing a refund needs one of the reasons 99Food sent
 * (`refuse.baseReasonId`). Accepting a cancel lets the platform cancel the order (its cancel event cancels the kitchen
 * order); rejecting keeps it going.
 */
export async function answerDispute(member: RestaurantMember, externalOrderId: string, answer: 'accept' | 'reject', refuse: { baseReasonId?: unknown } = {}): Promise<void> {
  const ext = await ownPlatformOrder(member, externalOrderId);
  const words = PLATFORM_WORDS[ext.platform];
  const disputeId = ext.disputeId;
  const refund = ext.platform === 'ninety_nine_food' && (ext.platformData as NinetynineDispute | null)?.disputeKind === 'refund';
  if (!disputeId) throw new DeliveryOrderError(`Este pedido não tem pedido de ${refund ? 'devolução' : 'cancelamento'} aberto`, 409);
  if (ext.disputeExpiresAt && ext.disputeExpiresAt.getTime() <= Date.now()) {
    throw new DeliveryOrderError(`O prazo para responder acabou: ${words.the} já decidiu este pedido`, 409);
  }
  const agree = answer === 'accept';
  let call: () => Promise<unknown>;
  if (ext.platform === 'ifood') {
    call = () => (agree ? acceptDispute : rejectDispute)({ id: ext.integration.id }, disputeId);
  } else {
    const data = (ext.platformData ?? {}) as NinetynineDispute;
    if (data.disputeKind === 'refund') {
      let reason: { baseReasonId: string; baseReason: string } | undefined;
      if (!agree) {
        const wanted = refuse.baseReasonId == null ? '' : String(refuse.baseReasonId).trim();
        const found = wanted ? (data.disputeReasons ?? []).find((r) => r?.base_reason_id != null && String(r.base_reason_id) === wanted) : undefined;
        if (!found) throw new DeliveryOrderError('Escolha o motivo da recusa');
        reason = { baseReasonId: wanted, baseReason: String(found.base_reason ?? '') };
      }
      call = () => ninetynine.answerRefundApply(ext.integration.id, ext.externalOrderId, disputeId, agree, reason);
    } else {
      call = () => ninetynine.answerCancelApply(ext.integration.id, ext.externalOrderId, disputeId, agree);
    }
  }
  try {
    await call();
  } catch (e: any) {
    throw new DeliveryOrderError(`${words.The} não recebeu a resposta: ${String(e?.message ?? e).slice(0, 200)}`, 502);
  }
  await prisma.externalOrder.update({ where: { id: ext.id }, data: { disputeId: null, disputeExpiresAt: null } });
  await recordAudit(member, { action: 'UPDATE', entityType: 'ExternalOrder', entityId: ext.id, changes: { dispute: answer, disputeId } });
}

const CASH_STATUSES = ['CONFIRMED', 'PREPARING', 'READY'];

/**
 * "Recebi o dinheiro" (plan 2026-11-09 99food, Task 5): on a cash order taken by 99Food's courier (delivery_type 1),
 * the store confirms it got the money from the courier (`payConfirm`), which 99Food asks for.
 */
export async function confirmCash(member: RestaurantMember, externalOrderId: string): Promise<void> {
  const ext = await ownPlatformOrder(member, externalOrderId);
  const data = (ext.platformData ?? {}) as { deliveryType?: number; payType?: number; cashConfirmedAt?: string };
  if (ext.platform !== 'ninety_nine_food' || Number(data.deliveryType) !== 1 || Number(data.payType) !== 2) {
    throw new DeliveryOrderError('Só pedidos da 99Food em dinheiro com entregador da 99Food', 400);
  }
  if (data.cashConfirmedAt) throw new DeliveryOrderError('O dinheiro deste pedido já foi confirmado', 409);
  if (!CASH_STATUSES.includes(ext.status)) throw new DeliveryOrderError('Confirme o dinheiro com o pedido aceito e ainda não entregue', 409);
  try {
    await ninetynine.confirmCashPayment(ext.integration.id, ext.externalOrderId);
  } catch (e: any) {
    throw new DeliveryOrderError(`A 99Food não recebeu a confirmação do dinheiro: ${String(e?.message ?? e).slice(0, 200)}`, 502);
  }
  await mergePlatformData(ext.id, { cashConfirmedAt: new Date().toISOString() });
  await prisma.deliveryLog.create({
    data: { externalOrderId: ext.id, eventType: 'STATUS_CHANGED', previousStatus: ext.status, newStatus: ext.status, eventTimestamp: new Date(), message: 'Dinheiro confirmado na 99Food' },
  }).catch(() => {});
  await recordAudit(member, { action: 'UPDATE', entityType: 'ExternalOrder', entityId: ext.id, changes: { cashConfirmed: true } });
}
