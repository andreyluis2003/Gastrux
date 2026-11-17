import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError } from '@/lib/caixa/rules';
import { cashErrorResponse } from '@/lib/caixa/http';
import { lockComanda } from '@/lib/comanda/add-item';
import { loadBill } from '@/lib/comanda/bill-service';
import { resolveDispatchDriver } from '@/lib/delivery/drivers';

export const dynamic = 'force-dynamic';

/**
 * POST { driverId? , driverName? } - "Saiu para entrega" of a WhatsApp delivery comanda (spec 2026-11-17 entregadores):
 * a registered driver or a typed name, and when it went out (the first time only). Changing the driver is allowed
 * until the driver is paid for it. Answers the bill, as the other comanda actions.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Saiu para entrega exige o caixa');
  if (!auth.ok) return auth.response;
  const { member } = auth;
  const { restaurantId } = member;
  const body = await req.json().catch(() => ({}));
  try {
    const chosen = await resolveDispatchDriver(restaurantId, { driverId: body?.driverId, driverName: body?.driverName });
    if (!chosen.driverName) throw new CashRuleError('Escolha o entregador ou digite o nome');
    await prisma.$transaction(async (tx) => {
      await lockComanda(tx, params.id);
      const s = await tx.orderSession.findFirst({
        where: { id: params.id, restaurantId },
        select: { id: true, status: true, dispatchedAt: true, driverPaymentId: true, whatsappConversation: { select: { orderType: true } } },
      });
      if (!s) throw new CashRuleError('Comanda não encontrada', 404);
      if (s.whatsappConversation?.orderType !== 'DELIVERY') throw new CashRuleError('Esta comanda não é de entrega', 422);
      if (s.status === 'CANCELLED') throw new CashRuleError('Esta comanda foi cancelada', 422);
      if (s.driverPaymentId) throw new CashRuleError('Esta entrega já foi paga ao entregador', 409);
      await tx.orderSession.update({
        where: { id: s.id },
        data: { driverId: chosen.driverId, driverName: chosen.driverName, ...(s.dispatchedAt ? {} : { dispatchedAt: new Date() }) },
      });
    });
    await recordAudit(member, {
      action: 'UPDATE', entityType: 'OrderSession', entityId: params.id,
      changes: { dispatch: { driverId: chosen.driverId, driverName: chosen.driverName } },
    });
    return NextResponse.json(await loadBill(prisma, restaurantId, params.id));
  } catch (e) {
    return cashErrorResponse(e, 'dispatch comanda');
  }
}
