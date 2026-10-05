import { NextResponse } from 'next/server';
import { CashRuleError } from './rules';

/** Maps a cash rule error to its HTTP answer; anything else is a logged 500. */
export function cashErrorResponse(error: unknown, context: string) {
  if (error instanceof CashRuleError) {
    return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
  }
  console.error(`[caixa] ${context}:`, error);
  return NextResponse.json({ error: 'Erro interno no caixa' }, { status: 500 });
}
