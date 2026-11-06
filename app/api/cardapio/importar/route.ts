import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { prisma } from '@/lib/prisma';
import { exampleMenuItemIds } from '@/lib/ai/drafts/service';
import { blockedSourceMessage, parseMenuPage } from '@/lib/cardapio/import/parse';
import { fetchStorePage } from '@/lib/cardapio/import/fetch-page';
import { applyImport, validateImport } from '@/lib/cardapio/import/apply';
import { takeRead } from '@/lib/cardapio/import/read-limit';

export const dynamic = 'force-dynamic';

const ROLES = [...MANAGER_ROLES, 'ADMIN' as const];
const DENIED = 'Importar o cardápio é com o dono ou o gerente';
const NO_STORE = { 'Cache-Control': 'no-store' };

/** GET - whether the account still has the sign-up example menu (the "tirar o exemplo" box) */
export async function GET() {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  const ids = await exampleMenuItemIds(prisma, auth.member.restaurantId);
  return NextResponse.json({ hasExample: ids.length > 0 }, { headers: NO_STORE });
}

/** POST { action: 'ler', url } reads the page (nothing written); { action: 'importar', ... } writes the reviewed menu */
export async function POST(req: NextRequest) {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));

  if (body?.action === 'ler') {
    const raw = typeof body.url === 'string' ? body.url.trim() : '';
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return NextResponse.json({ error: 'Cole o link da página de pedidos da sua loja.' }, { status: 400 });
    }
    const blocked = blockedSourceMessage(url);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 422 });
    if (!takeRead(auth.member.restaurantId)) {
      return NextResponse.json({ error: 'Muitas leituras na última hora. Tente de novo mais tarde.' }, { status: 429 });
    }
    const page = await fetchStorePage(url.toString());
    if (!page.ok) return NextResponse.json({ error: page.error }, { status: 422 });
    const parsed = parseMenuPage(page.html);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
    return NextResponse.json(parsed.menu, { headers: NO_STORE });
  }

  if (body?.action === 'importar') {
    const v = validateImport(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const result = await applyImport(auth.member, v.value);
    return NextResponse.json(result, { headers: NO_STORE });
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
