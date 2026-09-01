// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { gatherChatContext } from '@/lib/ai/gather-restaurant-data';
import { callLLM } from '@/lib/ai/llm-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getRestaurantId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  return u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId || null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any).id;
    const restaurantId = await getRestaurantId(userId);
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    const body = await req.json();
    const { question, history = [] } = body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json({ error: 'Pergunta é obrigatória' }, { status: 400 });
    }

    // Gather restaurant context
    const context = await gatherChatContext(restaurantId);

    const systemPrompt = `Você é o Gastrux, um assistente inteligente especializado em gestão de restaurantes.
Você tem acesso aos dados reais do restaurante do usuário e deve responder com base neles.

Dados do restaurante:
${context}

Regras:
1. Responda SEMPRE em português do Brasil
2. Seja conciso e direto
3. Use dados reais do restaurante nas respostas
4. Se não tiver dados suficientes, diga claramente
5. Dê sugestões acionáveis quando possível
6. Use formatação simples (negrito com **, listas com -)
7. Para cálculos financeiros, mostre o raciocínio
8. Nunca invente dados - use apenas o que está disponível`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.slice(-6).map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: question },
    ];

    const answer = await callLLM(messages, {
      maxTokens: 1500,
      temperature: 0.4,
    });

    // Save as insight (lightweight)
    await prisma.aIInsight.create({
      data: {
        type: 'CHAT_RESPONSE',
        title: question.substring(0, 100),
        summary: answer.substring(0, 300),
        content: JSON.stringify({ question, answer }),
        timeRange: 'instant',
        score: 0,
        tags: JSON.stringify(['chat', 'pergunte-ao-gastrux']),
        restaurantId,
        createdById: userId,
      },
    });

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('[ai-chat] Error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
