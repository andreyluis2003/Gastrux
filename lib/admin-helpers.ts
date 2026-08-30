// @ts-nocheck
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AdminAction, UserRole } from '@prisma/client';

/**
 * Verifica se o usuário tem permissão de admin (OWNER, MANAGER ou ADMIN)
 */
export async function requireAdminSession(allowedRoles?: UserRole[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }), session: null };
  }

  const roles = allowedRoles || [UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN];
  const userRole = (session.user as any).role as UserRole;

  if (!roles.includes(userRole)) {
    return { error: NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 }), session: null };
  }

  return { error: null, session };
}

/**
 * Registra uma ação no log de auditoria
 */
export async function logAdminAction(params: {
  userId: string;
  action: AdminAction;
  entityType: string;
  entityId: string;
  entityName?: string;
  changesBefore?: any;
  changesAfter?: any;
  ipAddress?: string;
  userAgent?: string;
  financialImpact?: number;
}) {
  try {
    await prisma.adminLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.entityName || null,
        changesBefore: params.changesBefore ? JSON.stringify(params.changesBefore) : null,
        changesAfter: params.changesAfter ? JSON.stringify(params.changesAfter) : null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        financialImpact: params.financialImpact ?? null,
      },
    });
  } catch (error) {
    console.error('[AdminLog] Erro ao registrar log:', error);
  }
}

/**
 * Extrai IP e User-Agent do request
 */
export function getRequestContext(request: Request) {
  const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return { ipAddress, userAgent };
}
