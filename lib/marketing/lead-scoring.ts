/**
 * Lead scoring engine.
 * Calcula pontuação de 0-100 baseado em sinais de intenção.
 */

interface LeadSignals {
  source: string;
  hasPhone: boolean;
  hasEmail: boolean;
  hasBusinessName: boolean;
  segment?: string | null;
  utmCampaign?: string | null;
  contactAttempts?: number;
  metadata?: Record<string, any>;
}

export function calculateLeadScore(signals: LeadSignals): number {
  let score = 0;

  // Source quality (0-30)
  const sourceScores: Record<string, number> = {
    WHATSAPP: 25,     // Alta intenção — já interagiu
    SURVEY: 20,       // Preencheu survey
    PPC_CAMPAIGN: 18, // Clicou em anúncio pago
    SEGMENT_PAGE: 15, // Visitou página de segmento
    REFERRAL: 22,     // Indicou alguém
    CALCULATOR: 20,   // Usou calculadora de lucro
    LANDING_PAGE: 12, // Visitou landing page
    ORGANIC: 10,
    MANUAL: 5,
  };
  score += sourceScores[signals.source] || 5;

  // Contact info completeness (0-25)
  if (signals.hasPhone) score += 15;
  if (signals.hasEmail) score += 10;

  // Business info (0-20)
  if (signals.hasBusinessName) score += 12;
  if (signals.segment) score += 8;

  // Campaign engagement (0-15)
  if (signals.utmCampaign) score += 10;
  if (signals.metadata?.willingToTalk) score += 5;

  // Engagement decay (penalize se já tentou contato sem sucesso)
  if (signals.contactAttempts && signals.contactAttempts > 3) {
    score -= Math.min(signals.contactAttempts * 3, 15);
  }

  return Math.max(0, Math.min(100, score));
}

export function getLeadQualification(score: number): 'HOT' | 'WARM' | 'COLD' {
  if (score >= 60) return 'HOT';
  if (score >= 30) return 'WARM';
  return 'COLD';
}
