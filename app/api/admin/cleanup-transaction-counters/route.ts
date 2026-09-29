// @ts-nocheck
/**
 * CRON JOB: Resetar contadores de transações
 * Este endpoint deve ser executado diariamente (preferencialmente a meia-noite)
 * 
 * Via ambiente de produção, pode ser acionado por um serviço de cron externo ou
 * um Daemon agendado que faz chamadas HTTP POST para este endpoint.
 * 
 * Exemplo de agendamento com curl:
 * 0 0 * * * curl -X POST https://seu-app.com/api/admin/cleanup-transaction-counters \
 *   -H "X-Admin-Secret: seu-secret-aqui"
 */

import { NextRequest, NextResponse } from 'next/server';
import { resetDailyCounters } from '@/lib/transaction-limiter';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Automatic jobs only (CRON_SECRET, compared in constant time, refused when not configured).
    // It fell back to the public password "default-secret" when ADMIN_CLEANUP_SECRET was unset.
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Executar limpeza
    const deletedCount = await resetDailyCounters();

    return NextResponse.json(
      {
        success: true,
        message: `Limpeza concluida: ${deletedCount} registros antigos removidos`,
        timestamp: new Date().toISOString(),
        deletedCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao limpar contadores:', error);
    return NextResponse.json(
      {
        error: 'Erro ao executar limpeza',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
