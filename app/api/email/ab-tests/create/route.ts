// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, emailType, targetSegment, variants } = body;

    // Validate input
    if (!name || !emailType || !variants || variants.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: name, emailType, variants' },
        { status: 400 }
      );
    }

    // Check that percentages sum to 100
    const totalPercentage = variants.reduce((sum: number, v: any) => sum + (v.percentage || 0), 0);
    if (totalPercentage !== 100) {
      return NextResponse.json(
        { error: 'Variant percentages must sum to 100%' },
        { status: 400 }
      );
    }

    // Create test with variants
    const test = await prisma.emailABTest.create({
      data: {
        name,
        emailType,
        status: 'draft',
        targetSegment: targetSegment || 'all',
        variants: {
          create: variants.map((v: any, idx: number) => ({
            name: String.fromCharCode(65 + idx), // A, B, C, etc
            percentage: v.percentage,
            subjectLine: v.subjectLine,
            contentTemplate: v.contentTemplate,
            sendTime: v.sendTime || '08:00',
            cta: v.cta,
          })),
        },
      },
      include: {
        variants: true,
      },
    });

    return NextResponse.json({
      success: true,
      test,
      message: `A/B test "${name}" created with ${variants.length} variants`,
    });
  } catch (error) {
    console.error('Error creating A/B test:', error);
    return NextResponse.json(
      { error: 'Failed to create A/B test' },
      { status: 500 }
    );
  }
}
