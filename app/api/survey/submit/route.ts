// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    const data = await req.json();

    // Validação básica
    if (!data.currentSystem || !data.willingnessToPayRaw) {
      return NextResponse.json(
        { error: 'Dados incompletos' },
        { status: 400 }
      );
    }

    // Converter WTP para BRL em centavos
    const wtpMap: { [key: string]: number } = {
      'none': 0,
      '50': 5000,
      '100': 10000,
      '200': 20000,
      '500': 50000,
    };

    // Criar ou atualizar resposta do survey
    const surveyResponse = await prisma.surveyResponse.upsert({
      where: { userId: user.id },
      update: {
        currentSystem: data.currentSystem,
        painPoints: data.painPoints,
        willingnessToPayRaw: data.willingnessToPayRaw,
        willingnessToPayBRL: wtpMap[data.willingnessToPayRaw] || 0,
        mostImportantFeature: data.mostImportantFeature,
        featureRanking: data.featureRanking,
        businessUnits: data.businessUnits,
        monthlyRevenue: data.monthlyRevenue,
        employeeCount: data.employeeCount,
        willingToTalk: data.willingToTalk,
        preferredContact: data.preferredContact || null,
        contactInfo: data.contactInfo || null,
        completedInSeconds: data.completedInSeconds,
        source: 'dashboard',
        isWarmLead: data.willingToTalk === true,
      },
      create: {
        userId: user.id,
        currentSystem: data.currentSystem,
        painPoints: data.painPoints,
        willingnessToPayRaw: data.willingnessToPayRaw,
        willingnessToPayBRL: wtpMap[data.willingnessToPayRaw] || 0,
        mostImportantFeature: data.mostImportantFeature,
        featureRanking: data.featureRanking,
        businessUnits: data.businessUnits,
        monthlyRevenue: data.monthlyRevenue,
        employeeCount: data.employeeCount,
        willingToTalk: data.willingToTalk,
        preferredContact: data.preferredContact || null,
        contactInfo: data.contactInfo || null,
        completedInSeconds: data.completedInSeconds,
        source: 'dashboard',
        isWarmLead: data.willingToTalk === true,
      },
    });

    // Recalcular analytics (executar em background, sem aguardar)
    updateSurveyAnalytics().catch(console.error);

    return NextResponse.json(
      {
        success: true,
        data: surveyResponse,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao processar survey:', error);
    return NextResponse.json(
      { error: 'Erro ao processar survey' },
      { status: 500 }
    );
  }
}

/**
 * Recalcula as estatísticas gerais do survey
 */
async function updateSurveyAnalytics() {
  try {
    // Buscar todas as respostas
    const responses = await prisma.surveyResponse.findMany();

    if (responses.length === 0) return;

    // Calcular distribuição de WTP
    const wtpDistribution: { [key: string]: number } = {};
    responses.forEach(r => {
      const raw = r.willingnessToPayRaw || 'none';
      wtpDistribution[raw] = (wtpDistribution[raw] || 0) + 1;
    });

    // Calcular pain points mais comuns
    const painPointCounts: { [key: string]: number } = {};
    responses.forEach(r => {
      (r.painPoints || []).forEach(pain => {
        painPointCounts[pain] = (painPointCounts[pain] || 0) + 1;
      });
    });

    const topPainPoints = Object.entries(painPointCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([pain, count]) => ({
        pain,
        count,
        pct: Math.round((count / responses.length) * 100),
      }));

    // Calcular features mais importantes
    const featureCounts: { [key: string]: number } = {};
    responses.forEach(r => {
      (r.featureRanking || []).forEach((feature, idx) => {
        // Features no início da ranking têm mais peso
        const weight = 1 / (idx + 1);
        featureCounts[feature] = (featureCounts[feature] || 0) + weight;
      });
    });

    const topFeatures = Object.entries(featureCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([feature, score]) => ({
        feature,
        score: Math.round(score),
        pct: Math.round((score / Object.values(featureCounts).reduce((a, b) => a + b, 0)) * 100),
      }));

    // Segmentação por unidades
    const segmentationByUnits: { [key: string]: number } = {};
    responses.forEach(r => {
      const units = r.businessUnits || 'unknown';
      segmentationByUnits[units] = (segmentationByUnits[units] || 0) + 1;
    });

    // Segmentação por revenue
    const segmentationByRevenue: { [key: string]: number } = {};
    responses.forEach(r => {
      const revenue = r.monthlyRevenue || 'unknown';
      segmentationByRevenue[revenue] = (segmentationByRevenue[revenue] || 0) + 1;
    });

    // Distribuição de métodos de contato
    const contactMethods: { [key: string]: number } = {};
    responses
      .filter(r => r.willingToTalk && r.preferredContact)
      .forEach(r => {
        const method = r.preferredContact || 'other';
        contactMethods[method] = (contactMethods[method] || 0) + 1;
      });

    // Warm leads
    const warmLeads = responses.filter(r => r.willingToTalk).length;

    // Calcular mediana WTP
    const wtps = responses
      .map(r => r.willingnessToPayBRL || 0)
      .sort((a, b) => a - b);
    const median = wtps[Math.floor(wtps.length / 2)] || 0;

    // Contar monetizáveis (willingness >= 100)
    const monetizable = responses.filter(
      r => r.willingnessToPayBRL && r.willingnessToPayBRL >= 10000
    ).length;

    // Atualizar ou criar o documento de analytics
    await prisma.surveyAnalytics.upsert({
      where: { id: 'default' },
      update: {
        totalResponses: responses.length,
        completionRate: 100,
        averageCompletionTime: Math.round(
          responses.reduce((sum, r) => sum + (r.completedInSeconds || 0), 0) / responses.length
        ),
        willingnessDistribution: JSON.stringify(wtpDistribution),
        medianWtp: median,
        monetizeableSegment: monetizable,
        topPainPoints: JSON.stringify(topPainPoints),
        topFeatures: JSON.stringify(topFeatures),
        segmentationByUnits: JSON.stringify(segmentationByUnits),
        segmentationByRevenue: JSON.stringify(segmentationByRevenue),
        totalWarmLeads: warmLeads,
        contactMethodDistribution: JSON.stringify(contactMethods),
        lastUpdatedAt: new Date(),
      },
      create: {
        id: 'default',
        totalResponses: responses.length,
        completionRate: 100,
        averageCompletionTime: Math.round(
          responses.reduce((sum, r) => sum + (r.completedInSeconds || 0), 0) / responses.length
        ),
        willingnessDistribution: JSON.stringify(wtpDistribution),
        medianWtp: median,
        monetizeableSegment: monetizable,
        topPainPoints: JSON.stringify(topPainPoints),
        topFeatures: JSON.stringify(topFeatures),
        segmentationByUnits: JSON.stringify(segmentationByUnits),
        segmentationByRevenue: JSON.stringify(segmentationByRevenue),
        totalWarmLeads: warmLeads,
        contactMethodDistribution: JSON.stringify(contactMethods),
      },
    });
  } catch (error) {
    console.error('Erro ao atualizar analytics:', error);
  }
}
