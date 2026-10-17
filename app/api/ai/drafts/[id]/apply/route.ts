import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { applyDraft } from '@/lib/ai/drafts/apply';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/ai/drafts/[id]/apply { payload, removeExample? } - confirm a reviewed draft once (spec §4.5) */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...MANAGER_ROLES, 'ADMIN'], 'A implantação é do dono e do gerente');
  if (!auth.ok) return auth.response;
  const r = await applyDraft(auth.member, params.id, await req.json().catch(() => ({})));
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
