// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession, logAdminAction, getRequestContext } from '@/lib/admin-helpers';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users/[id]
 * Detalhes completos de um usuário
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        lastSignInAt: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        staffMember: {
          include: {
            shifts: {
              orderBy: { shiftDate: 'desc' },
              take: 10,
            },
            commissions: {
              orderBy: { period: 'desc' },
              take: 6,
            },
          },
        },
        adminLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        orderSessions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('[Admin Users GET/:id] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/users/[id]
 * Atualizar usuário
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAdminSession([UserRole.OWNER, UserRole.ADMIN]);
  if (error) return error;

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 400 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, email, role, active, password, phone, cpf } = body;

    const existingUser = await prisma.user.findUnique({
      where: { id },
      include: { staffMember: true },
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Verificar se email já existe em outro usuário
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists) {
        return NextResponse.json({ error: 'Email já está em uso' }, { status: 409 });
      }
    }

    // Preparar dados de atualização
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (active !== undefined) updateData.active = active;
    if (password) updateData.password = await bcryptjs.hash(password, 10);

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        updatedAt: true,
      },
    });

    // Atualizar StaffMember se necessário
    if (phone !== undefined || cpf !== undefined || role !== undefined) {
      if (existingUser.staffMember) {
        const staffUpdate: any = {};
        if (phone !== undefined) staffUpdate.phone = phone;
        if (cpf !== undefined) staffUpdate.cpf = cpf;
        if (role !== undefined) staffUpdate.role = role;
        await prisma.staffMember.update({
          where: { id: existingUser.staffMember.id },
            restaurantId,
        });
      } else if (phone || cpf) {
        await prisma.staffMember.create({
          data: {
            userId: id,
            phone: phone || null,
            cpf: cpf || null,
            role: updatedUser.role,
          },
        });
      }
    }

    // Determinar ação de log
    const action = role !== undefined && role !== existingUser.role
      ? 'USER_ROLE_CHANGE'
      : 'USER_UPDATE';

    const ctx = getRequestContext(request);
    await logAdminAction({
      userId: (session.user as any).id,
      action: action as any,
      entityType: 'User',
      entityId: id,
      entityName: updatedUser.name || updatedUser.email,
      changesBefore: {
        name: existingUser.name,
        email: existingUser.email,
        role: existingUser.role,
        active: existingUser.active,
      },
      changesAfter: updateData,
      ...ctx,
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('[Admin Users PUT/:id] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Desativar usuário (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAdminSession([UserRole.OWNER]);
  if (error) return error;

  try {
    const { id } = await params;
    const userId = (session.user as any).id;

    // Não permitir auto-exclusão
    if (id === userId) {
      return NextResponse.json({ error: 'Não é possível desativar sua própria conta' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    await prisma.user.update({
      where: { id },
      data: { active: false },
    });

    // Desativar StaffMember também
    await prisma.staffMember.updateMany({
      where: { userId: id },
        restaurantId,
    });

    const ctx = getRequestContext(request);
    await logAdminAction({
      userId,
      action: 'USER_DELETE',
      entityType: 'User',
      entityId: id,
      entityName: existingUser.name || existingUser.email,
      changesBefore: { active: true },
      changesAfter: { active: false },
      ...ctx,
    });

    return NextResponse.json({ success: true, message: 'Usuário desativado com sucesso' });
  } catch (error) {
    console.error('[Admin Users DELETE/:id] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
