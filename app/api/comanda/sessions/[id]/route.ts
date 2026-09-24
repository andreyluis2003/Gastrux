// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { autoEmitNFCe } from '@/lib/nfe/emit-session';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

// GET /api/comanda/sessions/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    const orderSession = await prisma.orderSession.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        user: { select: { name: true } },
        table: { include: { section: { select: { name: true } } } },
        items: {
          include: {
            recipe: { select: { name: true, sellingPrice: true } },
            modifiers: { include: { modifier: { select: { name: true } } } },
          },
        },
        order: { select: { orderNumber: true, status: true } },
      },
    });

    if (!orderSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(orderSession);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PUT /api/comanda/sessions/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    const ownedSession = await prisma.orderSession.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true, status: true },
    });
    if (!ownedSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const { notes, customerName, status, customerCPF, paymentMethod } = await request.json();

    // A cancelled comanda stays cancelled; a closed one is only closed once (the note is issued once)
    if (status !== undefined && ownedSession.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Comanda cancelada não pode mudar de status' }, { status: 409 });
    }
    // Cancelling goes through DELETE (manager + reason + trace), never through a status update
    if (status === 'CANCELLED') {
      return NextResponse.json({ error: 'Para cancelar a comanda use o cancelamento (exige gerente e motivo)' }, { status: 400 });
    }
    // Reopening a closed bill (its note may be issued) is a manager decision, and it is recorded
    const reopening = status !== undefined && status !== 'CLOSED' && ownedSession.status === 'CLOSED';
    if (reopening) {
      const auth = await requireRestaurantRole(MANAGER_ROLES, 'Reabrir uma conta fechada exige um gerente');
      if (!auth.ok) return auth.response;
      await recordAudit(auth.member, {
        action: 'STATUS_CHANGE',
        entityType: 'OrderSession',
        entityId: params.id,
        changes: { from: 'CLOSED', to: status },
      });
    }
    const closing = status === 'CLOSED' && ownedSession.status !== 'CLOSED';

    const updated = await prisma.orderSession.update({
      where: { id: params.id },
      data: {
        notes: notes !== undefined ? notes : undefined,
        customerName: customerName !== undefined ? customerName : undefined,
        status: status !== undefined ? status : undefined,
      },
      include: {
        items: { include: { recipe: { select: { name: true, sellingPrice: true } } } },
      },
    });

    if (closing) {
      // Closing the bill issues the NFC-e when the restaurant enabled it (NFeConfig.autoIssueOnSale).
      // Never fails the close: a problem comes back as a message and leaves an alert for the manager.
      const nfce = await autoEmitNFCe({
        restaurantId,
        orderSessionId: params.id,
        customerCPF,
        customerName: customerName || updated.customerName,
        paymentMethod,
        onlyIfEnabled: true,
      });
      return NextResponse.json({ ...updated, nfce });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE /api/comanda/sessions/[id] - cancel the whole comanda.
// Market practice: a manager of this restaurant, with a reason, and it leaves a trace.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRestaurantRole(MANAGER_ROLES, 'Cancelar uma comanda exige um gerente');
    if (!auth.ok) return auth.response;
    const { member } = auth;

    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason ?? '').trim();
    if (reason.length < 3) {
      return NextResponse.json({ error: 'Informe o motivo do cancelamento' }, { status: 400 });
    }

    const ownedSession = await prisma.orderSession.findFirst({
      where: { id: params.id, restaurantId: member.restaurantId },
      include: { items: { select: { recipeId: true, quantity: true, price: true } } },
    });
    if (!ownedSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (ownedSession.status === 'CANCELLED') return NextResponse.json({ success: true, alreadyCancelled: true });

    await prisma.orderSession.update({
      where: { id: params.id },
      data: { status: 'CANCELLED' },
    });

    await recordAudit(member, {
      action: 'STATUS_CHANGE',
      entityType: 'OrderSession',
      entityId: params.id,
      changes: { from: ownedSession.status, to: 'CANCELLED', reason, items: ownedSession.items },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
