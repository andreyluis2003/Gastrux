// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

/**
 * POST /api/email/send-new-user
 * Envia email de boas-vindas customizado para novos usuários
 * Body: { userId: string } ou { sendToAll: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !isPlatformAdminIdentity(session.user.role, session.user.email)) {
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
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px; margin-bottom: 10px;">🊗 Bem-vindo ao ${appName}!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">3 dicas para começar agora</p>
        </div>
        
        <div style="background: white; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px;">
            Olá ${userName || 'Restauratero'},
          </p>
          
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Obrigado por se registrar no ${appName}! Estamos animados para ajudar você a gerenciar seu restaurante de forma mais eficiente. Aqui estão os 3 primeiros passos para começar:
          </p>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 30px 0;">
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
              <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 16px;">1⚠️ Cadastre seus ingredientes</h3>
              <p style="color: #4b5563; margin: 0; font-size: 14px; line-height: 1.6;">
                Vá até a seção <strong>Insumos</strong> e comece a adicionar todos os ingredientes que você usa no seu restaurante. Inclua o preço unitário para que o sistema calcule os custos automaticamente.
              </p>
            </div>

            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
              <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 16px;">2🛍️ Crie suas receitas</h3>
              <p style="color: #4b5563; margin: 0; font-size: 14px; line-height: 1.6;">
                Acesse <strong>Receitas</strong> e crie fichas técnicas dos seus pratos mais populares. O ${appName} calculará o custo exato de cada porção automaticamente.
              </p>
            </div>

            <div style="margin-bottom: 0;">
              <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 16px;">3📈 Acompanhe suas métricas</h3>
              <p style="color: #4b5563; margin: 0; font-size: 14px; line-height: 1.6;">
                Consulte o <strong>Dashboard</strong> para ver em tempo real: estoque, custos, lucratividade e tendências. Dados que você pode confiar para tomar decisões melhores.
              </p>
            </div>
          </div>

          <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;">
              <strong>Dica de Ouro:</strong> O plano <strong>Starter (Grátis)</strong> já inclui a maioria dos recursos que você precisa para começar. Explore e depois considere fazer upgrade para Pro quando sentir necessidade.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${appUrl}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Ir para o Dashboard
            </a>
          </div>

          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            <strong>📄 Documentacião:</strong> Confira nossa <a href="${appUrl}/dashboard" style="color: #3b82f6; text-decoration: none;">documentação completa</a> para aprender sobre todos os recursos disponíveis.
          </p>

          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Qualquer dúvida, responda este email ou entre em contato com nosso suporte. Estamos aqui para ajudar!
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
          notification_id: process.env.NOTIF_ID_EMAIL_NEW_USER_GETTING_STARTED,
          subject: `🊗 ${appName}: Bem-vindo! 3 dicas para começar`,
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
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const newUsers = await prisma.user.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
        select: { id: true, email: true, name: true },
      });

      let sent = 0;
      let failed = 0;

      for (const user of newUsers) {
        const success = await sendEmail(user.email, user.name || 'Restauratero');
        if (success) sent++;
        else failed++;
      }

      return NextResponse.json({
        success: true,
        message: `Emails enviados para novos usuários`,
        sent,
        failed,
        total: newUsers.length,
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
    console.error('Error sending new user email:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to send email' },
      { status: 500 }
    );
  }
}
