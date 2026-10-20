import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUnsubscribeToken } from '@/lib/onboarding/emails';

export const dynamic = 'force-dynamic';

const page = (title: string, text: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>` +
      `<body style="font-family:Arial,Helvetica,sans-serif;background:#F7F8F2;margin:0;padding:40px 16px"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">` +
      `<p style="font-size:20px;font-weight:bold;color:#142D27;margin:0 0 16px">gastrux</p><h1 style="font-size:18px;color:#142D27">${title}</h1><p style="color:#374151;line-height:1.6">${text}</p>` +
      `<p><a href="https://gastrux.com/dashboard" style="color:#335538">Abrir o Gastrux</a></p></div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

/** GET /api/email/unsubscribe?u=<userId>&t=<token> - "Parar as dicas" link of the onboarding e-mails (no login) */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('u') || '';
  const token = req.nextUrl.searchParams.get('t') || '';
  if (!userId || !verifyUnsubscribeToken(userId, token)) {
    return page('Link inválido', 'Este link não está completo. Abra de novo pelo e-mail que você recebeu.', 400);
  }
  await prisma.user.updateMany({ where: { id: userId }, data: { onboardingEmailsOptOut: true } });
  return page('Pronto, as dicas pararam', 'Você não vai mais receber as dicas de uso do Gastrux por e-mail. Os avisos da sua conta, como o fim do teste e a troca de senha, continuam chegando.');
}
