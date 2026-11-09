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
        return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
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

const BODY_CAP = MAX_PHOTO_BYTES + 64 * 1024;

// A body without Content-Length (chunked): count the bytes as they arrive and stop past the cap.
// Returns the collected bytes, or null when the body is over the cap.
async function readCapped(body: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > BODY_CAP) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const check = await requireRestaurantRole(MANAGER_ROLES, 'Alterar o cardápio exige um gerente');
    if (!check.ok) return check.response;

    // Refuse an oversized body before formData() buffers all of it
    const TOO_BIG = { error: 'A foto ficou grande demais. Tente outra foto.' };
    const declared = req.headers.get('content-length');
    if (Number(declared) > BODY_CAP) return NextResponse.json(TOO_BIG, { status: 413 });
    let source: Request = req;
    if (declared === null && req.body) {
      const collected = await readCapped(req.body);
      if (!collected) return NextResponse.json(TOO_BIG, { status: 413 });
      source = new Request(req.url, { method: 'POST', headers: req.headers, body: collected });
    }

    let file: unknown = null;
    try {
      file = (await source.formData()).get('foto');
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
