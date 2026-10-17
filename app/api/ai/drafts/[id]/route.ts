import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { loadDraft } from '@/lib/ai/drafts/service';

export const dynamic = 'force-dynamic';

/** GET /api/ai/drafts/[id] - draft + marks for the review screen (spec 2026-10-17 ia-implantacao §4.4) */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...MANAGER_ROLES, 'ADMIN'], 'A implantação é do dono e do gerente');
  if (!auth.ok) return auth.response;
  const d = await loadDraft(auth.member, params.id);
  if (!d) return NextResponse.json({ error: 'Rascunho não encontrado' }, { status: 404 });
  return NextResponse.json(d, { headers: { 'Cache-Control': 'no-store' } });
}
