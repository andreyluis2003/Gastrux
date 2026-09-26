import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { buildManualPixTarget } from '@/lib/mercadopago-connect/pix-target';
import { createPixForTarget, normalizePayer } from '@/lib/mercadopago-connect/pix-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pagamentos/mp/pix/manual - the dashboard's "PIX avulso".
 * Any signed-in staff member of the restaurant may charge an amount they type
 * (for example a cashier at the counter), so this deliberately does not
 * require an admin role. The restaurant ALWAYS comes from the session:
 * `restaurantId` or `orderId` in the body are ignored.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) || {};
    const built = buildManualPixTarget({ restaurantId, amount: body.amount, description: body.description });
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });

    const result = await createPixForTarget(
      built.target,
      normalizePayer({ payerEmail: body.payerEmail, payerName: body.payerName })
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ success: true, ...result.pix });
  } catch (error) {
    console.error('[PIX manual] Erro ao criar pagamento:', error);
    return NextResponse.json({ error: 'Erro ao gerar PIX' }, { status: 500 });
  }
}
