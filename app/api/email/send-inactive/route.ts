// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/email/send-inactive
 * Envia email de "volta para cá" para usuários inativos
 * Body: { userId: string } ou { sendToAll: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'OWNER') {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { userId, sendToAll } = await request.json();
    const appUrl = process.env.NEXTAUTH_URL || '';
    const appName = appUrl ? new URL(appUrl).hostname.split('.')[0] : 'Gastrux';

    const generateEmailHTML = (userName: string) => `
      <div style="font-family: 'Poppins', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px; border-radius: 12px;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px; margin-bottom: 10px;">🙋 Saudades Suas!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">Melhoramos muito e queremos te contar</p>
        </div>
        
        <div style="background: white; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px;">
            Olá ${userName || 'Restauratero'},
          </p>
          
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Notamos que vocé não entra no ${appName} há um tempo. Sabemos que gerenciar um restaurante é catico, mas temos notícias incríveis para compartilhar!
          </p>

          <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; border-radius: 4px; margin: 30px 0;">
            <h2 style="color: #047857; margin-top: 0; font-size: 18px;">✨ O Que Mudou</h2>
            <ul style="color: #047857; line-height: 1.8; margin-bottom: 0; padding-left: 20px;">
              <li><strong>Dashboard 2.0</strong> - Interface completamente redesenhada e mais rápida</li>
              <li><strong>Analytics Avançado</strong> - Relatórios executivos em PDF com insights reais</li>
              <li><strong>Engenharia de Menu</strong> - Descubra quais pratos dão mais lucro</li>
              <li><strong>Módo Offline (PWA)</strong> - Venda mesmo sem internet</li>
              <li><strong>Multi-idioma</strong> - Português, Inglês e Espanhol</li>
              <li><strong>Integração iFood</strong> - Gerencie seus pedidos iFood direto do app</li>
            </ul>
          </div>

          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Sua conta continua ativa com todos os dados que você cadastrou. É só voltar e começar a usar!
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${appUrl}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Voltar ao Dashboard
            </a>
          </div>

          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Se tiver dúvidas ou precisar de ajuda com a configuração, nossa equipe está disponível para ajudar.
          </p>

          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Vamos transformar seu restaurante junto com o ${appName}!
          </p>
        </div>
      </div>
    `;

    const sendEmail = async (email: string, name: string) => {
      const response = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_token: process.env.ABACUSAI_API_KEY,
          app_id: process.env.WEB_APP_ID,
          notification_id: process.env.NOTIF_ID_EMAIL_INACTIVE_USER_REENGAGEMENT,
          subject: `🙋 ${appName}: Melhoramos muito! Volta pra ver`,
          body: generateEmailHTML(name),
          is_html: true,
          recipient_email: email,
          sender_email: process.env.SENDER_EMAIL || `noreply@${new URL(appUrl).hostname}`,
          sender_alias: appName,
        }),
      });

      const result = await response.json();
      return result.success || !result.notification_disabled;
    };

    if (sendToAll) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const inactiveUsers = await prisma.user.findMany({
        where: {
          AND: [
            { active: true },
            {
              OR: [
                { lastSignInAt: { lt: thirtyDaysAgo } },
                { lastSignInAt: null },
              ],
            },
          ],
        },
        select: { id: true, email: true, name: true },
      });

      let sent = 0;
      let failed = 0;

      for (const user of inactiveUsers) {
        const success = await sendEmail(user.email, user.name || 'Restauratero');
        if (success) sent++;
        else failed++;
      }

      return NextResponse.json({
        success: true,
        message: `Emails enviados para usuários inativos`,
        sent,
        failed,
        total: inactiveUsers.length,
      });
    } else if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (!user) {
        return NextResponse.json(
          { success: false, message: 'User not found' },
          { status: 404 }
        );
      }

      const success = await sendEmail(user.email, user.name || 'Restauratero');

      return NextResponse.json({
        success,
        message: success ? 'Email sent' : 'Email sending failed or disabled',
      });
    }

    return NextResponse.json(
      { success: false, message: 'Missing userId or sendToAll parameter' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error sending inactive email:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to send email' },
      { status: 500 }
    );
  }
}
