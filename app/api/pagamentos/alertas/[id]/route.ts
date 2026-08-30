// @ts-nocheck
/**
 * /api/pagamentos/alertas/[id]
 *
 * PATCH  - Mark alert as read / unread
 * DELETE - Archive the alert (soft delete)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { publishAlertEvent } from '@/lib/payment-alerts-bus';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { read } = body || {};

    const updated = await prisma.notification.update({
      where: { id: params.id },
      data: {
        read: read === false ? false : true,
        readAt: read === false ? null : new Date(),
      },
    });

    publishAlertEvent({ type: 'alert.read', payload: { id: params.id } });

    return NextResponse.json({ success: true, alert: updated });
  } catch (error: any) {
    console.error('[PATCH /api/pagamentos/alertas/:id] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error?.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await prisma.notification.update({
      where: { id: params.id },
      data: { archived: true, archivedAt: new Date() },
    });

    publishAlertEvent({ type: 'alert.deleted', payload: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[DELETE /api/pagamentos/alertas/:id] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error?.message },
      { status: 500 }
    );
  }
}
