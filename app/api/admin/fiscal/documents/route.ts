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

export async function GET(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const config = await prisma.nFeConfig.findUnique({
    where: { restaurantId: ctx.restaurantId },
  });
  if (!config) {
    return NextResponse.json({ documents: [], stats: { total: 0, authorized: 0, pending: 0, cancelled: 0, rejected: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  const where: any = { configId: config.id };
  if (status) where.status = status;
  if (type) where.documentType = type;

  const [documents, stats] = await Promise.all([
    prisma.nFeDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    }),
    prisma.nFeDocument.groupBy({
      by: ['status'],
      where: { configId: config.id },
      _count: true,
    }),
  ]);

  const statusCounts = Object.fromEntries(stats.map((s: any) => [s.status, s._count]));

  return NextResponse.json({
    documents: documents.map((d: any) => ({
      ...d,
      totalAmount: Number(d.totalAmount),
      items: d.items.map((i: any) => ({
        ...i,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        totalPrice: Number(i.totalPrice),
      })),
    })),
    stats: {
      total: Object.values(statusCounts).reduce((a: any, b: any) => a + b, 0) as number,
      authorized: statusCounts['authorized'] || 0,
      pending: statusCounts['pending'] || 0,
      cancelled: statusCounts['cancelled'] || 0,
      rejected: statusCounts['rejected'] || 0,
    },
  });
}

/**
 * POST: Issue a new NFC-e/NF-e
 * In production, this would call Focus NFe / NFe.io API
 * For now: creates the document record and simulates submission
 */
export async function POST(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const config = await prisma.nFeConfig.findUnique({
    where: { restaurantId: ctx.restaurantId },
  });
  if (!config || !config.active) {
    return NextResponse.json({ error: 'Configuração fiscal não encontrada ou inativa' }, { status: 400 });
  }

  const body = await req.json();
  const documentType = body.documentType || 'NFCe';
  const isNFCe = documentType === 'NFCe';

  // Increment document number
  const numberField = isNFCe ? 'nextNumberNFCe' : 'nextNumberNFe';
  const seriesField = isNFCe ? 'seriesNFCe' : 'seriesNFe';
  const docNumber = config[numberField];
  const docSeries = config[seriesField];

  // Calculate totals
  const items = body.items || [];
  const totalAmount = items.reduce((sum: number, i: any) => sum + (Number(i.totalPrice) || 0), 0);

  // Create document
  const document = await prisma.nFeDocument.create({
    data: {
      configId: config.id,
      documentType,
      documentNumber: docNumber,
      documentSeries: docSeries,
      customerName: body.customerName || null,
      customerCPF: body.customerCPF || null,
      customerCNPJ: body.customerCNPJ || null,
      customerEmail: body.customerEmail || null,
      totalAmount,
      status: 'pending',
      orderId: body.orderId || null,
      orderSessionId: body.orderSessionId || null,
      paymentId: body.paymentId || null,
      dataSnapshot: body.dataSnapshot || null,
      items: {
        create: items.map((item: any, idx: number) => ({
          description: item.description || item.name || 'Item',
          quantity: Number(item.quantity) || 1,
          unit: item.unit || 'UN',
          unitPrice: Number(item.unitPrice) || 0,
          totalPrice: Number(item.totalPrice) || 0,
          ncm: item.ncm || '21069090',
          cfop: item.cfop || (isNFCe ? '5102' : '5102'),
          recipeId: item.recipeId || null,
          position: idx,
        })),
      },
    },
    include: { items: true },
  });

  // Increment next number
  await prisma.nFeConfig.update({
    where: { id: config.id },
    data: isNFCe ? { nextNumberNFCe: { increment: 1 } } : { nextNumberNFe: { increment: 1 } },
  });

  // Log submission
  await prisma.nFeLog.create({
    data: {
      configId: config.id,
      documentId: document.id,
      eventType: 'SUBMISSION',
      description: `${documentType} #${docNumber} criado — enviando para ${config.nfeProvider}`,
    },
  });

  // In production: call Focus NFe API here
  // For sandbox/demo: simulate authorization
  if (config.environment === 'sandbox') {
    const fakeKey = `${config.uf.length === 2 ? config.uf : 'SP'}${new Date().getFullYear()}${config.cnpj}${docSeries.toString().padStart(3, '0')}${docNumber.toString().padStart(9, '0')}1${Math.random().toString().slice(2, 11)}`;

    await prisma.nFeDocument.update({
      where: { id: document.id },
      data: {
        status: 'authorized',
        accessKey: fakeKey.slice(0, 44),
        protocolNumber: Math.random().toString().slice(2, 17),
        issueDate: new Date(),
        authorizedAt: new Date(),
        submittedAt: new Date(),
        statusDescription: 'Autorizado (Sandbox)',
      },
    });

    await prisma.nFeLog.create({
      data: {
        configId: config.id,
        documentId: document.id,
        eventType: 'AUTHORIZATION',
        description: `${documentType} #${docNumber} autorizado (sandbox)`,
        statusCode: 100,
      },
    });
  }

  // Fetch updated document
  const final = await prisma.nFeDocument.findUnique({
    where: { id: document.id },
    include: { items: true },
  });

  return NextResponse.json({
    document: {
      ...final,
      totalAmount: Number(final?.totalAmount),
      items: final?.items.map((i: any) => ({
        ...i,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        totalPrice: Number(i.totalPrice),
      })),
    },
  }, { status: 201 });
}
