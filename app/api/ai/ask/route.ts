import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { askQuestion } from '@/lib/ai/ask';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;
const MAX_BODY = 8 * 1024 * 1024;
const TOO_BIG = () => NextResponse.json({ error: 'Arquivos grandes demais. Envie menos fotos ou um PDF menor.' }, { status: 413 });

/** POST /api/ai/ask { question, history?, detailed? } - "Pergunte ao Gastrux" (spec 2026-10-16 ia-assistente) */
export async function POST(request: Request) {
  // Photos and PDFs make big bodies: refuse over 8 MB before buffering or parsing (spec 2026-10-17 ia-implantacao §4.1)
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return TOO_BIG();
  const raw = await request.text();
  if (raw.length > MAX_BODY) return TOO_BIG();
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'ADMIN', 'CASHIER', 'COOK'], 'Sem acesso à IA');
  if (!auth.ok) return auth.response;
  let body: unknown = {};
  try { body = JSON.parse(raw); } catch { body = {}; }
  const r = await askQuestion(auth.member, body);
  return NextResponse.json(r.body, { status: r.status });
}
