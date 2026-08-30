// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/email/send-early-adopter
 * Envia email VIP para early adopters
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

    // Function to generate email HTML
    const generateEmailHTML = (userName: string) => `
      <div style="font-family: 'Poppins', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px; border-radius: 12px;">
        <div style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px; margin-bottom: 10px;">🎉 Obrigado por Ser um Pioneer!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">Você é um dos nossos melhores clientes</p>
        </div>
        
        <div style="background: white; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px;">
            Olá ${userName || 'Restauratero'},
          </p>
          
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Você foi um dos pioneiros que confiou em nós desde o início. Seu feedback e suporte foram fundamentais para melhorarmos o <strong>${appName}</strong>.
          </p>

          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 4px; margin: 30px 0;">
            <h2 style="color: #92400e; margin-top: 0; font-size: 18px;">🌟 Benefícios VIP Exclusivos</h2>
            <ul style="color: #92400e; line-height: 1.8; margin-bottom: 0; padding-left: 20px;">
              <li><strong>Acesso VIP</strong> - Prioridade em novos recursos e updates</li>
              <li><strong>Suporte Premium</strong> - Atendimento prioritário de nossa equipe</li>
              <li><strong>Desconto Especial</strong> - Até 30% de desconto em qualquer plano</li>
              <li><strong>Feedback direto</strong> - Voz ativa nas decisões de produto</li>
            </ul>
          </div>

          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Como agradecimento especial, você agora tem acesso a funcionalidades beta antes de qualquer um:
          </p>

          <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;">
              ✅ <strong>Analytics Avançado</strong> - Relatórios executivos em PDF<br/>
              ✅ <strong>Engenharia de Menu</strong> - Otimize seus lucros<br/>
              ✅ <strong>ML Inteligente</strong> - Previsões de demanda<br/>
              ✅ <strong>Menu Digital</strong> - Sistema de cardápio online<br/>
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${appUrl}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Acessar Recursos VIP
            </a>
          </div>

          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Quer discutir ideias de melhorias? Nos responda este email ou entre em contato através do aplicativo.
          </p>

          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Obrigado novamente por fazer parte da jornada do ${appName}. Você é incrivel! 👏
          </p>
        </div>
      </div>
    `;

    // Function to send email
    const sendEmail = async (email: string, name: string) => {
      const response = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_token: process.env.ABACUSAI_API_KEY,
          app_id: process.env.WEB_APP_ID,
          notification_id: process.env.NOTIF_ID_EMAIL_EARLY_ADOPTER_VIP,
          subject: `🎉 Você é um dos nossos melhores - Acesso VIP no ${appName}!`,
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
      // Send to all early adopters
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const earlyAdopters = await prisma.user.findMany({
        where: {
          AND: [
            { createdAt: { lt: thirtyDaysAgo } },
            { lastSignInAt: { gte: sevenDaysAgo } },
          ],
        },
        select: { id: true, email: true, name: true },
      });

      let sent = 0;
      let failed = 0;

      for (const user of earlyAdopters) {
        const success = await sendEmail(user.email, user.name || 'Restauratero');
        if (success) sent++;
        else failed++;
      }

      return NextResponse.json({
        success: true,
        message: `Emails enviados para early adopters`,
        sent,
        failed,
        total: earlyAdopters.length,
      });
    } else if (userId) {
      // Send to single user
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
    console.error('Error sending early adopter email:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to send email' },
      { status: 500 }
    );
  }
}
