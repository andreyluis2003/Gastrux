// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { evaluateAndAlert } from '@/lib/ai-support/monitoring';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

// Manual trigger by admin
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity(session.user?.role, session.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const hours = Number(url.searchParams.get('hours') || 24);
  const result = await evaluateAndAlert(hours);
  return NextResponse.json(result);
}

// Cron-friendly endpoint (protected by secret header)
export async function GET(req: NextRequest) {
  const auth = req.headers.get('x-cron-secret');
  if (auth !== process.env.CRON_SECRET && auth !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await evaluateAndAlert(24);
  return NextResponse.json(result);
}
