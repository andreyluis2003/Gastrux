import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { discardDraft } from '@/lib/ai/drafts/service';

export const dynamic = 'force-dynamic';

/** POST /api/ai/drafts/[id]/discard - the owner drops a draft (spec §4.4) */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...MANAGER_ROLES, 'ADMIN'], 'A implantação é do dono e do gerente');
  if (!auth.ok) return auth.response;
  const r = await discardDraft(auth.member, params.id);
  return NextResponse.json(r.body, { status: r.status });
}
