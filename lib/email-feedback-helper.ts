// @ts-nocheck
/**
 * Simple sentiment analysis for email feedback comments
 */
export function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  if (!text) return 'neutral';

  const lowerText = text.toLowerCase();

  const positiveWords = [
    'good', 'great', 'useful', 'helpful', 'excellent', 'perfect', 'amazing',
    'love', 'awesome', 'fantastic', 'wonderful', 'liked', 'appreciate',
    'bom', 'otimo', 'util', 'excelente', 'perfeito', 'incrivel', 'adorei'
  ];

  const negativeWords = [
    'bad', 'poor', 'useless', 'not helpful', 'terrible', 'awful', 'hate',
    'disappointing', 'waste', 'boring', 'confusing', 'ruim', 'pouco',
    'nao ajudou', 'confuso', 'decepcionante'
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  positiveWords.forEach(word => {
    if (lowerText.includes(word)) positiveCount++;
  });

  negativeWords.forEach(word => {
    if (lowerText.includes(word)) negativeCount++;
  });

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

/**
 * Generate feedback survey HTML for email
 */
export function generateFeedbackSurveyHTML(userId: string, emailType: string): string {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const feedbackUrl = `${baseUrl}/feedback?user_id=${userId}&email_type=${emailType}`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding: 20px 0;">
          <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">
            Esse email foi util para voce?
          </p>
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding: 0 5px;">
                <a href="${feedbackUrl}&helpful=true" style="display: inline-block; padding: 8px 16px; background-color: #10b981; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">Sim</a>
              </td>
              <td style="padding: 0 5px;">
                <a href="${feedbackUrl}&helpful=false" style="display: inline-block; padding: 8px 16px; background-color: #ef4444; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">Nao</a>
              </td>
            </tr>
          </table>
          <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
            <a href="${feedbackUrl}" style="color: #3b82f6; text-decoration: none;">Deixar comentario detalhado</a>
          </p>
        </td>
      </tr>
    </table>
  `;
}
