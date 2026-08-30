// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function getRestaurantId(session: any) {
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { restaurants: { include: { restaurant: true }, take: 1 } },
  });
  return user?.currentRestaurantId || user?.restaurants?.[0]?.restaurantId || null;
}

// GET: Fetch reconquest campaign data (delivery customers + existing campaigns)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const restaurantId = await getRestaurantId(session);
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    // Get delivery customers (from ExternalOrder) who could be reconquered
    const externalOrders = await prisma.externalOrder.findMany({
      where: {
        status: 'DELIVERED',
      },
      select: {
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        totalAmount: true,
        orderReceivedAt: true,
        integration: { select: { platform: true } },
      },
      orderBy: { orderReceivedAt: 'desc' },
    });

    // Deduplicate by phone
    const phoneMap = new Map<string, any>();
    for (const o of externalOrders) {
      if (!o.customerPhone) continue;
      const phone = o.customerPhone.replace(/\D/g, '');
      if (!phoneMap.has(phone)) {
        phoneMap.set(phone, {
          name: o.customerName,
          phone: o.customerPhone,
          email: o.customerEmail,
          platform: o.integration?.platform || 'ifood',
          totalOrders: 1,
          totalSpent: o.totalAmount,
          lastOrderAt: o.orderReceivedAt,
        });
      } else {
        const existing = phoneMap.get(phone);
        existing.totalOrders += 1;
        existing.totalSpent += o.totalAmount;
        if (o.orderReceivedAt > existing.lastOrderAt) {
          existing.lastOrderAt = o.orderReceivedAt;
        }
      }
    }

    const deliveryCustomers = Array.from(phoneMap.values())
      .sort((a, b) => b.totalOrders - a.totalOrders);

    // Get existing reconquest campaigns (MessageCampaigns tagged with reconquista)
    const campaigns = await prisma.messageCampaign.findMany({
      where: {
        name: { contains: 'reconquista', mode: 'insensitive' },
      },
      include: {
        template: { select: { displayName: true, bodyText: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Summary stats
    const totalDeliveryCustomers = deliveryCustomers.length;
    const ifoodCustomers = deliveryCustomers.filter(c => c.platform === 'ifood').length;
    const totalRevenueAtRisk = deliveryCustomers.reduce((s, c) => s + c.totalSpent, 0);

    // Check direct orders from same phones (migrated)
    const migratedCount = 0; // Will be populated when direct orders track customer phone

    return NextResponse.json({
      deliveryCustomers: deliveryCustomers.slice(0, 100),
      campaigns,
      summary: {
        totalDeliveryCustomers,
        ifoodCustomers,
        totalRevenueAtRisk: totalRevenueAtRisk.toFixed(2),
        migratedCount,
        campaignsLaunched: campaigns.filter(c => c.status !== 'DRAFT').length,
      },
    });
  } catch (error) {
    console.error('Campanha Reconquista GET error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST: Create a reconquest campaign
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const restaurantId = await getRestaurantId(session);
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });
    const userId = (session.user as any).id;

    const body = await req.json();
    const { name, templateId, recipientPhones, provider } = body;

    if (!name || !recipientPhones?.length) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    // Find or create a reconquista template
    let finalTemplateId = templateId;
    if (!finalTemplateId || finalTemplateId === 'reconquista_default') {
      // Try to find existing reconquista template
      let template = await prisma.messageTemplate.findFirst({
        where: { restaurantId, name: { contains: 'reconquista', mode: 'insensitive' } },
      });
      if (!template) {
        // Create a default reconquista template
        template = await prisma.messageTemplate.create({
          data: {
            name: `reconquista_${Date.now()}`,
            displayName: 'Reconquista - Pedido Direto',
            category: 'MARKETING',
            bodyText: 'Olá {{1}}, sentimos sua falta! 😊 Peça diretamente pelo nosso cardápio digital e ganhe desconto exclusivo. Acesse: {{2}}',
            variables: JSON.stringify([{ key: '1', label: 'Nome do cliente' }, { key: '2', label: 'Link do pedido' }]),
            status: 'DRAFT',
          },
        });
      }
      finalTemplateId = template.id;
    }

    // Create campaign
    const campaign = await prisma.messageCampaign.create({
      data: {
        name: `Reconquista: ${name}`,
        description: 'Campanha de reconquista de clientes delivery para pedido direto',
        templateId: finalTemplateId,
        provider: provider || 'META_CLOUD',
        status: 'DRAFT',
        totalRecipients: recipientPhones.length,
        createdById: userId,
        recipients: {
          create: recipientPhones.map((p: { phone: string; name: string }) => ({
            phoneNumber: p.phone,
            name: p.name,
          })),
        },
      },
      include: {
        _count: { select: { recipients: true } },
      },
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('Campanha Reconquista POST error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
