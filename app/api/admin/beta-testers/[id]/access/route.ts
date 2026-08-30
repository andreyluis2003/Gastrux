// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcryptjs from 'bcryptjs';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !['ADMIN'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tester = await prisma.betaTester.findUnique({ where: { id: params.id } });
  if (!tester) return NextResponse.json({ error: 'Beta tester não encontrado' }, { status: 404 });

  const { action, days } = await req.json();

  try {
    if (action === 'block') {
      if (tester.userId) {
        await prisma.user.update({ where: { id: tester.userId }, data: { active: false } });
      }
      await prisma.betaTester.update({
        where: { id: tester.id },
        data: { status: 'rejected' },
      });
      return NextResponse.json({ success: true, message: 'Acesso bloqueado' });
    }

    if (action === 'unblock') {
      if (tester.userId) {
        await prisma.user.update({ where: { id: tester.userId }, data: { active: true } });
      }
      await prisma.betaTester.update({
        where: { id: tester.id },
        data: { status: 'active' },
      });
      return NextResponse.json({ success: true, message: 'Acesso desbloqueado' });
    }

    if (action === 'extend') {
      const extraDays = Number(days) || 30;
      const base = tester.accessEndsAt && tester.accessEndsAt > new Date() ? tester.accessEndsAt : new Date();
      const newEnd = new Date(base.getTime() + extraDays * 24 * 60 * 60 * 1000);
      if (tester.userId) {
        await prisma.user.update({
          where: { id: tester.userId },
          data: { trialEndsAt: newEnd, active: true, subscriptionStatus: 'trialing' },
        });
      }
      await prisma.betaTester.update({
        where: { id: tester.id },
        data: { accessEndsAt: newEnd, status: 'active' },
      });
      return NextResponse.json({ success: true, accessEndsAt: newEnd });
    }

    if (action === 'reset_password') {
      if (!tester.userId) return NextResponse.json({ error: 'Sem usuário associado' }, { status: 400 });
      const newPassword = randomBytes(6).toString('hex');
      await prisma.user.update({
        where: { id: tester.userId },
        data: { password: await bcryptjs.hash(newPassword, 10) },
      });
      return NextResponse.json({ success: true, tempPassword: newPassword });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('beta-tester access action error', error);
    return NextResponse.json({ error: error?.message || 'Erro' }, { status: 500 });
  }
}
