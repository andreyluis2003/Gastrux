// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

// GET - Fetch A/B variants for a campaign
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isPlatformAdminIdentity(session.user.role, session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const variants = await prisma.campaignABVariant.findMany({
      where: { campaignId: params.id },
      include: { performanceBySegment: true },
      orderBy: { variantName: 'asc' },
    });

    return NextResponse.json(variants, { status: 200 });
  } catch (error) {
    console.error('Error fetching variants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch variants' },
      { status: 500 }
    );
  }
}

// POST - Create A/B variant
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isPlatformAdminIdentity(session.user.role, session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const {
      variantName,
      description,
      subjectLine,
      preheader,
      content,
      cta,
      ctaColor,
    } = body;

    if (!variantName || !subjectLine || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const variant = await prisma.campaignABVariant.create({
      data: {
        campaignId: params.id,
        variantName,
        description: description || null,
        subjectLine,
        preheader: preheader || null,
        content,
        cta: cta || null,
        ctaColor: ctaColor || '#0066ff',
      },
      include: { performanceBySegment: true },
    });

    return NextResponse.json(variant, { status: 201 });
  } catch (error) {
    console.error('Error creating variant:', error);
    return NextResponse.json(
      { error: 'Failed to create variant' },
      { status: 500 }
    );
  }
}
