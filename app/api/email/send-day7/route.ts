// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

/**
 * Send day 7 email to users - Upgrade Opportunity
 * This should be called by a scheduled task 7 days after signup
 */
export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('x-cron-secret');
    if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

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
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px; margin-bottom: 10px;">🚀 Próximo Passo</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">Descubra como potencializar seu restaurante com recursos avançados</p>
        </div>
        
        <div style="background: white; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px;">
            ${userName || 'Restauratero'}, que jornada incrível!
          </p>
          
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Você está no teste de 30 dias com tudo do Business. Aproveite para usar o que traz dinheiro e evita perdas, e escolha o plano antes do fim do teste.
          </p>

          <div style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%); border-left: 4px solid #8b5cf6; padding: 20px; border-radius: 4px; margin: 30px 0;">
            <h2 style="color: #6d28d9; margin-top: 0; font-size: 18px;">⭐ O que só o Business tem</h2>
            <div style="color: #4b5563; line-height: 1.8;">
              <p style="margin: 10px 0;">📱 Pagamento na mesa pelo celular (Pix e cartão)</p>
              <p style="margin: 10px 0;">⏰ Controle de validades com aviso</p>
              <p style="margin: 10px 0;">💡 Indicadores das contas de luz, água e gás</p>
              <p style="margin: 10px 0;">🎁 Campanhas e programa de fidelidade</p>
              <p style="margin: 10px 0;">👥 5 usuários e 5 estações de cozinha</p>
            </div>
          </div>

          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 30px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              <strong>Pro R$ 149 ou Business R$ 199 por mês.</strong> Por R$ 50 a mais, o Business inclui tudo acima.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${appUrl}/pricing" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Escolher plano
            </a>
          </div>

          <div style="text-align: center; margin: 20px 0;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              Ao fim do teste sem plano, seus dados ficam guardados para consulta
            </p>
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 4px; margin: 30px 0;">
            <h3 style="color: #374151; margin-top: 0; font-size: 14px; margin-bottom: 10px;">📞 Precisa de ajuda?</h3>
            <p style="color: #4b5563; font-size: 14px; margin: 0;">
              Entre em contato conosco se tiver dúvidas sobre qual plano é melhor para seu restaurante. Estamos aqui para ajudar!
            </p>
          </div>

          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Obrigado por ser parte da comunidade ${appName}! 🎉
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
        notification_id: process.env.NOTIF_ID_EMAIL_PRXIMO_PASSO_DIA_7,
        subject: `${userName}, está pronto para o próximo nível? 🚀`,
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
        console.log('Day 7 notification disabled by user');
        return NextResponse.json({ success: true, message: 'Notification disabled' });
      }
      throw new Error(result.message || 'Failed to send day 7 email');
    }

    return NextResponse.json({ success: true, message: 'Day 7 email sent' });
  } catch (error) {
    console.error('Error sending day 7 email:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to send email' },
      { status: 500 }
    );
  }
}
