// @ts-nocheck
/**
 * EXEMPLO: Rota de Transação com Rate Limiting
 *
 * Esta é uma rota de EXEMPLO mostrando como implementar rate limiting.
 * Copie este padrao para suas rotas reais (vendas, production plans, etc)
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  checkTransactionLimit,
  incrementTransactionCount,
} from '@/lib/transaction-limiter';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface TransactionRequest {
  description: string;
  amount?: number;
}

/**
 * POST /api/example-transaction
 * Exemplo de rota que implementa rate limiting
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Autenticar usuario
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Nao autenticado' },
        { status: 401 }
      );
    }

    // 2. Verificar limite de transações ANTES de processar
    const limitCheck = await checkTransactionLimit(session.user.id);

    if (!limitCheck.allowed) {
      // Limite atingido - retornar 429
      return NextResponse.json(
        {
          error: 'Limite de transações atingido',
          message: limitCheck.message,
          tier: limitCheck.tier,
          limit: limitCheck.limit,
          remaining: limitCheck.remaining,
          currentCount: limitCheck.currentCount,
          suggestUpgrade: limitCheck.tier === 'starter',
        },
        { status: 429 }
      );
    }

    // 3. Validar request
    const body: TransactionRequest = await request.json();

    if (!body.description) {
      return NextResponse.json(
        { error: 'Campo "description" é obrigatório' },
        { status: 400 }
      );
    }

    // 4. Processar a transação (sua logica aqui)
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 5. Incrementar contador APENAS apos sucesso
    await incrementTransactionCount(session.user.id);

    // 6. Retornar resposta com status atualizado
    return NextResponse.json(
      {
        success: true,
        message: 'Transação registrada com sucesso',
        transactionId: transactionId,
        transactions: {
          limit: limitCheck.limit,
          remaining: limitCheck.remaining - 1,
          tier: limitCheck.tier,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao processar transação:', error);
    return NextResponse.json(
      {
        error: 'Erro ao processar transação',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/example-transaction/status
 * Retorna status do limite do usuario (sem contar como transação)
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Nao autenticado' },
      { status: 401 }
    );
  }

  const limitStatus = await checkTransactionLimit(session.user.id);

  return NextResponse.json({
    tier: limitStatus.tier,
    daily_limit: limitStatus.limit,
    remaining: limitStatus.remaining,
    current_count: limitStatus.currentCount,
    allowed: limitStatus.allowed,
    message: limitStatus.message,
  });
}
