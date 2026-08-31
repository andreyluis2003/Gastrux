// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-helpers';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/reports/export
 * Exportar relatório em CSV
 */
export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'sales';
    const days = parseInt(searchParams.get('days') || '30', 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let csvContent = '';
    let filename = '';

    switch (type) {
      case 'sales': {
        const payments = await prisma.payment.findMany({
          where: { status: 'APPROVED', createdAt: { gte: startDate }, restaurantId },
          orderBy: { createdAt: 'desc' },
        });
        csvContent = 'ID,Valor,M\u00e9todo,Status,Data\n';
        payments.forEach((p) => {
          csvContent += `${p.id},${Number(p.amount).toFixed(2)},${p.method || 'N/A'},${p.status},${p.createdAt.toISOString()}\n`;
        });
        filename = `relatorio-vendas-${days}d.csv`;
        break;
      }
      case 'inventory': {
        const ingredients = await prisma.ingredient.findMany({
          where: { restaurantId, active: true },
          select: { name: true, unit: true, currentStock: true, minimumStock: true, referenceCost: true },
          orderBy: { name: 'asc' },
        });
        csvContent = 'Nome,Unidade,Estoque Atual,Estoque M\u00ednimo,Custo Refer\u00eancia\n';
        ingredients.forEach((i) => {
          csvContent += `"${i.name}",${i.unit},${Number(i.currentStock || 0)},${Number(i.minimumStock || 0)},${Number(i.referenceCost || 0).toFixed(2)}\n`;
        });
        filename = `relatorio-estoque.csv`;
        break;
      }
      case 'staff': {
        const staff = await prisma.staffMember.findMany({
          where: { restaurantId },
          include: { user: { select: { name: true, email: true } } },
        });
        csvContent = 'Nome,Email,Cargo,Status,Sal\u00e1rio Base,Pedidos Processados\n';
        staff.forEach((s) => {
          csvContent += `"${s.user?.name || 'N/A'}",${s.user?.email || 'N/A'},${s.role},${s.status},${Number(s.basesalary || 0).toFixed(2)},${s.totalOrdersProcessed}\n`;
        });
        filename = `relatorio-equipe.csv`;
        break;
      }
      case 'users': {
        const memberships = await prisma.restaurantUser.findMany({
          where: { restaurantId },
          select: {
            user: { select: { name: true, email: true, role: true, active: true, createdAt: true, lastSignInAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        const users = memberships.map((m) => m.user);
        csvContent = 'Nome,Email,Cargo,Ativo,Criado Em,\u00daltimo Acesso\n';
        users.forEach((u) => {
          csvContent += `"${u.name || 'N/A'}",${u.email},${u.role},${u.active ? 'Sim' : 'N\u00e3o'},${u.createdAt.toISOString()},${u.lastSignInAt?.toISOString() || 'N/A'}\n`;
        });
        filename = `relatório-usuários.csv`;
        break;
      }
      default:
        return NextResponse.json({ error: 'Tipo de relat\u00f3rio inv\u00e1lido' }, { status: 400 });
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[Admin Reports Export] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
