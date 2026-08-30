// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { testId, eventName, variant, metadata, timestamp } = await req.json();

    if (!testId || !eventName) {
      return NextResponse.json(
        { error: 'Missing testId or eventName' },
        { status: 400 }
      );
    }

    // Registrar evento (você pode criar uma tabela ABTestEvent no Prisma se quiser persistir)
    console.log('[A/B Test Event]', {
      testId,
      eventName,
      variant,
      userId: session?.user?.id,
      metadata,
      timestamp,
    });

    // Aqui você pode salvar em um banco de dados se necessário
    // await prisma.abTestEvent.create({
    //   data: {
    //     testId,
    //     eventName,
    //     variant,
    //     userId: session?.user?.id,
    //     metadata: JSON.stringify(metadata),
    //   },
    // });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('AB test tracking error:', error);
    return NextResponse.json(
      { error: 'Failed to track event' },
      { status: 500 }
    );
  }
}
