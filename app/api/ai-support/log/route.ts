// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { detectHallucination } from '@/lib/ai-support/monitoring';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await req.json();
    const {
      sessionId, question, answer, rating, thumbsUp, escalatedToHuman,
      resolvedIssue, responseTimeMs, confidenceScore, topic, feedbackText,
    } = body;

    if (!sessionId || !question || !answer) {
      return NextResponse.json({ error: 'sessionId, question e answer são obrigatórios' }, { status: 400 });
    }

    const halluc = detectHallucination(question, answer);

    const interaction = await prisma.aISupportInteraction.create({
      data: {
        sessionId,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        question: question.slice(0, 4000),
        answer: answer.slice(0, 8000),
        rating: typeof rating === 'number' ? rating : null,
        thumbsUp: typeof thumbsUp === 'boolean' ? thumbsUp : null,
        hallucinationFlag: halluc.flag,
        confidenceScore: typeof confidenceScore === 'number' ? confidenceScore : null,
        responseTimeMs: typeof responseTimeMs === 'number' ? responseTimeMs : null,
        escalatedToHuman: !!escalatedToHuman,
        resolvedIssue: typeof resolvedIssue === 'boolean' ? resolvedIssue : null,
        topic: topic || null,
        feedbackText: feedbackText || null,
      },
    });

    return NextResponse.json({ id: interaction.id, hallucinationFlag: halluc.flag, reasons: halluc.reasons });
  } catch (error: any) {
    console.error('AI log error', error);
    return NextResponse.json({ error: error?.message || 'Erro' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  // Allow updating an existing interaction (e.g., user later rates it)
  try {
    const { id, rating, thumbsUp, resolvedIssue, feedbackText } = await req.json();
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    const updated = await prisma.aISupportInteraction.update({
      where: { id },
      data: {
        ...(typeof rating === 'number' ? { rating } : {}),
        ...(typeof thumbsUp === 'boolean' ? { thumbsUp } : {}),
        ...(typeof resolvedIssue === 'boolean' ? { resolvedIssue } : {}),
        ...(feedbackText ? { feedbackText } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro' }, { status: 500 });
  }
}
