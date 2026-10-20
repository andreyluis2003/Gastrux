import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { getPlatformAdminSession } from '@/lib/admin/guard';
import { ONBOARDING_STEPS, buildOnboardingEmail, dueRecipients, runOnboardingEmails, stepByKey } from '@/lib/onboarding/emails';

export const dynamic = 'force-dynamic';

/**
 * GET /api/email/onboarding-sequence - Plataforma › Onboarding: who each onboarding e-mail goes to on the next run,
 * and whether an e-mail sender is configured. ?preview=<step> returns that e-mail's subject and HTML.
 * Platform team only (it lists customers' e-mails; it was open to anyone before 2026-10-19).
 */
export async function GET(req: NextRequest) {
  const { session } = await getPlatformAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const preview = req.nextUrl.searchParams.get('preview');
  if (preview) {
    if (!stepByKey(preview)) return NextResponse.json({ error: 'E-mail desconhecido' }, { status: 400 });
    const me = session.user as any;
    return NextResponse.json(buildOnboardingEmail(preview as any, { id: String(me.id || 'preview'), name: me.name }));
  }

  const steps = [];
  for (const step of ONBOARDING_STEPS) {
    const pending = await dueRecipients(step);
    steps.push({ key: step.key, day: step.day, label: step.label, subject: buildOnboardingEmail(step.key, { id: 'x' }).subject, pending });
  }
  return NextResponse.json({ senderConfigured: !!process.env.RESEND_API_KEY, steps }, { headers: { 'Cache-Control': 'no-store' } });
}

/** POST /api/email/onboarding-sequence - daily from the VPS cron (CRON_SECRET), or "Enviar agora" by the platform team */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    const { session } = await getPlatformAdminSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await runOnboardingEmails());
}
