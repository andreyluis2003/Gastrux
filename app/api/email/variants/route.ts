// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const emailType = searchParams.get('emailType');

    const where: any = {};
    if (emailType) {
      where.emailType = emailType;
    }

    const variants = await prisma.emailVariant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(variants, { status: 200 });
  } catch (error) {
    console.error('Error fetching variants:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { emailType, variantLabel, subject, content, ctaText, ctaUrl, weight, description } =
      await request.json();

    if (!emailType || !variantLabel || !subject || !content) {
      return NextResponse.json(
        { error: 'emailType, variantLabel, subject, and content are required' },
        { status: 400 }
      );
    }

    // Check if variant already exists
    const existing = await prisma.emailVariant.findUnique({
      where: {
        emailType_variantLabel: {
          emailType: emailType as any,
          variantLabel,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Variant already exists for this email type' },
        { status: 400 }
      );
    }

    const variant = await prisma.emailVariant.create({
      data: {
        emailType: emailType as any,
        variantLabel,
        subject,
        content,
        ctaText,
        ctaUrl,
        weight: weight || 50,
        description,
      },
    });

    return NextResponse.json(variant, { status: 201 });
  } catch (error) {
    console.error('Error creating variant:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
