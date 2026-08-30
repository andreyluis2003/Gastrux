// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcryptjs from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      acceptedTermsAt: true,
      currentRestaurantId: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Get team members for this restaurant
  let team: any[] = [];
  if (user.currentRestaurantId) {
    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: { restaurantId: user.currentRestaurantId, isActive: true },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
        },
      },
    });
    team = restaurantUsers.map(ru => ({
      ...ru.user,
      restaurantRole: ru.role,
    }));
  }

  return NextResponse.json({ user, team });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Update profile
  if (action === 'update_profile') {
    const { name } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { name: name.trim() },
    });
    return NextResponse.json({ success: true });
  }

  // Change password
  if (action === 'change_password') {
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Senhas são obrigatórias' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Nova senha deve ter pelo menos 6 caracteres' }, { status: 400 });
    }
    const valid = await bcryptjs.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 });
    }
    const hashed = await bcryptjs.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });
    return NextResponse.json({ success: true });
  }

  // Remove team member
  if (action === 'remove_member') {
    const { memberId } = body;
    if (!memberId) {
      return NextResponse.json({ error: 'ID do membro é obrigatório' }, { status: 400 });
    }
    const userRole = (session.user as any).role;
    if (!['OWNER', 'ADMIN'].includes(userRole)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }
    // Can't remove yourself
    if (memberId === user.id) {
      return NextResponse.json({ error: 'Você não pode remover a si mesmo' }, { status: 400 });
    }
    if (user.currentRestaurantId) {
      await prisma.restaurantUser.updateMany({
        where: { restaurantId: user.currentRestaurantId, userId: memberId },
        data: { isActive: false },
      });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}

// DELETE account (LGPD right)
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Soft-delete: deactivate instead of hard delete to preserve data integrity
  await prisma.user.update({
    where: { id: user.id },
    data: {
      active: false,
      email: `deleted_${Date.now()}_${user.id}@deleted.local`,
      name: 'Conta Excluída',
      password: 'DELETED',
    },
  });

  return NextResponse.json({ success: true, message: 'Conta desativada com sucesso. Seus dados serão removidos em 30 dias.' });
}
