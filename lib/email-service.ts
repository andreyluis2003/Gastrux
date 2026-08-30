// @ts-nocheck
export interface EmailNotificationParams {
  notificationId: string;
  subject: string;
  htmlBody: string;
  recipientEmail: string;
}

export async function sendNotificationEmail(params: EmailNotificationParams) {
  const {
    notificationId,
    subject,
    htmlBody,
    recipientEmail,
  } = params;

  try {
    const appUrl = process.env.NEXTAUTH_URL || '';
    const appName = 'Gastrux';
    const senderEmail = process.env.SENDER_EMAIL || `noreply@${appUrl ? new URL(appUrl).hostname : 'gastrux.com'}`;

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
        sender_alias: appName,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      if (result.notification_disabled) {
        console.log(`[EMAIL] Notification disabled by user: ${notificationId}`);
        return { success: true, disabled: true };
      }
      throw new Error(result.message || 'Failed to send notification');
    }

    return { success: true, disabled: false };
  } catch (error) {
    console.error('[EMAIL ERROR]', error);
    throw error;
  }
}

export function buildCriticalStockAlertEmail(
  criticalItems: Array<{
    code: string;
    name: string;
    currentStock: number;
    daysUntilEmpty: number;
    suggestedReorderQty: number;
    standardUnit: string;
  }>
): string {
  const itemsHtml = criticalItems
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <strong>${item.code}</strong>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          ${item.name}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
          ${item.currentStock.toFixed(2)} ${item.standardUnit}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          <span style="color: #dc2626; font-weight: bold;">${item.daysUntilEmpty.toFixed(1)} dias</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
          ${item.suggestedReorderQty.toFixed(2)} ${item.standardUnit}
        </td>
      </tr>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Alerta de Estoque Crítico</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 30px; }
        .alert-box { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .alert-box strong { color: #991b1b; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        table th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
        .action-button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
        .action-button:hover { background: #b91c1c; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ Alerta de Estoque Crítico</h1>
          <p>Ação imediata necessária</p>
        </div>
        
        <div class="content">
          <div class="alert-box">
            <strong>🔴 ${criticalItems.length} insumo(s) em nível crítico!</strong> Sua reposição deve ser priorizada imediatamente.
          </div>

          <p>Os seguintes insumos atingiram níveis críticos de estoque:</p>

          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Insumo</th>
                <th>Estoque Atual</th>
                <th>Dias até Vazio</th>
                <th>Qty. Recomendada</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <p style="color: #6b7280; font-size: 13px; margin-top: 20px;">
            <strong>Dica:</strong> Acesse o módulo de Previsões para ver todas as informações de estoque e reordenar automaticamente.
          </p>

          <a href="${process.env.NEXTAUTH_URL}/previsoes" class="action-button">
            Ir para Previsões
          </a>
        </div>

        <div class="footer">
          <p>Esta é uma notificação automática do sistema de gestão de restaurante.</p>
          <p>Data: ${new Date().toLocaleString('pt-BR')}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function buildDailyReportEmail(
  totalItems: number,
  criticalCount: number,
  movementsToday: number,
  totalValue: number
): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Relatório Diário de Operações</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 30px; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
        .stat-card { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 15px; }
        .stat-card h3 { margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #047857; }
        .stat-card .value { font-size: 24px; font-weight: bold; color: #065f46; }
        .action-button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
        .action-button:hover { background: #059669; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Relatório Diário</h1>
          <p>${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
        
        <div class="content">
          <p>Aqui está um resumo das operações de hoje:</p>

          <div class="stats-grid">
            <div class="stat-card">
              <h3>Total de Insumos</h3>
              <div class="value">${totalItems}</div>
            </div>
            <div class="stat-card">
              <h3>Itens Críticos</h3>
              <div class="value" style="color: #dc2626;">${criticalCount}</div>
            </div>
            <div class="stat-card">
              <h3>Movimentações Hoje</h3>
              <div class="value">${movementsToday}</div>
            </div>
            <div class="stat-card">
              <h3>Valor em Estoque</h3>
              <div class="value">R$ ${totalValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
            </div>
          </div>

          <p style="color: #6b7280; font-size: 13px; margin-top: 20px;">
            ${criticalCount > 0 
              ? `<strong>⚠️ Atenção:</strong> Você tem ${criticalCount} insumo(s) em nível crítico. Recomenda-se fazer reposição em breve.` 
              : '✅ Todos os insumos estão em níveis adequados!'}
          </p>

          <a href="${process.env.NEXTAUTH_URL}/dashboard" class="action-button">
            Ver Dashboard Completo
          </a>
        </div>

        <div class="footer">
          <p>Esta é uma notificação automática do sistema de gestão de restaurante.</p>
          <p>Enviado às ${new Date().toLocaleTimeString('pt-BR')}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
