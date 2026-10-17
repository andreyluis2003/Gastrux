import { prisma } from '@/lib/prisma';
import type { RestaurantMember } from '@/lib/auth/restaurant-role';
import { getSessionView } from '@/lib/caixa/sessions';
import { nightRows } from '@/lib/daily-count/service';
import { computeDre } from '@/lib/finance/dre';
import { itemSalesInRange } from '@/lib/finance/item-sales';
import { salesInRange } from '@/lib/finance/month-sales';
import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { loadScreen } from '@/lib/utility-bills/service';
import { onboardingStatus } from '@/lib/onboarding/first-steps';
import { createDraft, TOOL_KIND } from '../drafts/service';
import { validateMenu, validateStaff, validateTables } from '../drafts/validate';
import { monthlyLimit } from '../config';
import { questionsThisMonth } from '../usage';
import { isManagerRole, TOOL_ROLES, type ToolName } from './defs';
import { AiToolError, parsePeriod } from './period';

type Result = { ok: true; data: unknown } | { ok: false; error: string; denied: boolean };
const reais = (cents: number) => Math.round(cents) / 100;
const TZ = 'America/Sao_Paulo';
const hhmm = (d: Date) => d.toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function tierOf(restaurantId: string) {
  return (await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true } }))?.subscriptionTier || 'starter';
}

/** Runs one tool for the logged member (spec 2026-10-16 ia-assistente §4.2/§4.3): read-only, scoped, role-checked again */
export async function runTool(member: RestaurantMember, name: string, input: unknown, now = new Date(), ctx: { questionId?: string } = {}): Promise<Result> {
  const roles = TOOL_ROLES[name as ToolName];
  if (!roles) return { ok: false, error: `Ferramenta desconhecida: ${name}`, denied: false };
  if (!(roles as string[]).includes(member.role)) return { ok: false, error: 'Essa informação é do dono ou do gerente.', denied: true };
  const rid = member.restaurantId;
  const manager = isManagerRole(member.role);
  try {
    switch (name as ToolName) {
      case 'vendas_periodo': {
        const p = parsePeriod(input);
        const s = await salesInRange(rid, p.from, p.to);
        return { ok: true, data: {
          periodo: `${p.startDate} a ${p.endDate}`, total: reais(s.totalCents), vendas: s.salesCount,
          ticketMedio: s.salesCount ? reais(s.totalCents / s.salesCount) : 0, salao: reais(s.salaoCents), delivery: reais(s.deliveryCents),
          taxaServicoIncluida: reais(s.serviceCents), porForma: Object.fromEntries(Object.entries(s.byMethod).map(([k, v]) => [k, reais(v)])),
        } };
      }
      case 'itens_vendidos': {
        const p = parsePeriod(input);
        const items = (await itemSalesInRange(rid, p.from, p.to)).sort((a, b) => b.quantity - a.quantity).slice(0, 30);
        return { ok: true, data: { periodo: `${p.startDate} a ${p.endDate}`,
          itens: items.map((i) => (manager ? { item: i.name, quantidade: i.quantity, receita: i.revenue } : { item: i.name, quantidade: i.quantity })) } };
      }
      case 'caixa_turno': {
        const open = await prisma.cashSession.findMany({ where: { restaurantId: rid, status: 'OPEN' }, select: { id: true } });
        const turnos = [];
        for (const s of open) {
          const v = await getSessionView(member, s.id);
          if (!v) continue;
          const despesas = v.entries.filter((e) => e.type === 'EXPENSE').reduce((t, e) => t + e.amountCents, 0);
          turnos.push({ caixa: v.register.name, abertoEm: hhmm(new Date(v.session.openedAt)), abertoPor: v.openedByName, trocoInicial: reais(v.session.openingFloatCents),
            vendas: reais(v.sales.totalCents), numeroVendas: v.sales.salesCount,
            esperadoPorForma: v.expected ? Object.fromEntries(Object.entries(v.expected).map(([k, c]) => [k, reais(c as number)])) : null,
            despesas: reais(despesas) });
        }
        return { ok: true, data: { turnosAbertos: turnos } };
      }
      case 'mesas_agora': {
        const open = await prisma.orderSession.findMany({
          where: { restaurantId: rid, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } },
          select: { tableNumber: true, openedAt: true, payAtWaiterRequestedAt: true, items: { select: { quantity: true, price: true } } },
          orderBy: { openedAt: 'asc' },
        });
        // Never the comanda customerName: it is personal data (spec §4.2)
        const mesas = open.map((s) => {
          const minutos = Math.max(0, Math.round((now.getTime() - s.openedAt.getTime()) / 60000));
          if (member.role === 'COOK') return { mesa: s.tableNumber, abertaHaMinutos: minutos };
          return { mesa: s.tableNumber, abertaHaMinutos: minutos, valorAberto: Math.round(s.items.reduce((t, i) => t + Number(i.price) * i.quantity, 0) * 100) / 100,
            chamouGarcom: !!s.payAtWaiterRequestedAt };
        });
        return { ok: true, data: { mesas, observacao: 'valor aproximado, sem taxa de serviço' } };
      }
      case 'contagem_dia': {
        const night = await prisma.dailyCount.findFirst({ where: { restaurantId: rid, status: 'OPEN' }, select: { id: true, openedAt: true } });
        const rows = night ? await nightRows(prisma, rid, night, now) : null;
        const closed = await prisma.dailyCount.findMany({ where: { restaurantId: rid, status: 'CLOSED' }, orderBy: { closedAt: 'desc' }, take: 7, include: { lines: true } });
        return { ok: true, data: {
          noiteAberta: night ? { desde: hhmm(night.openedAt), itens: rows!.map((r) => ({ item: r.name, inicio: r.opening, montados: r.mounted, vendidos: r.sold, perdas: r.loss, deveriaTer: r.expected })) } : null,
          ultimasNoites: closed.map((n) => ({ fechadaEm: hhmm(n.closedAt!), itens: n.lines.map((l) => ({ item: l.recipeName, vendidos: l.sold, perdas: l.loss, diferenca: l.difference,
            ...(manager ? { valorDiferenca: Math.round(l.difference * l.unitCost * 100) / 100 } : {}) })) })),
        } };
      }
      case 'validades': {
        if (!isTierFeatureEnabled(await tierOf(rid), 'labelExpiry')) return { ok: true, data: { indisponivel: 'O controle de validades é do plano Pro.' } };
        // End of today in Brasília (same helpers as lib/labels/morning-alert.ts)
        const endToday = brtDayStart(new Date(Date.parse(`${brtDay(now)}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10));
        const labels = await prisma.foodLabel.findMany({ where: { restaurantId: rid, status: 'ACTIVE', expiresAt: { lt: endToday } }, orderBy: { expiresAt: 'asc' }, take: 30, select: { itemName: true, expiresAt: true } });
        return { ok: true, data: { etiquetas: labels.map((l) => ({ item: l.itemName, vence: hhmm(l.expiresAt), vencida: l.expiresAt <= now })) } };
      }
      case 'estoque_baixo': {
        const ings = await prisma.ingredient.findMany({ where: { restaurantId: rid, active: true, minimumStock: { gt: 0 } }, select: { name: true, minimumStock: true, standardUnit: true, currentStock: { select: { currentQuantity: true } } } });
        const low = ings.filter((i) => (i.currentStock?.currentQuantity ?? 0) < i.minimumStock)
          .map((i) => ({ insumo: i.name, atual: i.currentStock?.currentQuantity ?? 0, minimo: i.minimumStock, unidade: i.standardUnit }));
        return { ok: true, data: { insumos: low } };
      }
      case 'ficha_tecnica': {
        const nome = typeof (input as any)?.nome === 'string' ? (input as any).nome.trim().slice(0, 80) : '';
        if (!nome) throw new AiToolError('Diga o nome do item.');
        const recipes = await prisma.recipe.findMany({ where: { restaurantId: rid, active: true, name: { contains: nome, mode: 'insensitive' } }, take: 3,
          select: { name: true, baseYield: true, sellingPrice: true, ingredients: { select: { quantity: true, unit: true, ingredient: { select: { name: true, referenceCost: true } } } } } });
        return { ok: true, data: { itens: recipes.map((r) => {
          const ingredientes = r.ingredients.map((i) => ({ insumo: i.ingredient.name, quantidade: i.quantity, unidade: i.unit }));
          if (!manager) return { item: r.name, ingredientes };
          const custo = Math.round((r.ingredients.reduce((t, i) => t + i.quantity * i.ingredient.referenceCost, 0) / (r.baseYield || 1)) * 100) / 100;
          const preco = Number(r.sellingPrice ?? 0);
          return { item: r.name, ingredientes, custo, preco, margemPct: preco > 0 ? Math.round(((preco - custo) / preco) * 100) : null };
        }) } };
      }
      case 'dre_resumo': {
        const p = parsePeriod(input);
        const { dre } = await computeDre(rid, p.startDate, p.endDate);
        const r2 = (n: number) => Math.round(n * 100) / 100;
        const d = dre.despesasOperacionais;
        return { ok: true, data: { periodo: `${p.startDate} a ${p.endDate}`, receitaBruta: r2(dre.receitaBruta), taxaServicoIncluida: r2(dre.taxaServico), deducoes: r2(dre.deducoes.total),
          receitaLiquida: r2(dre.receitaLiquida), cmv: r2(dre.cmv), lucroBruto: r2(dre.lucroBruto),
          despesas: { operacional: r2(d.operacional), pessoal: r2(d.pessoal), contasConsumo: r2(d.contasConsumo), taxasGateway: r2(d.taxasGateway), total: r2(d.total) },
          // true: the utility bills are whole-month values inside a partial period
          contasConsumoMesInteiro: dre.contasConsumoMesInteiro,
          resultadoOperacional: r2(dre.resultadoOperacional), resultadoLiquido: r2(dre.resultadoLiquido), margemLiquidaPct: dre.margemLiquida } };
      }
      case 'contas_consumo': {
        const screen = await loadScreen(member, now);
        return { ok: true, data: { contas: screen.accounts.filter((a) => a.active).map((a) => {
          const last = a.bills[0];
          const ind = a.latest?.indicators;
          return { conta: a.name, mes: last?.referenceMonth ?? null, valor: last ? reais(last.amountCents) : null, consumo: last?.consumption ?? null, unidade: a.unit,
            ...(ind ? { vsMesAnteriorPct: ind.prev ? Math.round(ind.prev.measurePct) : null, vsMedia3MesesPct: ind.avg3 ? Math.round(ind.avg3.pct) : null } : {}) };
        }), indicadores: screen.insights ? 'Pro' : 'disponíveis no plano Pro' } };
      }
      case 'notas_fiscais': {
        const p = parsePeriod(input);
        const where = { config: { restaurantId: rid }, createdAt: { gte: p.from, lt: p.to } };
        const groups = await prisma.nFeDocument.groupBy({ by: ['status'], where, _count: { _all: true } });
        const rejected = await prisma.nFeDocument.findMany({ where: { ...where, status: 'rejected' }, orderBy: { createdAt: 'desc' }, take: 5, select: { documentNumber: true, statusDescription: true, createdAt: true } });
        return { ok: true, data: { periodo: `${p.startDate} a ${p.endDate}`, porSituacao: Object.fromEntries(groups.map((g) => [g.status, g._count._all])),
          ultimasRejeitadas: rejected.map((r) => ({ numero: r.documentNumber, motivo: r.statusDescription, em: hhmm(r.createdAt) })) } };
      }
      case 'progresso_implantacao': {
        const st = await onboardingStatus(rid, now);
        return { ok: true, data: {
          etapas: st.steps.map((s) => ({ chave: s.key, rotulo: s.label, feita: s.done, opcional: !!s.optional, link: s.href })),
          proxima: st.next ? { chave: st.next.key, rotulo: st.next.label, link: st.next.href } : null,
          diasDeConta: st.daysSinceSignup,
        } };
      }
      // Proposals only create a draft the owner reviews and confirms (spec 2026-10-17 ia-implantacao §4.2)
      case 'propor_cardapio': case 'propor_mesas': case 'propor_equipe': {
        const kind = TOOL_KIND[name];
        const v = kind === 'MENU' ? validateMenu(input) : kind === 'TABLES' ? validateTables(input) : validateStaff(input, { requireEmail: false });
        if (!v.ok) return { ok: false, error: v.error, denied: false };
        const d = await createDraft(member, kind, v.value, ctx.questionId);
        return { ok: true, data: { rascunhoId: d.id, resumo: d.resumo, proximoPasso: 'O dono revisa e confirma no botão Revisar e confirmar.' } };
      }
      case 'plano': {
        const tier = await tierOf(rid);
        const limite = monthlyLimit(tier);
        const usadas = await questionsThisMonth(rid, now);
        return { ok: true, data: { plano: tier, limiteMensal: limite, usadas, restantes: limite === null ? null : Math.max(0, limite - usadas) } };
      }
    }
  } catch (error) {
    if (error instanceof AiToolError) return { ok: false, error: error.message, denied: false };
    console.error(`[ai] tool ${name} failed:`, error);
    return { ok: false, error: 'Não foi possível consultar agora.', denied: false };
  }
  return { ok: false, error: `Ferramenta desconhecida: ${name}`, denied: false };
}
