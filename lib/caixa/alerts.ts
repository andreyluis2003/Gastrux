import { prisma } from '@/lib/prisma';
import { METHOD_LABEL, type ByMethod, type CashMethod } from './payment-methods';
import { FORGOTTEN_SHIFT_HOURS } from './rules';

/** Cash register alerts for the manager (spec rules 6, 8, 15). One unread alert per dedupe key; never throws. */
async function notifyOnce(restaurantId: string, dedupeKey: string, title: string, message: string, severity: 'HIGH' | 'CRITICAL' = 'HIGH', extra: Record<string, unknown> = {}, onceEver = false) {
  try {
    const existing = await prisma.notification.findFirst({
      // onceEver: a condition re-checked by a cron (forgotten shift) is raised once, even after it was read
      where: { restaurantId, ...(onceEver ? {} : { read: false }), data: { path: ['dedupeKey'], equals: dedupeKey } },
      select: { id: true },
    });
    if (existing) return;
    await prisma.notification.create({
      data: { restaurantId, type: 'SYSTEM_ERROR', severity, title, message, actionUrl: '/caixa/historico', actionLabel: 'Ver caixas', data: { kind: 'cash', dedupeKey, ...extra } },
    });
  } catch (error) {
    console.error('Could not store the cash register alert:', error);
  }
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function alertCashDifference(restaurantId: string, sessionId: string, registerName: string, methods: CashMethod[], difference: ByMethod) {
  if (methods.length === 0) return;
  const detail = methods.map((m) => `${METHOD_LABEL[m]}: ${difference[m] > 0 ? 'sobra' : 'falta'} de ${brl(Math.abs(difference[m]))}`).join('; ');
  await notifyOnce(restaurantId, `cash-diff:${sessionId}`, `Diferença no fechamento do ${registerName}`, detail, 'HIGH', { cashSessionId: sessionId });
}

export async function alertLateEntry(restaurantId: string, sessionId: string, orderSessionId: string | null) {
  await notifyOnce(restaurantId, `cash-late:${sessionId}:${orderSessionId ?? 'x'}`, 'Venda lançada após o fechamento do caixa',
    'Uma venda feita sem internet chegou depois do fechamento do turno. O turno foi recalculado: confira a diferença.', 'HIGH', { cashSessionId: sessionId, orderSessionId });
}

export async function alertSaleWithoutShift(restaurantId: string, orderSessionId: string) {
  await notifyOnce(restaurantId, `cash-none:${orderSessionId}`, 'Venda recebida sem caixa',
    'Uma venda feita sem internet chegou e o restaurante não tinha caixa aberto. Ela não entrou em nenhum turno.', 'HIGH', { orderSessionId });
}

/** Called by the 2-minute cron (POST /api/kds/stale-check): shifts open for more than 16 hours. */
export async function alertForgottenShifts(now = new Date()): Promise<{ alerted: number }> {
  const limit = new Date(now.getTime() - FORGOTTEN_SHIFT_HOURS * 3600_000);
  const shifts = await prisma.cashSession.findMany({
    where: { status: 'OPEN', openedAt: { lt: limit } },
    select: { id: true, restaurantId: true, openedAt: true, cashRegister: { select: { name: true } } },
    orderBy: { openedAt: 'asc' },
    take: 200,
  });
  for (const s of shifts) {
    await notifyOnce(s.restaurantId, `cash-forgotten:${s.id}`, `${s.cashRegister.name} aberto há mais de ${FORGOTTEN_SHIFT_HOURS} horas`,
      `O turno foi aberto em ${s.openedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Feche o caixa para conferir o dia.`, 'HIGH', { cashSessionId: s.id }, true);
  }
  return { alerted: shifts.length };
}

