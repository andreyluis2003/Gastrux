// @ts-nocheck
import { prisma } from '@/lib/prisma';
import { sendNotificationEmail } from '@/lib/email-service';

/**
 * Heuristics to detect potential hallucinations in AI answers.
 * Returns true if any red flag is hit.
 */
export function detectHallucination(question: string, answer: string): { flag: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const a = answer.toLowerCase();

  // Empty / too short
  if (!answer || answer.trim().length < 15) reasons.push('Resposta muito curta ou vazia');

  // Generic non-answer phrases (probably hallucinating instead of saying "I don't know")
  const evasive = ['como mencionado anteriormente', 'segundo a documentação oficial gastrux versão'];
  for (const p of evasive) if (a.includes(p) && !a.includes('não encontrei')) reasons.push(`Frase evasiva: "${p}"`);

  // Mentions features that don't exist (basic blocklist of fake terms)
  const fakeTerms = ['gastrux pro max', 'gastrux enterprise unlimited', 'plano "premium gold"', 'integração com sap padrão'];
  for (const t of fakeTerms) if (a.includes(t)) reasons.push(`Termo inexistente: "${t}"`);

  // Hallucinated URLs (gastrux.com paths that are unlikely)
  const urlMatches = answer.match(/https?:\/\/[^\s)]+/g) || [];
  for (const url of urlMatches) {
    if (url.includes('gastrux.com') && /\/(api-secret|hidden-admin|root-config)/i.test(url)) {
      reasons.push(`URL suspeita: ${url}`);
    }
  }

  // Confident assertion of unknown numbers (R$ without context)
  if (/r\$\s?\d{4,}/i.test(answer) && !/preço|valor|plano|mensal|trial/i.test(answer)) {
    reasons.push('Valor monetário sem contexto');
  }

  // Contradiction with question intent
  if (/preço|valor|custa/i.test(question) && /grátis|gratuito|de graça/i.test(answer) && /mensalidade|cobr/i.test(answer)) {
    reasons.push('Resposta contraditória sobre preço');
  }

  return { flag: reasons.length > 0, reasons };
}

/**
 * Compute quality metrics over a time window (default 24h).
 */
export async function computeQualityMetrics(windowHours: number = 24) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const interactions = await prisma.aISupportInteraction.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true, rating: true, thumbsUp: true, hallucinationFlag: true,
      escalatedToHuman: true, resolvedIssue: true, responseTimeMs: true,
    },
  });

  const total = interactions.length;
  if (total === 0) {
    return {
      total: 0, avgRating: null, ratingCount: 0,
      thumbsDownPct: 0, hallucinationPct: 0, escalationPct: 0,
      resolutionRate: null, avgResponseMs: null, since,
    };
  }

  const ratings = interactions.filter(i => i.rating != null).map(i => i.rating!);
  const thumbsDown = interactions.filter(i => i.thumbsUp === false).length;
  const halluc = interactions.filter(i => i.hallucinationFlag).length;
  const escalated = interactions.filter(i => i.escalatedToHuman).length;
  const resolvedSet = interactions.filter(i => i.resolvedIssue !== null);
  const resolved = resolvedSet.filter(i => i.resolvedIssue === true).length;
  const respTimes = interactions.filter(i => i.responseTimeMs != null).map(i => i.responseTimeMs!);

  return {
    total,
    ratingCount: ratings.length,
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    thumbsDownPct: (thumbsDown / total) * 100,
    hallucinationPct: (halluc / total) * 100,
    escalationPct: (escalated / total) * 100,
    resolutionRate: resolvedSet.length ? (resolved / resolvedSet.length) * 100 : null,
    avgResponseMs: respTimes.length ? respTimes.reduce((a, b) => a + b, 0) / respTimes.length : null,
    since,
  };
}

// Default thresholds (configurable via env)
export const THRESHOLDS = {
  minAvgRating: Number(process.env.AI_MIN_RATING || 3.5),
  maxHallucinationPct: Number(process.env.AI_MAX_HALLUCINATION_PCT || 10),
  maxEscalationPct: Number(process.env.AI_MAX_ESCALATION_PCT || 25),
  maxThumbsDownPct: Number(process.env.AI_MAX_THUMBS_DOWN_PCT || 30),
  maxAvgResponseMs: Number(process.env.AI_MAX_RESPONSE_MS || 8000),
  minSampleSize: Number(process.env.AI_MIN_SAMPLE || 10),
};

/**
 * Evaluate metrics, create alert records, and email admins on threshold breaches.
 */
export async function evaluateAndAlert(windowHours: number = 24) {
  const m = await computeQualityMetrics(windowHours);
  const created: any[] = [];

  if (m.total < THRESHOLDS.minSampleSize) {
    return { metrics: m, alerts: [], skipped: 'Amostra insuficiente' };
  }

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);

  const checks = [
    {
      cond: m.avgRating != null && m.avgRating < THRESHOLDS.minAvgRating,
      type: 'low_rating',
      severity: m.avgRating != null && m.avgRating < THRESHOLDS.minAvgRating - 0.7 ? 'critical' : 'warning',
      title: 'Avaliação média do agente IA caiu',
      desc: `A nota média ficou em ${m.avgRating?.toFixed(2)} (limite: ${THRESHOLDS.minAvgRating}) nas últimas ${windowHours}h.`,
      value: m.avgRating || 0,
      threshold: THRESHOLDS.minAvgRating,
    },
    {
      cond: m.hallucinationPct > THRESHOLDS.maxHallucinationPct,
      type: 'hallucination_spike',
      severity: m.hallucinationPct > THRESHOLDS.maxHallucinationPct * 1.5 ? 'critical' : 'warning',
      title: 'Possíveis alucinações detectadas no agente IA',
      desc: `${m.hallucinationPct.toFixed(1)}% das respostas foram sinalizadas (limite: ${THRESHOLDS.maxHallucinationPct}%) em ${m.total} interações.`,
      value: m.hallucinationPct,
      threshold: THRESHOLDS.maxHallucinationPct,
    },
    {
      cond: m.escalationPct > THRESHOLDS.maxEscalationPct,
      type: 'high_escalation',
      severity: 'warning',
      title: 'Taxa de escalonamento ao humano elevada',
      desc: `${m.escalationPct.toFixed(1)}% dos atendimentos foram escalonados (limite: ${THRESHOLDS.maxEscalationPct}%).`,
      value: m.escalationPct,
      threshold: THRESHOLDS.maxEscalationPct,
    },
    {
      cond: m.thumbsDownPct > THRESHOLDS.maxThumbsDownPct,
      type: 'negative_feedback',
      severity: 'warning',
      title: 'Feedback negativo acima do esperado',
      desc: `${m.thumbsDownPct.toFixed(1)}% das respostas receberam 👎 (limite: ${THRESHOLDS.maxThumbsDownPct}%).`,
      value: m.thumbsDownPct,
      threshold: THRESHOLDS.maxThumbsDownPct,
    },
    {
      cond: m.avgResponseMs != null && m.avgResponseMs > THRESHOLDS.maxAvgResponseMs,
      type: 'response_time',
      severity: 'info',
      title: 'Tempo de resposta da IA elevado',
      desc: `Tempo médio de ${(m.avgResponseMs! / 1000).toFixed(1)}s (limite: ${THRESHOLDS.maxAvgResponseMs / 1000}s).`,
      value: m.avgResponseMs || 0,
      threshold: THRESHOLDS.maxAvgResponseMs,
    },
  ];

  for (const c of checks) {
    if (!c.cond) continue;
    // Don't double-alert: check for unresolved alert of same type in last 12h
    const recent = await prisma.aIQualityAlert.findFirst({
      where: { alertType: c.type, resolved: false, createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
    });
    if (recent) continue;

    const alert = await prisma.aIQualityAlert.create({
      data: {
        alertType: c.type, severity: c.severity, title: c.title, description: c.desc,
        metricValue: c.value, threshold: c.threshold, windowStart, windowEnd,
      },
    });
    created.push(alert);

    // Email admins
    try {
      const admins = await prisma.user.findMany({
        where: { role: 'OWNER', active: true }, select: { email: true }, take: 5,
      });
      const html = renderAlertEmail(alert, m, windowHours);
      const sender = process.env.NEXTAUTH_URL ? `noreply@${new URL(process.env.NEXTAUTH_URL).hostname}` : undefined;
      for (const admin of admins) {
        if (!admin.email) continue;
        await sendNotificationEmail({
          notificationId: process.env.NOTIF_ID_AI_QUALITY_ALERT,
          subject: `[${c.severity.toUpperCase()}] ${c.title} — Gastrux IA`,
          htmlBody: html,
          recipientEmail: admin.email,
          ...(sender ? { sender_email: sender } : {}),
        });
      }
      await prisma.aIQualityAlert.update({ where: { id: alert.id }, data: { notifiedAt: new Date() } });
    } catch (err) {
      console.error('[AI-MONITOR] notify error', err);
    }
  }

  return { metrics: m, alerts: created };
}

function renderAlertEmail(alert: any, m: any, windowHours: number): string {
  const sevColor = alert.severity === 'critical' ? '#dc2626' : alert.severity === 'warning' ? '#f59e0b' : '#2563eb';
  const url = process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/admin/ia-monitoring` : '';
  return `<html><body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#f3f4f6;">
    <div style="max-width:640px;margin:0 auto;padding:32px 24px;">
      <div style="background:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,${sevColor},${sevColor}cc);padding:24px 32px;color:#fff;">
          <p style="margin:0 0 4px;opacity:.85;font-size:12px;letter-spacing:.5px;text-transform:uppercase;">Alerta de qualidade — IA de Suporte</p>
          <h1 style="margin:0;font-size:22px;">${alert.title}</h1>
        </div>
        <div style="padding:24px 32px;">
          <p style="color:#374151;line-height:1.6;">${alert.description}</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;">Resumo das últimas ${windowHours}h</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:4px 0;color:#6b7280;">Interações</td><td style="text-align:right;font-weight:600;">${m.total}</td></tr>
              <tr><td style="padding:4px 0;color:#6b7280;">Nota média</td><td style="text-align:right;font-weight:600;">${m.avgRating != null ? m.avgRating.toFixed(2) : '—'}</td></tr>
              <tr><td style="padding:4px 0;color:#6b7280;">% Alucinações</td><td style="text-align:right;font-weight:600;">${m.hallucinationPct.toFixed(1)}%</td></tr>
              <tr><td style="padding:4px 0;color:#6b7280;">% Escalonadas</td><td style="text-align:right;font-weight:600;">${m.escalationPct.toFixed(1)}%</td></tr>
              <tr><td style="padding:4px 0;color:#6b7280;">% Feedback negativo</td><td style="text-align:right;font-weight:600;">${m.thumbsDownPct.toFixed(1)}%</td></tr>
              <tr><td style="padding:4px 0;color:#6b7280;">Tempo médio</td><td style="text-align:right;font-weight:600;">${m.avgResponseMs != null ? (m.avgResponseMs / 1000).toFixed(1) + 's' : '—'}</td></tr>
            </table>
          </div>
          <p style="color:#6b7280;font-size:13px;">Severidade: <strong style="color:${sevColor};text-transform:uppercase;">${alert.severity}</strong></p>
          ${url ? `<p style="text-align:center;margin-top:24px;"><a href="${url}" style="display:inline-block;background:${sevColor};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Ver painel de monitoramento</a></p>` : ''}
        </div>
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">Gastrux — Monitoramento automático da IA de Suporte</p>
    </div>
  </body></html>`;
}
