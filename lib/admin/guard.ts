import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';

export type PlatformAdminRole = typeof UserRole.ADMIN;

/**
 * Platform (Gastrux staff) admin allowlist. Restaurant OWNERs are NOT platform
 * admins — every restaurant owner has role OWNER, so allowing OWNER here would
 * expose the internal SaaS control panel (MRR, all customers, all users, audit
 * logs, support tickets) to any trial tenant. Platform admin === role ADMIN,
 * plus an optional email allowlist via PLATFORM_ADMIN_EMAILS.
 */
export function getPlatformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminIdentity(
  role: UserRole | string | undefined | null,
  email: string | undefined | null,
): boolean {
  if (role === UserRole.ADMIN) return true;
  if (email && getPlatformAdminEmails().includes(email.toLowerCase())) return true;
  return false;
}

export async function getPlatformAdminSession() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  const email = (session?.user as any)?.email as string | undefined;
  if (!session || !isPlatformAdminIdentity(role, email)) {
    return { session: null, error: 'Unauthorized' as const };
  }
  return { session, error: null as null };
}

export async function requirePlatformAdmin() {
  const { session, error } = await getPlatformAdminSession();
  if (error || !session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
      user: null,
    };
  }
  return {
    ok: true as const,
    response: null as null,
    session,
    user: session.user as (typeof session.user & { id?: string; role?: UserRole }),
  };
}
