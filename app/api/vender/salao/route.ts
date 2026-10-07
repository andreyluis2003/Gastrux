import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { loadSalao } from '@/lib/vender/salao';

export const dynamic = 'force-dynamic';

/** GET /api/vender/salao: the Vender map (tables, open comandas, new delivery orders) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 403 });
  try {
    return NextResponse.json(await loadSalao(restaurantId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[vender/salao]', error);
    return NextResponse.json({ error: 'Erro ao carregar o salão' }, { status: 500 });
  }
}
