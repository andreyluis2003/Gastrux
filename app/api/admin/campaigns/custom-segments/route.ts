// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface CustomFilter {
  field: string;
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'between';
  value?: any;
  valueMin?: any;
  valueMax?: any;
}

interface CustomSegmentRequest {
  campaignId: string;
  segmentName: string;
  filters: CustomFilter[];
}

// POST - Create a custom segment with advanced filters
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'OWNER' && session.user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: CustomSegmentRequest = await req.json();
    const { campaignId, segmentName, filters } = body;

    if (!campaignId || !segmentName || !filters || filters.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: campaignId, segmentName, filters' },
        { status: 400 }
      );
    }

    // Validate campaign exists
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Build Prisma query from filters
    const prismaQuery = buildPrismaQuery(filters);

    // Count matching users
    const matchingUsers = await prisma.user.findMany({
      where: { active: true, ...prismaQuery },
      select: { id: true, email: true, name: true },
    });

    // Create the segment
    const segment = await prisma.campaignSegment.create({
      data: {
        campaignId,
        segmentType: 'custom',
        segmentName,
        customFilter: JSON.stringify(filters),
        targetUserCount: matchingUsers.length,
      },
    });

    return NextResponse.json(
      {
        segment,
        matchingUserCount: matchingUsers.length,
        previewUsers: matchingUsers.slice(0, 5),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Custom segment error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create segment' },
      { status: 500 }
    );
  }
}

// POST - Preview matching users for filters (without creating segment)
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { filters } = body;

    if (!filters || filters.length === 0) {
      return NextResponse.json(
        { error: 'filters array required' },
        { status: 400 }
      );
    }

    // Build Prisma query
    const prismaQuery = buildPrismaQuery(filters);

    // Get matching users
    const matchingUsers = await prisma.user.findMany({
      where: { active: true, ...prismaQuery },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        lastSignInAt: true,
        subscriptionTier: true,
      },
      take: 20,
    });

    // Get count
    const totalCount = await prisma.user.count({
      where: { active: true, ...prismaQuery },
    });

    return NextResponse.json(
      {
        totalMatching: totalCount,
        previewUsers: matchingUsers,
        queryPreview: filters.map((f: CustomFilter) => ({
          field: f.field,
          operator: f.operator,
          displayValue: formatFilterValue(f),
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Filter preview error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to preview filters' },
      { status: 500 }
    );
  }
}

// GET - Get available filter fields for segment creation
export async function GET() {
  try {
    const filterFields = [
      {
        field: 'email',
        label: 'Email',
        operators: ['contains', 'equals'],
        type: 'string',
      },
      {
        field: 'name',
        label: 'Nome',
        operators: ['contains'],
        type: 'string',
      },
      {
        field: 'role',
        label: 'Função',
        operators: ['equals'],
        type: 'enum',
        values: ['OWNER', 'MANAGER', 'COOK'],
      },
      {
        field: 'subscriptionTier',
        label: 'Plano de Assinatura',
        operators: ['equals'],
        type: 'enum',
        values: ['starter', 'pro', 'business'],
      },
      {
        field: 'subscriptionStatus',
        label: 'Status da Assinatura',
        operators: ['equals'],
        type: 'enum',
        values: ['active', 'inactive', 'cancelled', 'past_due'],
      },
      {
        field: 'createdAt',
        label: 'Data de Criação',
        operators: ['greaterThan', 'lessThan', 'between'],
        type: 'date',
      },
      {
        field: 'lastSignInAt',
        label: 'Último Acesso',
        operators: ['greaterThan', 'lessThan'],
        type: 'date',
      },
      {
        field: 'referralCode',
        label: 'Tem Código de Referência',
        operators: ['equals'],
        type: 'boolean',
      },
    ];

    return NextResponse.json({ filterFields }, { status: 200 });
  } catch (error) {
    console.error('Error fetching filter fields:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available filters' },
      { status: 500 }
    );
  }
}

// Helper: Build Prisma query from custom filters
function buildPrismaQuery(filters: CustomFilter[]): any {
  const query: any = {};

  for (const filter of filters) {
    switch (filter.field) {
      case 'email':
        if (filter.operator === 'contains') {
          query.email = { contains: filter.value, mode: 'insensitive' };
        } else if (filter.operator === 'equals') {
          query.email = filter.value;
        }
        break;

      case 'name':
        if (filter.operator === 'contains') {
          query.name = { contains: filter.value, mode: 'insensitive' };
        }
        break;

      case 'role':
        query.role = filter.value;
        break;

      case 'subscriptionTier':
        query.subscriptionTier = filter.value;
        break;

      case 'subscriptionStatus':
        query.subscriptionStatus = filter.value;
        break;

      case 'createdAt':
        if (filter.operator === 'greaterThan') {
          query.createdAt = { gte: new Date(filter.value) };
        } else if (filter.operator === 'lessThan') {
          query.createdAt = { lte: new Date(filter.value) };
        } else if (filter.operator === 'between') {
          query.createdAt = {
            gte: new Date(filter.valueMin),
            lte: new Date(filter.valueMax),
          };
        }
        break;

      case 'lastSignInAt':
        if (filter.operator === 'greaterThan') {
          query.lastSignInAt = { gte: new Date(filter.value) };
        } else if (filter.operator === 'lessThan') {
          query.lastSignInAt = { lte: new Date(filter.value) };
        }
        break;

      case 'referralCode':
        if (filter.value === true) {
          query.referralCode = { not: null };
        } else {
          query.referralCode = null;
        }
        break;
    }
  }

  return query;
}

// Helper: Format filter value for display
function formatFilterValue(filter: CustomFilter): string {
  if (filter.operator === 'between') {
    return `entre ${filter.valueMin} e ${filter.valueMax}`;
  }
  if (filter.operator === 'contains') {
    return `contém "${filter.value}"`;
  }
  if (filter.operator === 'greaterThan') {
    return `> ${filter.value}`;
  }
  if (filter.operator === 'lessThan') {
    return `< ${filter.value}`;
  }
  return String(filter.value);
}
