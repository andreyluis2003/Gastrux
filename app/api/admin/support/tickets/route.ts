// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listTicketsForAdmin } from '@/lib/support/service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user?.id || (role !== 'OWNER' && role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const tickets = await listTicketsForAdmin({
    status: searchParams.get('status') || undefined,
    priority: searchParams.get('priority') || undefined,
    assignedToId: searchParams.get('assignedToId') || undefined,
    q: searchParams.get('q') || undefined,
  })
  return NextResponse.json({ tickets })
}
