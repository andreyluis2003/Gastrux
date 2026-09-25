// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/nfe/provider';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nfe/documents/[id]/cancel
 * Cancela uma NFC-e/NFe já autorizada via provider.
 *
 * Body: { justificativa } (min 15 chars)
 */
export async function POST(
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


    const body = await request.json();
    const justificativa = String(body?.justificativa || '').trim();

    if (justificativa.length < 15) {
      return NextResponse.json(
        { error: 'Justificativa deve ter pelo menos 15 caracteres' },
        { status: 400 }
      );
    }

    const document = await prisma.nFeDocument.findFirst({
      where: { id: params.id, config: { restaurantId } },
      include: { config: true },
    });

    if (!document) {
      return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
    }

    if (document.status === 'cancelled') {
      return NextResponse.json({ error: 'Documento já cancelado' }, { status: 400 });
    }

    if (document.status !== 'authorized') {
      return NextResponse.json(
        { error: `Só é possível cancelar documentos autorizados. Status atual: ${document.status}` },
        { status: 400 }
      );
    }

    if (!document.providerRef) {
      return NextResponse.json(
        { error: 'Documento sem referência no provider (providerRef)' },
        { status: 400 }
      );
    }

    // Janela de cancelamento SEFAZ: NFC-e = 30 min; NFe = 24h
    const windowMs = document.documentType === 'NFCe' ? 30 * 60 * 1000 : 24 * 60 * 60 * 1000;
    if (document.authorizedAt && Date.now() - new Date(document.authorizedAt).getTime() > windowMs) {
      // Alerta mas deixa tentar — algumas UFs aceitam além do prazo
      console.warn('Fora da janela padrão de cancelamento, tentando mesmo assim.');
    }

    const provider = getProvider(document.config);

    const result = await provider.cancelNFCe(document.providerRef, justificativa);

    const updated = await prisma.nFeDocument.update({
      where: { id: document.id },
      data: {
        status: result.ok ? 'cancelled' : document.status,
        cancelledAt: result.ok ? new Date() : document.cancelledAt,
        cancellationReason: result.ok ? justificativa : document.cancellationReason,
        statusDescription: result.statusDescription || document.statusDescription,
      },
    });

    await prisma.nFeLog.create({
      data: {
        configId: document.configId,
        documentId: document.id,
        eventType: result.ok ? 'cancel_success' : 'cancel_error',
        description: result.ok
          ? `Cancelado: ${justificativa}`
          : `Erro ao cancelar: ${result.rejectionReason}`,
        responseData: JSON.stringify(result.raw || {}).slice(0, 4000),
        statusCode: result.ok ? 200 : 400,
        errorMessage: result.ok ? null : result.rejectionReason,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.rejectionReason },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      document: updated,
      protocolNumber: result.protocolNumber,
    });
  } catch (error: any) {
    console.error('Erro ao cancelar NFC-e:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao cancelar' },
      { status: 500 }
    );
  }
}
