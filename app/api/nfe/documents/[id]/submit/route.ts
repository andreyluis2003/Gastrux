// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/nfe/provider';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

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


    const document = await prisma.nFeDocument.findUnique({
      where: { id: params.id },
      include: { items: true, config: true },
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

    const config = document.config;
    const provider = getProvider(config);

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
      items: document.items.map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        totalPrice: Number(it.totalPrice),
        ncm: it.ncm || undefined,
        cfop: it.cfop || undefined,
      })),
      totalAmount: Number(document.totalAmount),
      paymentMethod: 'dinheiro',
      paymentAmount: Number(document.totalAmount),
    };

    await prisma.nFeLog.create({
      data: {
        configId: document.configId,
        documentId: document.id,
        eventType: 'submit',
        description: `Submetendo ao provider ${provider.name}`,
        requestData: JSON.stringify(payload).slice(0, 4000),
      },
    });

    const result = document.documentType === 'NFCe'
      ? await provider.emitNFCe(payload)
      : await provider.emitNFe(payload);

    const updateData: any = {
      dataSnapshot: payload,
      submittedAt: new Date(),
    };
    if (result.ok) {
      updateData.status = result.status;
      updateData.accessKey = result.accessKey || null;
      updateData.protocolNumber = result.protocolNumber || null;
      updateData.qrCodeData = result.qrCodeData || null;
      updateData.qrCodeUrl = result.qrCodeUrl || null;
      updateData.pdfUrl = result.danfeUrl || null;
      updateData.xmlUrl = result.xmlUrl || null;
      updateData.statusDescription = result.statusDescription || null;
      updateData.rejectionReason = null;
      if (result.status === 'authorized') {
        updateData.authorizedAt = new Date();
      }
    } else {
      updateData.status = 'rejected';
      updateData.rejectionReason = result.rejectionReason || 'Erro';
      updateData.statusDescription = result.statusDescription || null;
    }

    const updated = await prisma.nFeDocument.update({
      where: { id: document.id },
      data: updateData,
    });

    await prisma.nFeLog.create({
      data: {
        configId: document.configId,
        documentId: document.id,
        eventType: result.ok ? 'submit_success' : 'submit_error',
        description: result.ok
          ? `Emitido: ${result.status}`
          : `Erro: ${result.rejectionReason}`,
        responseData: JSON.stringify(result.raw || {}).slice(0, 4000),
        statusCode: result.ok ? 200 : 400,
        errorMessage: result.ok ? null : result.rejectionReason,
      },
    });

    return NextResponse.json({
      success: result.ok,
      document: updated,
      status: result.status,
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
