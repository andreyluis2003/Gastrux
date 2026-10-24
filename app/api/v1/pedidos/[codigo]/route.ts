import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateOrderApiKey } from '@/lib/delivery-orders/api-keys';
import { publicStatus } from '@/lib/delivery-orders/status';

export const dynamic = 'force-dynamic';

/** GET /api/v1/pedidos/[codigo] - the status of an order sent with a key of this restaurant */
export async function GET(req: NextRequest, { params }: { params: { codigo: string } }) {
  const auth = await authenticateOrderApiKey(req.headers.get('authorization'));
  if (!auth) return NextResponse.json({ erro: 'Chave de API inválida' }, { status: 401 });
  const external = await prisma.externalOrder.findUnique({
    where: { restaurantId_externalOrderId: { restaurantId: auth.restaurantId, externalOrderId: params.codigo } },
    select: { externalOrderId: true, status: true, updatedAt: true, integrationId: true, internalOrder: { select: { status: true, updatedAt: true } } },
  });
  // Only the orders of the API: a code of the digital menu or of a platform is not this key's business
  if (!external || external.integrationId !== auth.integrationId) return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 });
  const updated = external.internalOrder && external.internalOrder.updatedAt > external.updatedAt ? external.internalOrder.updatedAt : external.updatedAt;
  return NextResponse.json({ codigo: external.externalOrderId, status: publicStatus(external.status, external.internalOrder?.status ?? null), atualizadoEm: updated.toISOString() });
}
