// @ts-nocheck
// Feature #2: NFC-e automática vinculada ao POS
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/nfe/provider';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nfe/auto-emit
 * Emissão automática de NFC-e ao fechar venda no POS.
 * Body: { orderSessionId, customerCPF?, paymentMethod? }
 * 
 * Diferente da rota /api/nfe/emit, esta:
 * - É silenciosa (não falha a venda se NFC-e der erro)
 * - Retorna status da NFC-e junto com a venda
 * - Registra log em caso de falha
 */
export async function POST(request: NextRequest) {
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
    const { orderSessionId, customerCPF, paymentMethod, transactionId } = body || {};

    if (!orderSessionId && !transactionId) {
      return NextResponse.json(
        { error: 'orderSessionId ou transactionId obrigatório' },
        { status: 400 }
      );
    }

    // Check if NFC-e auto-emission is configured
    const nfeConfig = await prisma.nFeConfig.findFirst({
      where: { restaurantId, active: true },
    });

    if (!nfeConfig) {
      return NextResponse.json({
        success: true,
        nfce: null,
        message: 'NFC-e não configurada. Venda registrada sem nota fiscal.',
      });
    }

    if (!nfeConfig.issueNFCeForCPF && !customerCPF) {
      return NextResponse.json({
        success: true,
        nfce: null,
        message: 'Emissão de NFC-e sem CPF desativada nas configurações.',
      });
    }

    // Get order session data
    let orderItems: any[] = [];
    let totalAmount = 0;
    let sessionRef = orderSessionId;

    if (orderSessionId) {
      const orderSession = await prisma.orderSession.findFirst({
        where: { id: orderSessionId, restaurantId },
        include: { items: { include: { recipe: true } } },
      });

      if (!orderSession || !orderSession.items?.length) {
        return NextResponse.json({
          success: true,
          nfce: null,
          message: 'Comanda sem itens. NFC-e não emitida.',
        });
      }

      // Check for existing NFC-e (NFeDocument has no restaurantId field - already
      // scoped via the orderSession lookup above, which is tenant-checked)
      const existing = await prisma.nFeDocument.findFirst({
        where: { orderSessionId, status: { in: ['authorized', 'submitted', 'processing'] } },
      });
      if (existing) {
        return NextResponse.json({
          success: true,
          nfce: { id: existing.id, status: existing.status, accessKey: existing.accessKey },
          message: 'NFC-e já emitida para esta comanda.',
        });
      }

      orderItems = orderSession.items.map((item: any) => ({
        name: item.recipe?.name || item.recipeName || 'Item',
        quantity: item.quantity || 1,
        unitPrice: Number(item.unitPrice || item.recipe?.sellingPrice || 0),
        totalPrice: Number(item.totalPrice || (item.quantity || 1) * Number(item.unitPrice || item.recipe?.sellingPrice || 0)),
        ncm: '21069090', // Default NCM for prepared foods
        cfop: '5102', // Default CFOP for internal sales
      }));
      totalAmount = orderItems.reduce((sum: number, i: any) => sum + i.totalPrice, 0);
    } else if (transactionId) {
      // POS transaction-based emission
      const transaction = await prisma.cashTransaction.findFirst({
        where: { id: transactionId, cashRegister: { restaurantId } },
      });
      if (!transaction) {
        return NextResponse.json({
          success: true,
          nfce: null,
          message: 'Transação não encontrada.',
        });
      }
      totalAmount = Number(transaction.amount || 0);
      // CashTransaction may not have items, use the body items or create a single-item
      const bodyItems = body.items || [];
      if (bodyItems.length > 0) {
        orderItems = bodyItems.map((item: any) => ({
          name: item.name || 'Produto',
          quantity: item.quantity || 1,
          unitPrice: Number(item.price || 0),
          totalPrice: Number(item.price || 0) * (item.quantity || 1),
          ncm: '21069090',
          cfop: '5102',
        }));
      } else {
        orderItems = [{
          name: transaction.reference || 'Venda',
          quantity: 1,
          unitPrice: totalAmount,
          totalPrice: totalAmount,
          ncm: '21069090',
          cfop: '5102',
        }];
      }
    }

    if (orderItems.length === 0 || totalAmount <= 0) {
      return NextResponse.json({
        success: true,
        nfce: null,
        message: 'Sem itens válidos para emissão.',
      });
    }

    // Create NFC-e document
    const docNumber = nfeConfig.nextNumberNFCe;
    const nfceDoc = await prisma.nFeDocument.create({
      data: {
        configId: nfeConfig.id,
        orderSessionId: sessionRef || null,
        documentType: 'NFCe',
        documentNumber: docNumber,
        documentSeries: nfeConfig.seriesNFCe,
        customerCPF: customerCPF || null,
        totalAmount,
        status: 'pending',
        issueDate: new Date(),
        items: {
          create: orderItems.map((item, idx) => ({
            itemNumber: idx + 1,
            description: item.name,
            ncm: item.ncm,
            cfop: item.cfop,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      },
    });

    // Increment NFC-e number
    await prisma.nFeConfig.update({
      where: { id: nfeConfig.id },
      data: { nextNumberNFCe: docNumber + 1 },
    });

    // Try to submit to SEFAZ via provider
    let nfceResult: any = { status: 'pending' };
    try {
      const provider = getProvider(nfeConfig);
      nfceResult = await provider.emitNFCe({
        document: nfceDoc,
        config: nfeConfig,
        items: orderItems,
        paymentMethod: paymentMethod || 'money',
        customerCPF,
      });

      await prisma.nFeDocument.update({
        where: { id: nfceDoc.id },
        data: {
          status: nfceResult.status || 'submitted',
          accessKey: nfceResult.accessKey || null,
          protocolNumber: nfceResult.protocolNumber || null,
          qrCodeData: nfceResult.qrCodeData || null,
          qrCodeUrl: nfceResult.qrCodeUrl || null,
          xmlUrl: nfceResult.xmlUrl || null,
          pdfUrl: nfceResult.pdfUrl || null,
          submittedAt: new Date(),
          authorizedAt: nfceResult.status === 'authorized' ? new Date() : null,
          providerRef: nfceResult.providerRef || null,
        },
      });
    } catch (providerError: any) {
      console.error('[NFC-e Auto] Provider error:', providerError);
      // Don't fail the sale, just log the error
      await prisma.nFeLog.create({
        data: {
          configId: nfeConfig.id,
          documentId: nfceDoc.id,
          eventType: 'AUTO_EMIT_ERROR',
          description: providerError?.message || 'Erro ao comunicar com SEFAZ',
          errorMessage: providerError?.message,
          errorCode: 'PROVIDER_ERROR',
        },
      });
      nfceResult = { status: 'error', error: providerError?.message };
    }

    return NextResponse.json({
      success: true,
      nfce: {
        id: nfceDoc.id,
        number: docNumber,
        series: nfeConfig.seriesNFCe,
        status: nfceResult.status,
        accessKey: nfceResult.accessKey || null,
        qrCodeUrl: nfceResult.qrCodeUrl || null,
        pdfUrl: nfceResult.pdfUrl || null,
      },
      message: nfceResult.status === 'authorized'
        ? 'NFC-e emitida com sucesso'
        : nfceResult.status === 'error'
          ? 'Venda registrada. NFC-e será reenviada automaticamente.'
          : 'NFC-e em processamento',
    });
  } catch (error: any) {
    console.error('[NFC-e Auto Emit] Error:', error);
    // Never fail the sale because of NFC-e
    return NextResponse.json({
      success: true,
      nfce: null,
      message: 'Venda registrada. Erro na emissão de NFC-e: ' + (error?.message || 'erro desconhecido'),
    });
  }
}
