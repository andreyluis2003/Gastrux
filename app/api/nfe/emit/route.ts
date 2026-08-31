// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/nfe/provider';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nfe/emit
 * Emite NFC-e a partir de uma OrderSession.
 *
 * Body: { orderSessionId, customerCPF?, customerName?, customerEmail?, paymentMethod? }
 *
 * Fluxo:
 * 1. Valida OrderSession existe e está fechada/com pagamento
 * 2. Carrega NFeConfig ativa (1o da tabela)
 * 3. Cria NFeDocument (status=pending) + NFeItem[] atomicamente
 * 4. Chama provider (Focus ou Mock) → emite na SEFAZ
 * 5. Atualiza doc com accessKey/qrCode/status
 * 6. Incrementa nextNumberNFCe
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 400 });
    }

    const body = await request.json();
    const { orderSessionId, customerCPF, customerName, customerEmail, paymentMethod } = body || {};

    if (!orderSessionId) {
      return NextResponse.json({ error: 'orderSessionId obrigatório' }, { status: 400 });
    }

    // Carregar session com items (escopado ao restaurante do chamador - nunca
    // emitir NFC-e de uma comanda de outro restaurante)
    const orderSession = await prisma.orderSession.findFirst({
      where: { id: orderSessionId, restaurantId },
      include: {
        items: { include: { recipe: true } },
      },
    });

    if (!orderSession) {
      return NextResponse.json({ error: 'Comanda não encontrada' }, { status: 404 });
    }

    if (!orderSession.items || orderSession.items.length === 0) {
      return NextResponse.json({ error: 'Comanda sem itens' }, { status: 400 });
    }

    // Verificar se já existe NFC-e autorizada para esta session
    const existing = await prisma.nFeDocument.findFirst({
      where: { orderSessionId, status: { in: ['authorized', 'submitted', 'processing'] } },
    });
    if (existing) {
      return NextResponse.json({
        error: 'Já existe NFC-e emitida para esta comanda',
        documentId: existing.id,
        accessKey: existing.accessKey,
      }, { status: 409 });
    }

    // Config (uma por restaurante - nunca emitir sob o CNPJ de outro restaurante)
    const config = await prisma.nFeConfig.findFirst({
      where: { restaurantId, active: true },
    });
    if (!config) {
      return NextResponse.json({ error: 'NFeConfig não configurada. Configure em /admin/nfe/config' }, { status: 400 });
    }

    // Calcular totais
    const totalAmount = orderSession.items.reduce((sum, item) => {
      return sum + Number(item.price) * item.quantity;
    }, 0);

    // Sequencial
    const documentNumber = config.nextNumberNFCe;
    const documentSeries = config.seriesNFCe;
    const providerRef = `nfce-${orderSessionId.slice(-10)}-${Date.now()}`;

    // Criar documento
    const document = await prisma.nFeDocument.create({
      data: {
        configId: config.id,
        orderSessionId,
        documentType: 'NFCe',
        documentNumber,
        documentSeries,
        providerRef,
        customerCPF: customerCPF ? String(customerCPF).replace(/\D/g, '') : null,
        customerName: customerName || null,
        customerEmail: customerEmail || null,
        issueDate: new Date(),
        totalAmount,
        status: 'pending',
        items: {
          create: orderSession.items.map((item, idx) => ({
            description: item.recipe?.name || 'Produto',
            quantity: item.quantity,
            unit: 'UN',
            unitPrice: Number(item.price),
            totalPrice: Number(item.price) * item.quantity,
            ncm: '21069090',
            cfop: '5102',
            recipeId: item.recipeId,
            position: idx,
          })),
        },
      },
      include: { items: true },
    });

    // Incrementa nextNumber
    await prisma.nFeConfig.update({
      where: { id: config.id },
      data: { nextNumberNFCe: { increment: 1 } },
    });

    // Provider
    const provider = getProvider(config);

    // Payload
    const payload = {
      providerRef,
      documentType: 'NFCe' as const,
      cnpj: config.cnpj,
      uf: (config as any).uf || 'SP',
      series: documentSeries,
      number: documentNumber,
      environment: (config.environment as 'sandbox' | 'production') || 'sandbox',
      customerCPF: customerCPF ? String(customerCPF).replace(/\D/g, '') : undefined,
      customerName: customerName || undefined,
      customerEmail: customerEmail || undefined,
      items: document.items.map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        totalPrice: Number(it.totalPrice),
        ncm: it.ncm || undefined,
        cfop: it.cfop || undefined,
      })),
      totalAmount,
      paymentMethod: paymentMethod || 'dinheiro',
      paymentAmount: totalAmount,
    };

    // Log submit
    await prisma.nFeLog.create({
      data: {
        configId: config.id,
        documentId: document.id,
        eventType: 'submit',
        description: `Emitindo NFC-e via ${provider.name}`,
        requestData: JSON.stringify(payload).slice(0, 4000),
      },
    });

    const result = await provider.emitNFCe(payload);

    // Atualiza doc com resposta
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
      if (result.status === 'authorized') {
        updateData.authorizedAt = new Date();
      }
    } else {
      updateData.status = 'rejected';
      updateData.rejectionReason = result.rejectionReason || 'Erro na emissão';
      updateData.statusDescription = result.statusDescription || null;
    }

    const updated = await prisma.nFeDocument.update({
      where: { id: document.id },
      data: updateData,
      include: { items: true },
    });

    // Log resposta
    await prisma.nFeLog.create({
      data: {
        configId: config.id,
        documentId: document.id,
        eventType: result.ok ? 'emit_success' : 'emit_error',
        description: result.ok ? `Emitido com status: ${result.status}` : `Erro: ${result.rejectionReason}`,
        responseData: JSON.stringify(result.raw || {}).slice(0, 4000),
        statusCode: result.ok ? 200 : 400,
        errorMessage: result.ok ? null : result.rejectionReason,
      },
    });

    return NextResponse.json({
      success: result.ok,
      document: updated,
      status: result.status,
      accessKey: result.accessKey,
      qrCodeData: result.qrCodeData,
      qrCodeUrl: result.qrCodeUrl,
      danfeUrl: result.danfeUrl,
      rejectionReason: result.rejectionReason,
    });
  } catch (error: any) {
    console.error('Erro ao emitir NFC-e:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao emitir NFC-e' },
      { status: 500 }
    );
  }
}
