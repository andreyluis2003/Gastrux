// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getRestaurantId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  return u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId || null;
}

async function gatherData(type: string, restaurantId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (type === 'SALES') {
    const [transactions, topItems, dailySales] = await Promise.all([
      prisma.pOSTransaction.aggregate({
        where: { restaurantId, transactionDate: { gte: thirtyDaysAgo }, status: 'COMPLETED' },
        _count: true,
        _sum: { amount: true },
        _avg: { amount: true },
      }),
      prisma.pOSTransaction.findMany({
        where: { restaurantId, transactionDate: { gte: thirtyDaysAgo }, status: 'COMPLETED' },
        take: 50,
        orderBy: { transactionDate: 'desc' },
        select: { amount: true, items: true, paymentMethod: true, transactionDate: true },
      }),
      prisma.pOSTransaction.groupBy({
        by: ['paymentMethod'],
        where: { restaurantId, transactionDate: { gte: thirtyDaysAgo }, status: 'COMPLETED' },
        _count: true,
        _sum: { amount: true },
      }),
    ]);
    return { transactions, topItems, dailySales };
  }

  if (type === 'INVENTORY') {
    const [ingredients, lowStock, stockMovements] = await Promise.all([
      prisma.ingredient.count({ where: { active: true, restaurantId } }),
      prisma.ingredient.findMany({
        where: { active: true, restaurantId },
        take: 20,
        include: { currentStock: true },
      }),
      prisma.stockMovement.findMany({
        where: { restaurantId, createdAt: { gte: thirtyDaysAgo } },
        take: 100,
        orderBy: { createdAt: 'desc' },
        select: { movementType: true, quantity: true, reason: true, createdAt: true },
      }),
    ]);
    const lowStockCount = lowStock.filter((i: any) => (i.currentStock?.currentQuantity ?? 0) < (i.minimumStock || 0)).length;
    return { totalIngredients: ingredients, lowStockCount, stockMovements: stockMovements.length, sampleMovements: stockMovements.slice(0, 20) };
  }

  if (type === 'CUSTOMERS') {
    const [total, topSpenders, recent] = await Promise.all([
      prisma.customer.count({ where: { restaurantId } }),
      prisma.customer.findMany({
        where: { restaurantId },
        orderBy: { totalSpent: 'desc' },
        take: 10,
        select: { name: true, totalSpent: true, totalOrders: true, lastOrderAt: true, segment: true },
      }),
      prisma.customer.count({
        where: { restaurantId, createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);
    return { total, newLast30Days: recent, topSpenders };
  }

  if (type === 'MENU') {
    const [recipes, costs] = await Promise.all([
      prisma.recipe.count({ where: { restaurantId, active: true } }),
      prisma.recipe.findMany({
        where: { restaurantId, active: true },
        take: 20,
        select: { name: true, sellingPrice: true, costPerPortion: true, totalCost: true, baseYield: true },
      }),
    ]);
    const withMargin = costs.map((r: any) => ({
      name: r.name,
      sellingPrice: r.sellingPrice,
      costPerPortion: r.costPerPortion,
      margin: r.sellingPrice && r.costPerPortion ? ((r.sellingPrice - r.costPerPortion) / r.sellingPrice * 100).toFixed(1) : null,
    }));
    return { totalRecipes: recipes, samples: withMargin };
  }

  if (type === 'FINANCIAL') {
    const revenue = await prisma.pOSTransaction.aggregate({
      where: { restaurantId, transactionDate: { gte: thirtyDaysAgo }, status: 'COMPLETED' },
      _sum: { amount: true },
      _count: true,
    });
    let costs30d = 0;
    try {
      const invoices = await prisma.invoice.aggregate({
        where: { restaurantId, createdAt: { gte: thirtyDaysAgo } } as any,
        _sum: { totalAmount: true },
      } as any);
      costs30d = Number((invoices as any)._sum?.totalAmount || 0);
    } catch {}
    return {
      revenue30d: Number(revenue._sum?.amount || 0),
      transactions: revenue._count,
      costs30d,
    };
  }

  return { note: 'Tipo não suportado' };
}

const PROMPTS: Record<string, string> = {
  SALES: `Você é um analista sênior de operação de restaurantes. Analise os dados de vendas e gere insights ACIONÁVEIS em português do Brasil.

Não seja genérico. Aponte padrões concretos, oportunidades e 3 ações prioritárias para a próxima semana.`,
  INVENTORY: `Você é um especialista em gestão de estoque para restaurantes. Analise o estoque atual e movimentações. Identifique:
1. Itens com possível ruptura ou desperdício.
2. Padrões de consumo.
3. 3 ações prioritárias (compras, ajuste de mínimo, auditoria).
Responda em português do Brasil.`,
  CUSTOMERS: `Você é um estrategista de CRM/retenção em F&B. Analise a base de clientes e proponha:
1. Segmentos mais valiosos.
2. Oportunidades de reativação ou cross-sell.
3. 3 ações de marketing baseadas em dados. Português do Brasil.`,
  MENU: `Você é um consultor de menu engineering (stars / plowhorses / puzzles / dogs). Analise as receitas, identifique estrelas e oportunidades de ajuste de preço ou composição. 3 ações prioritárias. Português do Brasil.`,
  FINANCIAL: `Você é um CFO fracionário de restaurante. Analise receita e custos e identifique: margem, CMV provável, alertas financeiros. 3 ações prioritárias para a semana. Português do Brasil.`,
  OPERATIONAL: `Você é um diretor de operações. Analise os dados e sugira melhorias operacionais, de staffing ou processos. 3 ações prioritárias. Português do Brasil.`,
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!session || !userId) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { type = 'SALES' } = body || {};
    const allowed = ['SALES', 'INVENTORY', 'CUSTOMERS', 'MENU', 'FINANCIAL', 'OPERATIONAL'];
    if (!allowed.includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }

    const restaurantId = await getRestaurantId(userId);
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 400 });
    }

    const snapshot = await gatherData(type, restaurantId);

    const systemPrompt = `${PROMPTS[type]}

Retorne RIGOROSAMENTE em formato JSON valido:
{
  "title": "Titulo curto do insight",
  "summary": "Resumo em 1-2 frases",
  "content": "Insights detalhados em markdown com secoes claras (## Tendencia, ## Oportunidades, ## Acoes Prioritarias). Use bullets e seja especifico.",
  "score": numero_0_100_de_oportunidade,
  "tags": ["tag1", "tag2"]
}`;

    const userMsg = `Analise os seguintes dados (ultimos 30 dias salvo indicado):

${JSON.stringify(snapshot, null, 2)}`;

    const llmResp = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2500,
      }),
    });

    if (!llmResp.ok) {
      console.error('[ai-insights]', await llmResp.text().catch(() => ''));
      return NextResponse.json({ error: 'Falha ao gerar insight (LLM)' }, { status: 502 });
    }

    const llmData = await llmResp.json();
    const raw = llmData.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      console.error('[ai-insights] parse', e);
      parsed = { title: 'Insight gerado', summary: raw.slice(0, 120), content: raw };
    }

    const insight = await prisma.aIInsight.create({
      data: {
        type,
        title: parsed.title || 'Insight',
        summary: parsed.summary || '',
        content: parsed.content || '',
        dataSnapshot: JSON.stringify(snapshot).slice(0, 30000),
        timeRange: 'last_30_days',
        score: parsed.score != null ? Number(parsed.score) : null,
        tags: parsed.tags ? JSON.stringify(parsed.tags) : null,
        restaurantId,
        createdById: userId,
      },
    });

    return NextResponse.json({ insight });
  } catch (err: any) {
    console.error('[ai-insights/generate]', err);
    return NextResponse.json({ error: 'Erro ao gerar insight' }, { status: 500 });
  }
}
