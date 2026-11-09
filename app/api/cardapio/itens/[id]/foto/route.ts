import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { PhotoError, removeProductPhoto, setProductPhoto } from '@/lib/cardapio/product-photo';
import { MAX_PHOTO_BYTES } from '@/lib/storage/photos';

export const dynamic = 'force-dynamic';

const BAD_FILE = 'Não deu para abrir esta foto. Tente uma foto em JPG ou PNG.';

function fail(error: unknown) {
  if (error instanceof PhotoError) {
    switch (error.code) {
      case 'not_found':
        return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });
      case 'bad_type':
        return NextResponse.json({ error: BAD_FILE }, { status: 400 });
      case 'too_big':
        return NextResponse.json({ error: 'A foto ficou grande demais. Tente outra foto.' }, { status: 413 });
      case 'disabled':
        return NextResponse.json({ error: 'Envio de fotos ainda não está disponível' }, { status: 503 });
      default:
        return NextResponse.json({ error: 'Não foi possível salvar a foto. Tente de novo.' }, { status: 502 });
    }
  }
  console.error('[cardapio] photo route error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const check = await requireRestaurantRole(MANAGER_ROLES, 'Alterar o cardápio exige um gerente');
    if (!check.ok) return check.response;

    let file: unknown = null;
    try {
      file = (await req.formData()).get('foto');
    } catch {
      file = null;
    }
    if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') {
      return NextResponse.json({ error: BAD_FILE }, { status: 400 });
    }
    const blob = file as Blob;
    if (blob.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: 'A foto ficou grande demais. Tente outra foto.' }, { status: 413 });
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const saved = await setProductPhoto(check.member.restaurantId, params.id, bytes);
    return NextResponse.json(saved);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const check = await requireRestaurantRole(MANAGER_ROLES, 'Alterar o cardápio exige um gerente');
    if (!check.ok) return check.response;
    await removeProductPhoto(check.member.restaurantId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
