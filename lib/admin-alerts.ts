// @ts-nocheck
/**
 * Admin Alerts Service
 * Envia notificações críticas para o administrador do sistema
 */

interface SendAdminAlertParams {
  notificationId: string;
  subject: string;
  htmlBody: string;
  recipientEmail?: string;
  appUrl?: string;
  appName?: string;
}

const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'andreyluis2003@yahoo.com.br';

/**
 * Envia mensagem para o Telegram do admin (se configurado)
 * Configure TELEGRAM_BOT_TOKEN e TELEGRAM_ADMIN_CHAT_ID no .env
 */
export async function sendTelegramAlert(subject: string, plainText: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) {
    return false; // silently skip if not configured
  }
  try {
    const text = `🚨 *${subject}*\n\n${plainText}\n\n_${new Date().toLocaleString('pt-BR')}_`;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram alert failed:', data);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Telegram alert error:', e);
    return false;
  }
}

/**
 * Strip HTML tags for Telegram plaintext version
 */
function htmlToPlain(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Envia notificação de alerta crítico para o admin
 */
export async function sendAdminAlert(params: SendAdminAlertParams) {
  try {
    const {
      notificationId,
      subject,
      htmlBody,
      recipientEmail = DEFAULT_ADMIN_EMAIL,
      appUrl = process.env.NEXTAUTH_URL || '',
      appName = appUrl ? new URL(appUrl).hostname.split('.')[0] : 'Gastrux',
    } = params;

    const senderEmail = process.env.SENDER_EMAIL || `noreply@${appUrl ? new URL(appUrl).hostname : 'gastrux.com'}`;

    // Fire Telegram alert in parallel (non-blocking, no-op if not configured)
    sendTelegramAlert(subject, htmlToPlain(htmlBody)).catch(() => {});

    const response = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        app_id: process.env.WEB_APP_ID,
        notification_id: notificationId,
        subject,
        body: htmlBody,
        is_html: true,
        recipient_email: recipientEmail,
        sender_email: senderEmail,
        sender_alias: `${appName} - Alertas`,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      if (result.notification_disabled) {
        console.log('Admin notification disabled, skipping email');
        return true;
      }
      throw new Error(result.message || 'Failed to send alert');
    }

    console.log(`Admin alert sent: ${subject}`);
    return true;
  } catch (error) {
    console.error('Error sending admin alert:', error);
    return false;
  }
}

/**
 * Alerta: Pagamento Falhado
 */
export async function alertPaymentFailed(
  restaurantName: string,
  email: string,
  reason: string,
  amount: number
) {
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 20px; margin-bottom: 20px; border-radius: 4px;">
        <h2 style="color: #991b1b; margin-top: 0;">Pagamento Falhado</h2>
        <p style="color: #7f1d1d; margin: 10px 0;"><strong>Restaurante:</strong> ${restaurantName}</p>
        <p style="color: #7f1d1d; margin: 10px 0;"><strong>Email:</strong> ${email}</p>
        <p style="color: #7f1d1d; margin: 10px 0;"><strong>Valor:</strong> R$ ${(amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        <p style="color: #7f1d1d; margin: 10px 0;"><strong>Motivo:</strong> ${reason}</p>
      </div>
      <p style="color: #666; font-size: 12px;">Hora: ${new Date().toLocaleString('pt-BR')}</p>
    </div>
  `;

  return sendAdminAlert({
    notificationId: process.env.NOTIF_ID_PAYMENT_FAILURE_ALERT || '',
    subject: `Pagamento Falhado - ${restaurantName}`,
    htmlBody,
  });
}

/**
 * Alerta: Taxa de Churn Alta
 */
export async function alertHighChurnRate(
  churnRate: number,
  cancelledCount: number
) {
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin-bottom: 20px; border-radius: 4px;">
        <h2 style="color: #92400e; margin-top: 0;">Taxa de Churn Elevada</h2>
        <p style="color: #78350f; margin: 10px 0;"><strong>Taxa de Churn:</strong> ${churnRate.toFixed(2)}%</p>
        <p style="color: #78350f; margin: 10px 0;"><strong>Cancelamentos:</strong> ${cancelledCount}</p>
      </div>
      <p style="color: #666; font-size: 12px;">Hora: ${new Date().toLocaleString('pt-BR')}</p>
    </div>
  `;

  return sendAdminAlert({
    notificationId: process.env.NOTIF_ID_HIGH_CHURN_RATE_ALERT || '',
    subject: `Taxa de Churn Elevada: ${churnRate.toFixed(2)}%`,
    htmlBody,
  });
}

/**
 * Alerta: Queda de MRR
 */
export async function alertMRRDrop(
  currentMRR: number,
  previousMRR: number,
  dropPercentage: number
) {
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 20px; margin-bottom: 20px; border-radius: 4px;">
        <h2 style="color: #991b1b; margin-top: 0;">Queda de MRR</h2>
        <p style="color: #7f1d1d; margin: 10px 0;"><strong>MRR Anterior:</strong> R$ ${(previousMRR / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        <p style="color: #7f1d1d; margin: 10px 0;"><strong>MRR Atual:</strong> R$ ${(currentMRR / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        <p style="color: #7f1d1d; margin: 10px 0;"><strong>Queda:</strong> -${dropPercentage.toFixed(2)}%</p>
      </div>
      <p style="color: #666; font-size: 12px;">Hora: ${new Date().toLocaleString('pt-BR')}</p>
    </div>
  `;

  return sendAdminAlert({
    notificationId: process.env.NOTIF_ID_MRR_DROP_ALERT || '',
    subject: `MRR em Queda: -${dropPercentage.toFixed(2)}%`,
    htmlBody,
  });
}

/**
 * Alerta: Erro Critico do Sistema
 */
export async function alertCriticalSystemError(
  errorTitle: string,
  errorMessage: string,
  errorStack?: string
) {
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 20px; margin-bottom: 20px; border-radius: 4px;">
        <h2 style="color: #991b1b; margin-top: 0;">Erro Critico do Sistema</h2>
        <p style="color: #7f1d1d; margin: 10px 0;"><strong>Erro:</strong> ${errorTitle}</p>
        <p style="color: #7f1d1d; margin: 10px 0;"><strong>Mensagem:</strong> ${errorMessage}</p>
      </div>
      <p style="color: #666; font-size: 12px;">Hora: ${new Date().toLocaleString('pt-BR')}</p>
    </div>
  `;

  return sendAdminAlert({
    notificationId: process.env.NOTIF_ID_CRITICAL_SYSTEM_ERROR || '',
    subject: `ERRO CRITICO: ${errorTitle}`,
    htmlBody,
  });
}
