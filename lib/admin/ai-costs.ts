import { prisma } from '@/lib/prisma';
import { monthlyLimit } from '@/lib/ai/config';
import { restaurantTier } from '@/lib/tier-guard';
import { brtDayStart } from '@/lib/staff/commission-rules';
import { addMonths } from '@/lib/utility-bills/rules';

export interface AiCostRow {
  restaurantId: string;
  name: string;
  tier: string;
  /** Counted questions (what the plan limit counts) */
  questions: number;
  limit: number | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  errors: number;
  detailed: number;
  withFiles: number;
  lastAt: string | null;
}

/**
 * Plataforma > Custo da IA (pendências M7, owner 2026-10-23): what each restaurant spent on the AI in a Brasília month.
 * The cost sums every call, also the failed ones the plan does not count (they were paid for).
 */
export async function aiCostsByMonth(ym: string) {
  const range = { gte: brtDayStart(`${ym}-01`), lt: brtDayStart(`${addMonths(ym, 1)}-01`) };
  const where = { createdAt: range };
  const [all, counted, errors, detailed, files] = await Promise.all([
    prisma.aiQuestion.groupBy({
      by: ['restaurantId'], where,
      _sum: { costUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true },
      _max: { createdAt: true },
    }),
    prisma.aiQuestion.groupBy({ by: ['restaurantId'], where: { ...where, counted: true }, _count: { _all: true } }),
    prisma.aiQuestion.groupBy({ by: ['restaurantId'], where: { ...where, error: { not: null } }, _count: { _all: true } }),
    prisma.aiQuestion.groupBy({ by: ['restaurantId'], where: { ...where, detailed: true }, _count: { _all: true } }),
    prisma.aiQuestion.groupBy({ by: ['restaurantId'], where: { ...where, NOT: { attachments: { equals: null as any } } }, _count: { _all: true } }),
  ]);
  const countOf = (rows: { restaurantId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.restaurantId, r._count._all]));
  const [c, e, d, f] = [countOf(counted), countOf(errors), countOf(detailed), countOf(files)];
  const names = new Map((await prisma.restaurant.findMany({ where: { id: { in: all.map((r) => r.restaurantId) } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]));
  const restaurants: AiCostRow[] = await Promise.all(all.map(async (r) => {
    const tier = await restaurantTier(r.restaurantId);
    return {
      restaurantId: r.restaurantId,
      name: names.get(r.restaurantId) ?? '—',
      tier,
      questions: c.get(r.restaurantId) ?? 0,
      limit: monthlyLimit(tier),
      costUsd: r._sum.costUsd ?? 0,
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      cacheReadTokens: r._sum.cacheReadTokens ?? 0,
      cacheWriteTokens: r._sum.cacheWriteTokens ?? 0,
      errors: e.get(r.restaurantId) ?? 0,
      detailed: d.get(r.restaurantId) ?? 0,
      withFiles: f.get(r.restaurantId) ?? 0,
      lastAt: r._max.createdAt?.toISOString() ?? null,
    };
  }));
  restaurants.sort((x, y) => y.costUsd - x.costUsd);
  const totals = restaurants.reduce((t, r) => ({ questions: t.questions + r.questions, costUsd: t.costUsd + r.costUsd, errors: t.errors + r.errors }), { questions: 0, costUsd: 0, errors: 0 });
  return { month: ym, totals, restaurants };
}
