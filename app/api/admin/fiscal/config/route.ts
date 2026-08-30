import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const user = session.user as any;
  if (!['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'OWNER'].includes(user.role)) return null;
  const restaurantId = user.currentRestaurantId;
  if (!restaurantId) return null;
  return { session, restaurantId };
}

function maskKey(val: string | null | undefined): string | null {
  if (!val) return null;
  if (val.length <= 8) return '•'.repeat(val.length);
  return '••••••' + val.slice(-4);
}

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const config = await prisma.nFeConfig.findUnique({
    where: { restaurantId: ctx.restaurantId },
  });

  if (!config) {
    return NextResponse.json({ config: null });
  }

  return NextResponse.json({
    config: {
      ...config,
      nfeApiKey: maskKey(config.nfeApiKey),
      certificatePassword: config.certificatePassword ? '••••••' : null,
    },
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();

  if (!body.cnpj) {
    return NextResponse.json({ error: 'CNPJ é obrigatório' }, { status: 400 });
  }

  // Check existing
  const existing = await prisma.nFeConfig.findUnique({
    where: { restaurantId: ctx.restaurantId },
  });
  if (existing) {
    return NextResponse.json({ error: 'Configuração fiscal já existe. Use PATCH para atualizar.' }, { status: 409 });
  }

  const config = await prisma.nFeConfig.create({
    data: {
      restaurantId: ctx.restaurantId,
      cnpj: body.cnpj.replace(/[^\d]/g, ''),
      companyName: body.companyName || null,
      tradeName: body.tradeName || null,
      stateRegistration: body.stateRegistration || null,
      municipalRegistration: body.municipalRegistration || null,
      nfeProvider: body.nfeProvider || 'focusnfe',
      nfeApiKey: body.nfeApiKey || '',
      certificatePassword: body.certificatePassword || null,
      uf: body.uf || 'SP',
      crt: body.crt || '1',
      natOp: body.natOp || 'VENDA DE MERCADORIA',
      environment: body.environment || 'sandbox',
      autoIssueOnSale: body.autoIssueOnSale || false,
      seriesNFCe: body.seriesNFCe || 1,
      seriesNFe: body.seriesNFe || 1,
    },
  });

  return NextResponse.json({
    config: { ...config, nfeApiKey: maskKey(config.nfeApiKey), certificatePassword: config.certificatePassword ? '••••••' : null },
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const existing = await prisma.nFeConfig.findUnique({
    where: { restaurantId: ctx.restaurantId },
  });
  if (!existing) return NextResponse.json({ error: 'Configuração fiscal não encontrada' }, { status: 404 });

  const body = await req.json();
  const data: any = {};

  if (body.cnpj !== undefined) data.cnpj = body.cnpj.replace(/[^\d]/g, '');
  if (body.companyName !== undefined) data.companyName = body.companyName;
  if (body.tradeName !== undefined) data.tradeName = body.tradeName;
  if (body.stateRegistration !== undefined) data.stateRegistration = body.stateRegistration;
  if (body.municipalRegistration !== undefined) data.municipalRegistration = body.municipalRegistration;
  if (body.uf !== undefined) data.uf = body.uf;
  if (body.crt !== undefined) data.crt = body.crt;
  if (body.natOp !== undefined) data.natOp = body.natOp;
  if (body.environment !== undefined) data.environment = body.environment;
  if (body.autoIssueOnSale !== undefined) data.autoIssueOnSale = body.autoIssueOnSale;
  if (body.active !== undefined) data.active = body.active;
  if (body.nfeApiKey && !/•••/.test(body.nfeApiKey)) data.nfeApiKey = body.nfeApiKey;
  if (body.certificatePassword && !/•••/.test(body.certificatePassword)) data.certificatePassword = body.certificatePassword;

  const updated = await prisma.nFeConfig.update({
    where: { id: existing.id },
    data,
  });

  return NextResponse.json({
    config: { ...updated, nfeApiKey: maskKey(updated.nfeApiKey), certificatePassword: updated.certificatePassword ? '••••••' : null },
  });
}
