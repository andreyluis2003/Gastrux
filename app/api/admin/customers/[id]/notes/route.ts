import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST { text }: a note of the Gastrux team about this client (a call, a promise, context) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { response, user } = await requirePlatformAdmin();
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'Escreva a anotação' }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: 'Anotação longa demais (máx. 4000 caracteres)' }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!restaurant) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

  const note = await prisma.platformClientNote.create({
    data: { restaurantId: params.id, authorEmail: user?.email || 'equipe', text },
  });
  return NextResponse.json(note, { status: 201 });
}

/** DELETE ?noteId=: removes a note written by mistake */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { response } = await requirePlatformAdmin();
  if (response) return response;
  const noteId = req.nextUrl.searchParams.get('noteId');
  if (!noteId) return NextResponse.json({ error: 'Anotação não informada' }, { status: 400 });
  const { count } = await prisma.platformClientNote.deleteMany({ where: { id: noteId, restaurantId: params.id } });
  if (count === 0) return NextResponse.json({ error: 'Anotação não encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
