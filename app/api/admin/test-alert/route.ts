import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sendAdminAlert, sendTelegramAlert } from '@/lib/admin-alerts';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'OWNER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subject = '✅ Teste de Alertas Gastrux';
  const htmlBody = `<div style="font-family:Arial;padding:16px"><h2>Teste de canais de alerta</h2><p>Se você recebeu este e-mail e/ou mensagem no Telegram, os alertas administrativos estão funcionando corretamente.</p><p><b>Hora:</b> ${new Date().toLocaleString('pt-BR')}</p></div>`;

  const emailOk = await sendAdminAlert({
    notificationId: process.env.NOTIF_ID_CRITICAL_SYSTEM_ERROR || '',
    subject,
    htmlBody,
  });
  const telegramOk = await sendTelegramAlert(subject, 'Teste de canal de alertas. Se você recebeu, está funcionando.');

  return NextResponse.json({
    email: emailOk,
    telegram: telegramOk,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID),
  });
}
