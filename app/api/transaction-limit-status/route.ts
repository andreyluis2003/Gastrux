// @ts-nocheck
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { checkTransactionLimit } from '@/lib/transaction-limiter';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Não autenticado' },
      { status: 401 }
    );
  }

  const status = await checkTransactionLimit(session.user.id);
  return NextResponse.json(status);
}
