// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const category = searchParams.get('category');

  const where: any = { restaurantId };
  if (status) where.status = status;
  if (category) where.category = category;

  const templates = await prisma.messageTemplate.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { campaigns: true } } },
  });

  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json();
  const {
    name,
    displayName,
    category,
    language,
    headerText,
    bodyText,
    footerText,
    buttons,
    variables,
  } = body || {};

  if (!name || !bodyText || !displayName) {
    return NextResponse.json({ error: 'name, displayName e bodyText são obrigatórios' }, { status: 400 });
  }
  const slug = String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');

  try {
    const tpl = await prisma.messageTemplate.create({
      data: {
        name: slug,
        displayName,
        category: category || 'UTILITY',
        language: language || 'pt_BR',
        headerText: headerText || null,
        bodyText,
        footerText: footerText || null,
        buttons: buttons || null,
        variables: variables || [],
        createdById: (auth.session.user as any)?.id || null,
      },
    });
    return NextResponse.json({ ok: true, template: tpl });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe template com este nome' }, { status: 409 });
    }
    throw err;
  }
}
