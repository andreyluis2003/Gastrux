// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/suppliers/[id]/integrate - Setup supplier integration
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if ((session.user as any)?.role === 'COOK') {
      return NextResponse.json(
        { error: 'COOKs cannot manage integrations' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      integrationType,
      apiKey,
      apiSecret,
      apiUrl,
      webhookUrl,
      webhookSecret,
      syncFrequency = 24,
    } = body;

    if (!integrationType) {
      return NextResponse.json(
        { error: 'Integration type is required' },
        { status: 400 }
      );
    }

    // Verify supplier exists and belongs to tenant
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const supplier = await prisma.supplier.findFirst({
      where: { id: params.id, restaurantId },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Check if integration already exists
    const existing = await prisma.supplierIntegration.findFirst({
      where: {
        supplierId: params.id,
        integrationType,
      },
    });

    let integration;

    if (existing) {
      // Update existing integration
      integration = await prisma.supplierIntegration.update({
        where: { id: existing.id },
        data: {
          ...(apiKey && { apiKey }),
          ...(apiSecret && { apiSecret }),
          ...(apiUrl && { apiUrl }),
          ...(webhookUrl && { webhookUrl }),
          ...(webhookSecret && { webhookSecret }),
          ...(syncFrequency && { syncFrequency }),
          isActive: true,
          lastSyncStatus: 'PENDING',
        },
      });
    } else {
      // Create new integration
      integration = await prisma.supplierIntegration.create({
        data: {
          supplierId: params.id,
          integrationType,
          apiKey: apiKey || null,
          apiSecret: apiSecret || null,
          apiUrl: apiUrl || null,
          webhookUrl: webhookUrl || null,
          webhookSecret: webhookSecret || null,
          syncFrequency,
        },
      });
    }

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: (session.user as any)?.id,
        action: 'CREATE',
        entityType: 'SupplierIntegration',
        entityId: integration.id,
        changes: JSON.stringify({
          integrationType,
          syncFrequency,
          isActive: true,
        }),
      },
    });

    return NextResponse.json(integration, { status: 201 });
  } catch (error) {
    console.error('Error setting up integration:', error);
    return NextResponse.json(
      { error: 'Failed to setup integration' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/suppliers/[id]/integrate - Get supplier integrations
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const ownedSupplier = await prisma.supplier.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!ownedSupplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const integrations = await prisma.supplierIntegration.findMany({
      where: { supplierId: params.id },
    });

    return NextResponse.json(integrations);
  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}
