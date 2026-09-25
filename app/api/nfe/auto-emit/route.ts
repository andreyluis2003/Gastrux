import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { autoEmitNFCe } from '@/lib/nfe/emit-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nfe/auto-emit
 * Emissão da NFC-e de uma comanda sem falhar a venda: problemas voltam como mensagem (success: true)
 * e rejeições ficam como alerta para o gerente. Mesmas regras do botão manual (lib/nfe/emit-session.ts).
 * O fechamento da comanda (PUT /api/comanda/sessions/[id] com status CLOSED) já chama a mesma função.
 *
 * Body: { orderSessionId, customerCPF?, customerName?, paymentMethod? }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { orderSessionId, customerCPF, customerName, paymentMethod } = body || {};
  if (!orderSessionId) {
    return NextResponse.json({ error: 'orderSessionId obrigatório' }, { status: 400 });
  }

  const summary = await autoEmitNFCe({ restaurantId, orderSessionId, customerCPF, customerName, paymentMethod });
  return NextResponse.json({ success: true, nfce: summary.nfce, message: summary.message });
}
