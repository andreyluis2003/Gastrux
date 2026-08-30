// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Send welcome email to newly signed up users
 * This is called from the signup process
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
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px; margin-bottom: 10px;">🍽️ Bem-vindo!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">Sua jornada para gerenciar o restaurante de forma eficiente começa agora</p>
        </div>
        
        <div style="background: white; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px;">
            Olá ${userName || 'Restauratero'},
          </p>
          
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Você acaba de entrar em uma plataforma que vai transformar a forma como você gerencia seu restaurante. Com ferramentas inteligentes de controle de estoque, POS, planejamento de produção e muito mais.
          </p>

          <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 4px; margin: 30px 0;">
            <h2 style="color: #1e40af; margin-top: 0; font-size: 18px;">🚀 Próximos Passos</h2>
            <ol style="color: #4b5563; line-height: 1.8; margin-bottom: 0;">
              <li><strong>Cadastre seus ingredientes</strong> - Acesse Insumos para adicionar seus produtos</li>
              <li><strong>Configure suas receitas</strong> - Crie suas receitas e controle custos</li>
              <li><strong>Explore o POS</strong> - Teste o sistema de vendas rápidas</li>
              <li><strong>Acompanhe métricas</strong> - Veja seu desempenho em tempo real</li>
            </ol>
          </div>

          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Você está no plano <strong>Starter (Grátis)</strong> com acesso a todos os recursos básicos. Aproveite!
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${appUrl}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Ir para Dashboard
            </a>
          </div>

          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 30px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              <strong>💡 Dica:</strong> Em 3 dias você receberá dicas sobre como aproveitar melhor a plataforma. Aproveite esse tempo para explorar!
            </p>
          </div>

          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Se tiver dúvidas, consulte nossa documentação ou entre em contato com nosso suporte.
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
        notification_id: process.env.NOTIF_ID_EMAIL_DE_BOASVINDAS,
        subject: `Bem-vindo ao ${appName}! 🍽️`,
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
        console.log('Welcome notification disabled by user');
        return NextResponse.json({ success: true, message: 'Notification disabled' });
      }
      throw new Error(result.message || 'Failed to send welcome email');
    }

    return NextResponse.json({ success: true, message: 'Welcome email sent' });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to send email' },
      { status: 500 }
    );
  }
}
