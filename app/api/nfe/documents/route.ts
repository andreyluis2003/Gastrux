// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nfe/documents
 * List NF-e/NFC-e documents
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [documents, total] = await Promise.all([
      prisma.nFeDocument.findMany({
        where,
        include: {
          items: true,
          logs: {
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.nFeDocument.count({ where }),
    ]);

    return NextResponse.json({
      documents,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching NF-e documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/nfe/documents
 * Create a new NF-e/NFC-e document (draft)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const body = await request.json();
    const {
      orderId,
      paymentId,
      documentType,
      customerName,
      customerCPF,
      customerCNPJ,
      customerEmail,
      items,
      totalAmount,
      totalICMS,
      totalIPI,
      totalPIS,
      totalCOFINS,
    } = body;

    // Get configuration
    const config = await prisma.nFeConfig.findFirst();
    if (!config) {
      return NextResponse.json(
        { error: 'NF-e configuration not found' },
        { status: 404 }
      );
    }

    // Validate customer info
    if (!customerName && !customerCPF && !customerCNPJ) {
      return NextResponse.json(
        { error: 'Customer name or CPF/CNPJ required' },
        { status: 400 }
      );
    }

    // Get next document number
    const nextNumber = documentType === 'NFCe' ? config.nextNumberNFCe : config.nextNumberNFe;
    const series = documentType === 'NFCe' ? config.seriesNFCe : config.seriesNFe;

    // Create document
    const document = await prisma.nFeDocument.create({
      data: {
        configId: config.id,
        orderId,
        paymentId,
        documentType,
        documentNumber: nextNumber,
        documentSeries: series,
        customerName,
        customerCPF,
        customerCNPJ,
        customerEmail,
        totalAmount: new Decimal(totalAmount || 0),
        totalICMS: new Decimal(totalICMS || 0),
        totalIPI: new Decimal(totalIPI || 0),
        totalPIS: new Decimal(totalPIS || 0),
        totalCOFINS: new Decimal(totalCOFINS || 0),
        status: 'pending',
        items: {
          create: (items || []).map((item: any, index: number) => ({
            description: item.description,
            quantity: new Decimal(item.quantity),
            unit: item.unit || 'un',
            unitPrice: new Decimal(item.unitPrice),
            totalPrice: new Decimal(item.totalPrice),
            ncm: item.ncm,
            cfop: item.cfop,
            recipeId: item.recipeId,
            position: index,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    // Update config with next number
    if (documentType === 'NFCe') {
      await prisma.nFeConfig.update({
        where: { id: config.id },
          restaurantId,
      });
    } else {
      await prisma.nFeConfig.update({
        where: { id: config.id },
          restaurantId,
      });
    }

    // Log creation
    await prisma.nFeLog.create({
      data: {
        configId: config.id,
        documentId: document.id,
        eventType: 'create',
        description: `Created ${documentType} document #${nextNumber}`,
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error('Error creating NF-e document:', error);
    return NextResponse.json(
      { error: 'Failed to create document' },
      { status: 500 }
    );
  }
}
