import { sendNotificationEmail } from '@/lib/email-service';

/**
 * E-mails a person asked for (password reset). Resend when RESEND_API_KEY is set (the sender
 * domain must be verified there); otherwise the Abacus.AI notification API the rest of the app uses.
 * Without either, the message is only logged so a missing setup is visible in the server logs.
 */
export async function sendTransactionalEmail(input: { to: string; subject: string; html: string; notificationId: string }) {
  const from = process.env.SENDER_EMAIL || 'Gastrux <noreply@gastrux.com>';

  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { provider: 'resend' as const };
  }

  if (process.env.ABACUSAI_API_KEY) {
    await sendNotificationEmail({ notificationId: input.notificationId, subject: input.subject, htmlBody: input.html, recipientEmail: input.to });
    return { provider: 'abacus' as const };
  }

  console.warn(`[email] No e-mail provider configured (RESEND_API_KEY / ABACUSAI_API_KEY): "${input.subject}" to ${input.to} not sent`);
  return { provider: 'none' as const };
}
