// @ts-nocheck
// Chi-square test for A/B testing winner determination
export function chiSquareTest(
  variantA: { name: string; successes: number; total: number },
  variantB: { name: string; successes: number; total: number }
) {
  const contingencyTable = [
    [variantA.successes, variantA.total - variantA.successes],
    [variantB.successes, variantB.total - variantB.successes],
  ];

  const grandTotal = variantA.total + variantB.total;
  const totalSuccesses = variantA.successes + variantB.successes;
  const totalFails = (variantA.total - variantA.successes) + (variantB.total - variantB.successes);

  let chiSquare = 0;

  // Calculate chi-square statistic
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const observed = contingencyTable[i][j];
      const rowTotal = i === 0 ? variantA.total : variantB.total;
      const colTotal = j === 0 ? totalSuccesses : totalFails;

      const expected = (rowTotal * colTotal) / grandTotal;
      if (expected > 0) {
        chiSquare += Math.pow(observed - expected, 2) / expected;
      }
    }
  }

  // Critical value for 95% confidence (1 degree of freedom)
  // chi-square(0.05, 1) = 3.841
  const criticalValue = 3.841;
  const isSignificant = chiSquare >= criticalValue;

  // Estimate p-value based on chi-square value (simplified)
  // For chi-square(1 df): critical value at 0.05 is 3.841
  let pValue = 1;
  if (chiSquare > 0) {
    if (chiSquare < 1) pValue = 0.3;
    else if (chiSquare < 2) pValue = 0.15;
    else if (chiSquare < 3.841) pValue = 0.05;
    else pValue = 0.01;
  }

  // Determine winner based on conversion rate
  const rateA = variantA.successes / variantA.total;
  const rateB = variantB.successes / variantB.total;
  const winner = rateA > rateB ? variantA.name : variantB.name;
  const improvement = Math.abs(rateA - rateB) * 100;

  return {
    chiSquare: parseFloat(chiSquare.toFixed(4)),
    pValue: parseFloat(pValue.toFixed(4)),
    isSignificant,
    confidenceLevel: isSignificant ? '95%' : 'Insuficiente',
    winner,
    improvement: parseFloat(improvement.toFixed(2)),
    variantARatePercentage: parseFloat((rateA * 100).toFixed(2)),
    variantBRatePercentage: parseFloat((rateB * 100).toFixed(2)),
  };
}

// Calculate sample size needed for statistical significance
export function calculateMinSampleSize(
  baselineRate: number,
  minDetectableEffect: number = 0.1, // 10% improvement
  confidenceLevel: number = 0.95,
  powerLevel: number = 0.8
) {
  // Simplified formula for required sample size
  // Based on proportions test

  const z_alpha = confidenceLevel === 0.95 ? 1.96 : 1.645;
  const z_beta = powerLevel === 0.8 ? 0.84 : 1.28;

  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minDetectableEffect);

  const p_bar = (p1 + p2) / 2;
  const numerator = Math.pow(z_alpha + z_beta, 2) * (p_bar * (1 - p_bar)) * 2;
  const denominator = Math.pow(p2 - p1, 2);

  const sampleSize = Math.ceil(numerator / denominator);

  return {
    sampleSizePerVariant: sampleSize,
    totalSampleSize: sampleSize * 2,
    minDetectableEffect: `${minDetectableEffect * 100}%`,
  };
}

// Generate recommendations based on campaign performance
export interface CampaignRecommendation {
  type: 'optimize' | 'pause' | 'expand' | 'test' | 'monitor';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string;
}

export function generateCampaignRecommendations(
  campaign: {
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    totalConverted: number;
    segments: Array<{
      segmentName: string;
      sentCount: number;
      openRate: number;
      clickRate: number;
      conversionRate: number;
    }>;
    variants?: Array<{
      variantName: string;
      sentCount: number;
      openRate: number;
      clickRate: number;
    }>;
  }
): CampaignRecommendation[] {
  const recommendations: CampaignRecommendation[] = [];

  const overallOpenRate = campaign.totalSent > 0 ? (campaign.totalOpened / campaign.totalSent) * 100 : 0;
  const overallClickRate = campaign.totalSent > 0 ? (campaign.totalClicked / campaign.totalSent) * 100 : 0;
  const overallConversionRate = campaign.totalSent > 0 ? (campaign.totalConverted / campaign.totalSent) * 100 : 0;

  // Check overall performance
  if (overallOpenRate < 20) {
    recommendations.push({
      type: 'optimize',
      priority: 'high',
      title: 'Taxa de abertura baixa',
      description: `Taxa de abertura de ${overallOpenRate.toFixed(1)}% está abaixo da média (30%). Considere A/B testar assuntos ou horários de envio.`,
      action: 'Teste novos assuntos com A/B testing',
    });
  }

  if (overallClickRate < 5) {
    recommendations.push({
      type: 'optimize',
      priority: 'high',
      title: 'Taxa de clique muito baixa',
      description: `Taxa de clique de ${overallClickRate.toFixed(1)}% indica conteúdo pouco atrativo. Revise CTAs e formatação.`,
      action: 'Otimize o conteúdo e CTAs',
    });
  }

  // Check segment performance variance
  if (campaign.segments.length > 1) {
    const openRates = campaign.segments.map((s) => s.openRate);
    const avgOpenRate = openRates.reduce((a, b) => a + b, 0) / openRates.length;
    const maxVariance = Math.max(...openRates) - Math.min(...openRates);

    if (maxVariance > 30) {
      const bestSegment = campaign.segments.reduce((prev, current) =>
        prev.openRate > current.openRate ? prev : current
      );

      recommendations.push({
        type: 'expand',
        priority: 'medium',
        title: 'Segmento com melhor performance detectado',
        description: `Segmento "${bestSegment.segmentName}" tem taxa de abertura ${bestSegment.openRate.toFixed(1)}%, significativamente acima da média.`,
        action: `Aumente alocação para o segmento "${bestSegment.segmentName}"`,
      });
    }
  }

  // Check for low sample size
  if (campaign.totalSent < 100) {
    recommendations.push({
      type: 'test',
      priority: 'medium',
      title: 'Tamanho de amostra insuficiente',
      description: `Apenas ${campaign.totalSent} emails enviados. Resultados de A/B testing podem não ser estatisticamente significativos.`,
      action: 'Envie para mais usuários antes de tomar decisões',
    });
  } else if (campaign.totalSent > 1000 && overallConversionRate > 0) {
    recommendations.push({
      type: 'monitor',
      priority: 'low',
      title: 'Campanha com bom tamanho de amostra',
      description: `${campaign.totalSent} emails enviados com taxa de conversão ${overallConversionRate.toFixed(2)}%.`,
      action: 'Continue monitorando resultados',
    });
  }

  // Check conversion performance
  if (campaign.totalConverted === 0 && campaign.totalSent > 100) {
    recommendations.push({
      type: 'pause',
      priority: 'high',
      title: 'Nenhuma conversão detectada',
      description: `Após ${campaign.totalSent} envios, nenhuma conversão foi rastreada. Verifique rastreamento e CTA.`,
      action: 'Analise links de rastreamento e CTAs',
    });
  }

  // Variant performance recommendation
  if (campaign.variants && campaign.variants.length === 2) {
    const variantA = campaign.variants[0];
    const variantB = campaign.variants[1];

    if (variantA.sentCount > 50 && variantB.sentCount > 50) {
      const rateA = variantA.openRate;
      const rateB = variantB.openRate;

      if (Math.abs(rateA - rateB) > 15) {
        const winner = rateA > rateB ? 'A' : 'B';
        recommendations.push({
          type: 'optimize',
          priority: 'high',
          title: `Variante ${winner} está vencendo`,
          description: `Variante ${winner} tem taxa de abertura ${Math.max(rateA, rateB).toFixed(1)}%, ${Math.abs(rateA - rateB).toFixed(1)}% acima da outra.`,
          action: `Use variante ${winner} para futuras campanhas`,
        });
      }
    }
  }

  return recommendations;
}

// Predict future performance based on historical data
export function predictPerformance(
  historicalCampaigns: Array<{
    openRate: number;
    clickRate: number;
    conversionRate: number;
  }>,
  currentMetrics: {
    sent: number;
    opened: number;
    clicked: number;
  }
) {
  if (historicalCampaigns.length === 0) {
    return null;
  }

  // Calculate average rates from history
  const avgOpenRate =
    historicalCampaigns.reduce((sum, c) => sum + c.openRate, 0) / historicalCampaigns.length;
  const avgClickRate =
    historicalCampaigns.reduce((sum, c) => sum + c.clickRate, 0) / historicalCampaigns.length;
  const avgConversionRate =
    historicalCampaigns.reduce((sum, c) => sum + c.conversionRate, 0) / historicalCampaigns.length;

  // Predict based on current sends
  const predictedOpens = Math.floor(currentMetrics.sent * (avgOpenRate / 100));
  const predictedClicks = Math.floor(currentMetrics.sent * (avgClickRate / 100));
  const predictedConversions = Math.floor(currentMetrics.sent * (avgConversionRate / 100));

  return {
    predictedOpens,
    predictedClicks,
    predictedConversions,
    confidence: historicalCampaigns.length > 5 ? 'Alta' : 'Média',
    baselineOpenRate: parseFloat(avgOpenRate.toFixed(2)),
    baselineClickRate: parseFloat(avgClickRate.toFixed(2)),
    baselineConversionRate: parseFloat(avgConversionRate.toFixed(2)),
  };
}
