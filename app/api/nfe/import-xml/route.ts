// Feature #7: Importação XML NF-e → Estoque
// POST /api/nfe/import-xml { xmlContent, restaurantId }
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface NFeProduto {
  cProd: string;
  xProd: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
}

function parseNFeXml(xml: string): {
  nNF: string;
  dhEmi: string;
  emitente: string;
  cnpj: string;
  produtos: NFeProduto[];
  vNF: number;
} {
  // Simple regex-based XML parser for NF-e
  const getTag = (tag: string, src: string): string => {
    const match = src.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
    return match ? match[1].trim() : '';
  };

  const nNF = getTag('nNF', xml);
  const dhEmi = getTag('dhEmi', xml) || getTag('dEmi', xml);
  const emitente = getTag('xNome', xml.split('</emit>')[0] || xml);
  const cnpj = getTag('CNPJ', xml.split('</emit>')[0] || xml);
  const vNF = parseFloat(getTag('vNF', xml)) || 0;

  const produtos: NFeProduto[] = [];
  const detBlocks = xml.split(/<det\s/).slice(1);
  for (const block of detBlocks) {
    const prod = block.split('</prod>')[0] || block;
    produtos.push({
      cProd: getTag('cProd', prod),
      xProd: getTag('xProd', prod),
      uCom: getTag('uCom', prod),
      qCom: parseFloat(getTag('qCom', prod)) || 0,
      vUnCom: parseFloat(getTag('vUnCom', prod)) || 0,
      vProd: parseFloat(getTag('vProd', prod)) || 0,
    });
  }

  return { nNF, dhEmi, emitente, cnpj, produtos, vNF };
}

function mapUnitToEnum(unit: string): string {
  const u = unit.toUpperCase().trim();
  if (['KG', 'QG'].includes(u)) return 'KILOGRAM';
  if (['G', 'GR'].includes(u)) return 'GRAM';
  if (['L', 'LT', 'LI'].includes(u)) return 'LITER';
  if (['ML'].includes(u)) return 'MILLILITER';
  if (['UN', 'UND', 'PC', 'PCT', 'CX', 'DZ', 'BD', 'FD', 'GL', 'SC', 'MT'].includes(u)) return 'UNIT';
  return 'UNIT';
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { xmlContent } = body;
    if (!xmlContent) return NextResponse.json({ error: 'xmlContent obrigat\u00f3rio' }, { status: 400 });

    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: { userId: (session as any).user?.id || (session as any).id },
    });
    const restaurantId = restaurantUser?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante n\u00e3o encontrado' }, { status: 404 });

    const nfe = parseNFeXml(xmlContent);

    // Create Invoice record
    const invoice = await prisma.invoice.create({
      data: {
        restaurantId,
        fileName: `NFe-${nfe.nNF || 'unknown'}.xml`,
        fileUrl: '',
        supplierName: nfe.emitente,
        invoiceNumber: nfe.nNF,
        invoiceDate: nfe.dhEmi ? new Date(nfe.dhEmi) : new Date(),
        totalAmount: nfe.vNF,
        status: 'COMPLETED',
        isProcessed: true,
        processedAt: new Date(),
      },
    });

    const results: any[] = [];

    for (const prod of nfe.produtos) {
      // Try to match by code or name
      let ingredient = await prisma.ingredient.findFirst({
        where: { restaurantId, code: prod.cProd, active: true },
      });
      if (!ingredient) {
        ingredient = await prisma.ingredient.findFirst({
          where: { restaurantId, name: { contains: prod.xProd.substring(0, 10), mode: 'insensitive' as any }, active: true },
        });
      }

      // Create invoice item
      await prisma.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          ingredientId: ingredient?.id || null,
          description: prod.xProd,
          quantity: prod.qCom,
          unit: prod.uCom,
          unitPrice: prod.vUnCom,
          totalPrice: prod.vProd,
          matched: !!ingredient,
        },
      });

      if (ingredient) {
        // Add to stock
        const stock = await prisma.stock.findFirst({ where: { ingredientId: ingredient.id } });
        if (stock) {
          await prisma.stock.update({
            where: { id: stock.id },
            data: { currentQuantity: { increment: prod.qCom }, lastUpdated: new Date() },
          });
        } else {
          await prisma.stock.create({
            data: {
              restaurantId,
              ingredientId: ingredient.id,
              currentQuantity: prod.qCom,
            },
          });
        }

        // Create stock movement
        await prisma.stockMovement.create({
          data: {
            restaurantId,
            ingredientId: ingredient.id,
            quantity: prod.qCom,
            movementType: 'ENTRY',
            reason: `NF-e ${nfe.nNF} - ${nfe.emitente}`,
            referenceId: invoice.id,
            referenceType: 'INVOICE',
          },
        });

        // Update ingredient cost
        await prisma.ingredient.update({
          where: { id: ingredient.id },
          data: { referenceCost: prod.vUnCom, lastCostUpdate: new Date() },
        });

        results.push({ produto: prod.xProd, matched: true, ingredient: ingredient.name, qty: prod.qCom, unit: prod.uCom });
      } else {
        results.push({ produto: prod.xProd, matched: false, qty: prod.qCom, unit: prod.uCom });
      }
    }

    return NextResponse.json({
      success: true,
      invoice: { id: invoice.id, number: nfe.nNF, supplier: nfe.emitente, total: nfe.vNF, date: nfe.dhEmi },
      items: results,
      matchedCount: results.filter((r) => r.matched).length,
      totalCount: results.length,
    });
  } catch (error) {
    console.error('Error importing NF-e XML:', error);
    return NextResponse.json({ error: 'Erro ao importar XML' }, { status: 500 });
  }
}
