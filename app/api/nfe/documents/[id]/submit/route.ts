// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/nfe/provider';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { recordEmitResult } from '@/lib/nfe/emit-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nfe/documents/[id]/submit
 * Submete um NFeDocument existente (status pending) ao provider SEFAZ.
 * Diferente de /emit (que cria + submete), aqui o documento já foi criado.
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

    const { enforceFeature } = await import('@/lib/api/tier-middleware');
    const tierBlock = await enforceFeature(restaurantId, 'nfe');
    if (tierBlock) return tierBlock;

    // Scoped through the config: another restaurant's note is a 404
    const document = await prisma.nFeDocument.findFirst({
      where: { id: params.id, config: { restaurantId } },
      include: { items: { orderBy: { position: 'asc' } }, config: true },
    });

    if (!document) {
      return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
    }

    if (document.status !== 'pending' && document.status !== 'rejected') {
      return NextResponse.json(
        { error: `Documento já foi submetido (status: ${document.status})` },
        { status: 400 }
      );
    }

    if (!document.config) {
      return NextResponse.json({ error: 'Config NFe não encontrada' }, { status: 400 });
    }

    // Garante providerRef
    let providerRef = document.providerRef;
    if (!providerRef) {
      providerRef = `nfce-${document.id.slice(-10)}-${Date.now()}`;
      await prisma.nFeDocument.update({
        where: { id: document.id },
        data: { providerRef },
      });
    }

    // Two clicks must not send the same note twice: claim it (optimistic, on updatedAt)
    const claimed = await prisma.nFeDocument.updateMany({
      where: { id: document.id, status: document.status, updatedAt: document.updatedAt },
      data: { status: 'pending' },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: 'Este documento já está sendo reenviado' }, { status: 409 });
    }

    const config = document.config;
    const provider = getProvider(config);
    // The payment method first declared (F7: it used to be re-sent as "dinheiro")
    const previous: any = document.dataSnapshot || {};

    const payload = {
      providerRef,
      documentType: document.documentType as 'NFCe' | 'NFe',
      cnpj: config.cnpj,
      uf: (config as any).uf || 'SP',
      series: document.documentSeries,
      number: document.documentNumber,
      environment: (config.environment as 'sandbox' | 'production') || 'sandbox',
      customerCPF: document.customerCPF || undefined,
      customerCNPJ: document.customerCNPJ || undefined,
      customerName: document.customerName || undefined,
      customerEmail: document.customerEmail || undefined,
      // The fiscal data first sent (origin, CSOSN, CEST) is kept on a re-send (lib/nfe/fiscal-data.ts)
      items: document.items.map((it, idx) => ({
        ...(previous.items?.[idx]?.description === it.description
          ? { cest: previous.items[idx].cest, icmsOrigin: previous.items[idx].icmsOrigin, icmsCST: previous.items[idx].icmsCST }
          : {}),
        description: it.description,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        totalPrice: Number(it.totalPrice),
        ncm: it.ncm || undefined,
        cfop: it.cfop || undefined,
      })),
      totalAmount: Number(document.totalAmount),
      paymentMethod: previous.paymentMethod || 'dinheiro',
      paymentAmount: Number(document.totalAmount),
      pisCofinsCst: previous.pisCofinsCst || config.pisCofinsCst || undefined,
    };

    await prisma.nFeLog.create({
      data: {
        configId: document.configId,
        documentId: document.id,
        eventType: 'submit',
        description: `Reenviando nº ${document.documentNumber} ao provider ${provider.name}`,
        requestData: JSON.stringify(payload).slice(0, 4000),
      },
    });

    const result = document.documentType === 'NFCe'
      ? await provider.emitNFCe(payload)
      : await provider.emitNFe(payload);

    const updated = await recordEmitResult(document.id, document.configId, payload, result, restaurantId);

    return NextResponse.json({
      success: result.ok,
      document: updated,
      status: updated.status,
      rejectionReason: result.rejectionReason,
    });
  } catch (error: any) {
    console.error('Erro ao submeter NFe:', error);
    await prisma.nFeLog.create({
      data: {
        documentId: params.id,
        eventType: 'error',
        description: 'Erro ao submeter documento',
        errorMessage: error?.message || 'Unknown',
        statusCode: 500,
      },
    }).catch(() => null);
    return NextResponse.json(
      { error: error?.message || 'Erro' },
      { status: 500 }
    );
  }
}
