// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/nfe/provider';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nfe/documents/[id]/status
 * Consulta status atual no provider e sincroniza com banco.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const document = await prisma.nFeDocument.findUnique({
      where: { id: params.id },
      include: { config: true },
    });

    if (!document) {
      return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
    }

    if (!document.providerRef) {
      return NextResponse.json({
        success: true,
        message: 'Documento ainda não submetido ao provider',
        document,
      });
    }

    const provider = getProvider(document.config);
    const result = await provider.getStatus(
      document.providerRef,
      document.documentType as 'NFCe' | 'NFe'
    );

    const updateData: any = {
      statusDescription: result.statusDescription,
    };
    if (result.ok && result.status && result.status !== document.status) {
      updateData.status = result.status;
      if (result.accessKey && !document.accessKey) updateData.accessKey = result.accessKey;
      if (result.protocolNumber) updateData.protocolNumber = result.protocolNumber;
      if (result.qrCodeData) updateData.qrCodeData = result.qrCodeData;
      if (result.qrCodeUrl) updateData.qrCodeUrl = result.qrCodeUrl;
      if (result.danfeUrl) updateData.pdfUrl = result.danfeUrl;
      if (result.xmlUrl) updateData.xmlUrl = result.xmlUrl;
      if (result.status === 'authorized' && !document.authorizedAt) {
        updateData.authorizedAt = new Date();
      }
      if (result.status === 'rejected' && result.rejectionReason) {
        updateData.rejectionReason = result.rejectionReason;
      }
    }

    const updated = await prisma.nFeDocument.update({
      where: { id: document.id },
      data: updateData,
    });

    await prisma.nFeLog.create({
      data: {
        configId: document.configId,
        documentId: document.id,
        eventType: 'status_check',
        description: `Consulta status: ${result.status}`,
        responseData: JSON.stringify(result.raw || {}).slice(0, 4000),
      },
    });

    return NextResponse.json({
      success: result.ok,
      document: updated,
      providerStatus: result.status,
      statusDescription: result.statusDescription,
    });
  } catch (error: any) {
    console.error('Erro ao consultar status NFC-e:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro' },
      { status: 500 }
    );
  }
}
