// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

/**
 * Send day 3 email to users - Primeiros Passos
 * This should be called by a scheduled task 3 days after signup
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, userEmail, userName } = await request.json();

    if (!userId || !userEmail) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXTAUTH_URL || '';
    const appName = appUrl ? new URL(appUrl).hostname.split('.')[0] : 'Gastrux';

    const htmlBody = `
      <div style="font-family: 'Poppins', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px; border-radius: 12px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px; margin-bottom: 10px;">📚 Primeiros Passos</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">Dicas para aproveitar ao máximo o seu restaurante</p>
        </div>
        
        <div style="background: white; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px;">
            Olá ${userName || 'Restauratero'},
          </p>
          
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Esperamos que você esteja gostando da plataforma! Nos últimos 3 dias você descobriu algumas funcionalidades. Agora vamos te ensinar como aproveitar ao máximo cada ferramenta.
          </p>

          <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; border-radius: 4px; margin: 30px 0;">
            <h2 style="color: #065f46; margin-top: 0; font-size: 18px;">✅ Tarefas Recomendadas</h2>
            <div style="color: #4b5563; line-height: 1.8;">
              <p><strong>1. Configurar Categorias de Ingredientes</strong></p>
              <p style="margin-left: 20px; margin-top: -10px; color: #6b7280; font-size: 14px;">Organize seus insumos por tipo (proteínas, verduras, temperos, etc)</p>
              
              <p style="margin-top: 15px;"><strong>2. Registrar Primeira Receita</strong></p>
              <p style="margin-left: 20px; margin-top: -10px; color: #6b7280; font-size: 14px;">Crie uma receita para analisar custos automaticamente</p>
              
              <p style="margin-top: 15px;"><strong>3. Fazer Primeira Venda</strong></p>
              <p style="margin-left: 20px; margin-top: -10px; color: #6b7280; font-size: 14px;">Teste o POS system para familiarizar-se</p>
              
              <p style="margin-top: 15px;"><strong>4. Explorar Relatórios</strong></p>
              <p style="margin-left: 20px; margin-top: -10px; color: #6b7280; font-size: 14px;">Veja analytics e métricas do seu restaurante</p>
            </div>
          </div>

          <div style="background: #e0f2fe; border-left: 4px solid #0284c7; padding: 20px; border-radius: 4px; margin: 30px 0;">
            <h2 style="color: #0c4a6e; margin-top: 0; font-size: 16px;">💡 Dica do Dia</h2>
            <p style="margin: 0; color: #1e40af; font-size: 14px;">
              <strong>Você sabia?</strong> Você pode criar planejamentos de produção automaticamente. Isso ajuda a prever o que você precisa preparar com base na demanda histórica.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${appUrl}/tutorial" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Ver Guia Completo
            </a>
          </div>

          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Você está fazendo ótimo progresso! Continue explorando e em breve você será um expert em usar a plataforma.
          </p>

          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Nos vemos em mais 4 dias com novas dicas e oportunidades!
          </p>
        </div>
      </div>
    `;

    const response = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        app_id: process.env.WEB_APP_ID,
        notification_id: process.env.NOTIF_ID_EMAIL_PRIMEIROS_PASSOS_DIA_3,
        subject: `${userName}, confira suas primeiras dicas 📚`,
        body: htmlBody,
        is_html: true,
        recipient_email: userEmail,
        sender_email: process.env.SENDER_EMAIL || `noreply@${new URL(appUrl).hostname}`,
        sender_alias: appName,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      if (result.notification_disabled) {
        console.log('Day 3 notification disabled by user');
        return NextResponse.json({ success: true, message: 'Notification disabled' });
      }
      throw new Error(result.message || 'Failed to send day 3 email');
    }

    return NextResponse.json({ success: true, message: 'Day 3 email sent' });
  } catch (error) {
    console.error('Error sending day 3 email:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to send email' },
      { status: 500 }
    );
  }
}
