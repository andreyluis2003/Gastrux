import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { askQuestion } from '@/lib/ai/ask';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/ai/ask { question, history?, detailed? } - "Pergunte ao Gastrux" (spec 2026-10-16 ia-assistente) */
export async function POST(request: Request) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'ADMIN', 'CASHIER', 'COOK'], 'Sem acesso à IA');
  if (!auth.ok) return auth.response;
  const r = await askQuestion(auth.member, await request.json().catch(() => ({})));
  return NextResponse.json(r.body, { status: r.status });
}
