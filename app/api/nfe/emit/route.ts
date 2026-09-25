import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { emitNFCeForSession } from '@/lib/nfe/emit-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nfe/emit
 * Emite (ou reenvia, se rejeitada) a NFC-e de uma comanda. Regras em lib/nfe/emit-session.ts.
 *
 * Body: { orderSessionId, customerCPF?, customerName?, customerEmail?, paymentMethod? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 400 });
    }

    const body = await request.json();
    const { orderSessionId, customerCPF, customerName, customerEmail, paymentMethod } = body || {};
    if (!orderSessionId) {
      return NextResponse.json({ error: 'orderSessionId obrigatório' }, { status: 400 });
    }

    const outcome = await emitNFCeForSession({
      restaurantId,
      orderSessionId,
      customerCPF,
      customerName,
      customerEmail,
      paymentMethod,
    });
    return NextResponse.json(outcome.body, { status: outcome.httpStatus });
  } catch (error: any) {
    console.error('Erro ao emitir NFC-e:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao emitir NFC-e' },
      { status: 500 }
    );
  }
}
