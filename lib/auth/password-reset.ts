import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/email/transactional';

/**
 * "Esqueci minha senha" (there was no way to recover an account). Market practice:
 * - the answer never says whether the e-mail has an account (no account discovery);
 * - the link is one-time, valid for 1 hour, and only its SHA-256 is stored;
 * - at most 3 links per account per hour; a new link voids the older ones;
 * - using it sets the new password and ends any "must change" state.
 */
export const RESET_TTL_MS = 60 * 60 * 1000;
export const MAX_LINKS_PER_HOUR = 3;
export const MIN_PASSWORD_LENGTH = 8;

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || 'https://gastrux.com').replace(/\/+$/, '');
}

/** Always resolves the same way for the caller; returns internal details only for tests/logs. */
export async function requestPasswordReset(rawEmail: string): Promise<{ sent: boolean; reason?: string; token?: string }> {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { sent: false, reason: 'invalid-email' };

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, active: true, password: true } });
  // Google-only accounts (no password) and inactive accounts get nothing, silently
  if (!user || !user.active || !user.password) return { sent: false, reason: 'no-account' };

  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - RESET_TTL_MS) } },
  });
  if (recent >= MAX_LINKS_PER_HOUR) return { sent: false, reason: 'rate-limited' };

  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.$transaction([
    // A new link voids the older ones
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    }),
  ]);

  const link = `${appBaseUrl()}/auth/redefinir-senha?token=${token}`;
  const first = (user.name || '').split(' ')[0] || 'Olá';
  await sendTransactionalEmail({
    to: email,
    subject: 'Redefinir sua senha do Gastrux',
    notificationId: 'password_reset',
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a">
      <h2 style="margin-bottom:8px">Redefinir sua senha</h2>
      <p>${first}, recebemos um pedido para redefinir a senha da sua conta no Gastrux.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Criar nova senha</a></p>
      <p style="font-size:13px;color:#475569">O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
      <p style="font-size:12px;color:#94a3b8;word-break:break-all">Se o botão não funcionar, copie este endereço: ${link}</p>
    </div>`,
  });
  return { sent: true, token };
}

export type ResetOutcome = { ok: true } | { ok: false; status: number; error: string };

export async function resetPassword(token: string, newPassword: string): Promise<ResetOutcome> {
  if (!token) return { ok: false, status: 400, error: 'Link inválido' };
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, status: 400, error: `A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` };
  }
  const hashed = await bcryptjs.hash(newPassword, 10);
  return prisma.$transaction(async (tx) => {
    // Claimed once: two tabs with the same link cannot both use it
    const now = new Date();
    const found = await tx.passwordResetToken.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, userId: true } });
    if (!found) return { ok: false, status: 400, error: 'Link inválido ou já usado. Peça um novo.' } as ResetOutcome;
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: found.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count === 0) return { ok: false, status: 400, error: 'Link expirado ou já usado. Peça um novo.' } as ResetOutcome;
    await tx.user.update({ where: { id: found.userId }, data: { password: hashed, mustChangePassword: false } });
    await tx.passwordResetToken.updateMany({ where: { userId: found.userId, usedAt: null }, data: { usedAt: now } });
    return { ok: true } as ResetOutcome;
  });
}
