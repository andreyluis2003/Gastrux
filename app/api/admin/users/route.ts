// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { logAdminAction, getRequestContext } from '@/lib/admin-helpers';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users
 * Lista todos os usuários com filtros e paginação
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, session.user?.email)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') as UserRole | null;
    const status = searchParams.get('status'); // 'active' | 'inactive'
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status === 'active') where.active = true;
    else if (status === 'inactive') where.active = false;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
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
            select: {
              id: true,
              cpf: true,
              phone: true,
              status: true,
              basesalary: true,
              totalOrdersProcessed: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[Admin Users GET] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

/**
 * POST /api/admin/users
 * Criar novo usuário
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, session.user?.email)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  try {
    // Tier enforcement — check user limit
    const { getCurrentRestaurantId } = await import('@/lib/whatsapp/get-restaurant');
    const { enforceResourceLimit } = await import('@/lib/api/tier-middleware');
    const restId = await getCurrentRestaurantId();
    if (restId) {
      const tierBlock = await enforceResourceLimit(restId, 'users');
      if (tierBlock) return tierBlock;
    }

    const body = await request.json();
    const { email, password, name, role, phone, cpf } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    // Verificar se email já existe
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email.split('@')[0],
        role: role || UserRole.COOK,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    // Criar StaffMember automaticamente se phone ou cpf fornecidos e houver restaurante no contexto
    if ((phone || cpf) && restId) {
      await prisma.staffMember.create({
        data: {
          restaurantId: restId,
          userId: user.id,
          cpf: cpf || null,
          phone: phone || null,
          role: user.role,
        },
      });
    }

    // Log de auditoria
    const ctx = getRequestContext(request);
    await logAdminAction({
      userId: (session.user as any).id,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: user.id,
      entityName: user.name || user.email,
      changesAfter: { email, name, role: user.role },
      ...ctx,
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error('[Admin Users POST] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
