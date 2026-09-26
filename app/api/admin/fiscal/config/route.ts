import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRestaurantMember, MANAGER_ROLES } from '@/lib/auth/restaurant-role';
import { normalizeProductFiscalFields, validateProductFiscalFields } from '@/lib/nfe/fiscal-data';

export const dynamic = 'force-dynamic';

/**
 * A manager of the restaurant being worked in. It used to read session.user.currentRestaurantId, a
 * field the session never carries, so this page never loaded nor saved anything (browser test of
 * 2026-09-25).
 */
async function getContext() {
  const member = await getRestaurantMember();
  if (!member || !MANAGER_ROLES.includes(member.role)) return null;
  return { restaurantId: member.restaurantId };
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

/**
 * Restaurant-wide fiscal defaults (set by the accountant) for products without their own data.
 * Validated like a product's own fields (lib/nfe/fiscal-data.ts); undefined = not sent.
 */
function fiscalDefaultsFrom(body: any): { data: Record<string, string | null>; problems: string[] } {
  const keys: Record<string, string> = { defaultNcm: 'fiscalNcm', defaultCfop: 'fiscalCfop', defaultOrigin: 'fiscalOrigin', defaultCsosn: 'fiscalCsosn' };
  const sent = Object.keys(keys).filter((k) => body[k] !== undefined);
  const asProduct: any = {};
  sent.forEach((k) => (asProduct[keys[k]] = body[k]));
  const problems = validateProductFiscalFields(asProduct);
  const normalized: Record<string, string | null> = normalizeProductFiscalFields(asProduct);
  const data: Record<string, string | null> = {};
  sent.forEach((k) => (data[k] = normalized[keys[k]]));
  if (body.pisCofinsCst !== undefined) {
    const cst = String(body.pisCofinsCst ?? '').replace(/D/g, '');
    if (cst && cst.length !== 2) problems.push('CST de PIS/COFINS deve ter 2 dígitos');
    data.pisCofinsCst = cst || null;
  }
  return { data, problems };
}

export async function POST(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();

  if (!body.cnpj) {
    return NextResponse.json({ error: 'CNPJ é obrigatório' }, { status: 400 });
  }
  const defaults = fiscalDefaultsFrom(body);
  if (defaults.problems.length) return NextResponse.json({ error: defaults.problems.join('; ') }, { status: 400 });

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
      autoIssueOnSale: body.autoIssueOnSale ?? true, // on unless the restaurant turns it off
      seriesNFCe: body.seriesNFCe || 1,
      seriesNFe: body.seriesNFe || 1,
      ...defaults.data,
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
  const defaults = fiscalDefaultsFrom(body);
  if (defaults.problems.length) return NextResponse.json({ error: defaults.problems.join('; ') }, { status: 400 });
  Object.assign(data, defaults.data);

  const updated = await prisma.nFeConfig.update({
    where: { id: existing.id },
    data,
  });

  return NextResponse.json({
    config: { ...updated, nfeApiKey: maskKey(updated.nfeApiKey), certificatePassword: updated.certificatePassword ? '••••••' : null },
  });
}
