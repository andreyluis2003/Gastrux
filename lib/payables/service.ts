import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { monthLabel, UtilityError } from '@/lib/utility-bills/rules';
import { addEntry } from '@/lib/caixa/sessions';
import type { NfeDuplicatas } from '@/lib/nfe/duplicatas';
import {
  addMonths, brtToday, CATEGORIES, CATEGORY_LABEL, currentMonth, dayDate, displayState, dueDateIn, installmentDueDates,
  monthDate, monthOf, parseAmountCents, parseDay, PayableError, PAY_METHODS, seriesMonths, splitInstallments, type DisplayState, type PayableCategory,
} from './rules';

/**
 * Contas a pagar (spec 2026-10-18 contas a pagar): one list of the restaurant's bills. Owner and manager only
 * (the routes check it); every query is scoped by the member's restaurant.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');
export { money };

async function tierOf(restaurantId: string) {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true } });
  return r?.subscriptionTier || 'starter';
}

export async function payableFeatures(restaurantId: string) {
  const tier = await tierOf(restaurantId);
  return {
    series: isTierFeatureEnabled(tier, 'payableSeries'),
    alerts: isTierFeatureEnabled(tier, 'payableAlerts'),
    nfe: isTierFeatureEnabled(tier, 'payableFromNfe'),
  };
}

function amountOf(v: unknown): number {
  try {
    return parseAmountCents(v);
  } catch (error) {
    if (error instanceof UtilityError) throw new PayableError('Valor inválido');
    throw error;
  }
}

function descriptionOf(v: unknown): string {
  const d = typeof v === 'string' ? v.trim() : '';
  if (!d) throw new PayableError('Informe a descrição da conta');
  return d.slice(0, 120);
}

function categoryOf(v: unknown): PayableCategory {
  if (typeof v !== 'string' || !CATEGORIES.includes(v as PayableCategory)) throw new PayableError('Categoria inválida');
  return v as PayableCategory;
}

/** Utility bills come from Contas de consumo (with their consumption); typed by hand they would leave the DRE */
function manualCategoryOf(v: unknown): PayableCategory {
  const c = categoryOf(v);
  if (c === 'UTILITIES') throw new PayableError('Contas de consumo se lançam em Relatórios > Contas de consumo');
  return c;
}

function competenceOf(v: unknown, dueDay: string): string {
  if (v === undefined || v === null || v === '') return dueDay.slice(0, 7);
  if (typeof v !== 'string' || !/^\d{4}-\d{2}$/.test(v)) throw new PayableError('Mês de competência inválido');
  return v;
}

const notesOf = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);

async function supplierOf(restaurantId: string, v: unknown): Promise<string | null> {
  if (v === undefined || v === null || v === '') return null;
  const s = await prisma.supplier.findFirst({ where: { id: String(v), restaurantId }, select: { id: true } });
  if (!s) throw new PayableError('Fornecedor não encontrado', 404);
  return s.id;
}

/** Creates the occurrences missing for the active series of a Business restaurant (current month + 2). */
export async function ensureSeries(restaurantId: string, now = new Date(), onlySeriesId?: string): Promise<number> {
  if (!(await payableFeatures(restaurantId)).series) return 0;
  const series = await prisma.payableSeries.findMany({ where: { restaurantId, active: true, ...(onlySeriesId ? { id: onlySeriesId } : {}) } });
  if (!series.length) return 0;
  const months = seriesMonths(currentMonth(now));
  let created = 0;
  for (const s of series) {
    const existing = await prisma.payable.findMany({ where: { seriesId: s.id, competenceMonth: { in: months.map(monthDate) } }, select: { competenceMonth: true } });
    const have = new Set(existing.map((e) => monthOf(e.competenceMonth)));
    for (const ym of months) {
      // Never before the series' first month (a rent created today that starts next month)
      if (have.has(ym) || ym < monthOf(s.startMonth)) continue;
      try {
        await prisma.payable.create({
          data: {
            restaurantId, description: s.description, category: s.category, supplierId: s.supplierId, amountCents: s.amountCents,
            competenceMonth: monthDate(ym), dueDate: dueDateIn(ym, s.dueDay), source: 'SERIES', seriesId: s.id, createdById: s.createdById,
          },
        });
        created++;
      } catch (error) {
        // Two requests at once: the unique (seriesId, competenceMonth) keeps a single bill
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
  }
  return created;
}

export async function createPayables(
  member: RestaurantMember,
  body: { description?: unknown; category?: unknown; supplierId?: unknown; amount?: unknown; dueDate?: unknown; competenceMonth?: unknown; notes?: unknown; mode?: unknown; installments?: unknown },
  now = new Date(),
): Promise<{ ids: string[] }> {
  const description = descriptionOf(body.description);
  const category = manualCategoryOf(body.category);
  const amountCents = amountOf(body.amount);
  const due = parseDay(body.dueDate);
  const notes = notesOf(body.notes);
  const supplierId = await supplierOf(member.restaurantId, body.supplierId);
  const base = { restaurantId: member.restaurantId, category, supplierId, notes, createdById: member.userId };
  const mode = body.mode ?? 'ONCE';

  if (mode === 'ONCE') {
    const competence = competenceOf(body.competenceMonth, due);
    const row = await prisma.payable.create({
      data: { ...base, description, amountCents, dueDate: dayDate(due), competenceMonth: monthDate(competence) },
      select: { id: true },
    });
    return { ids: [row.id] };
  }

  if (mode === 'INSTALLMENTS') {
    const n = Number(body.installments);
    if (!Number.isInteger(n) || n < 2 || n > 24) throw new PayableError('Escolha de 2 a 24 parcelas');
    const parts = splitInstallments(amountCents, n);
    const dates = installmentDueDates(due, n);
    const group = crypto.randomUUID();
    const ids: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < n; i++) {
        const row = await tx.payable.create({
          data: {
            ...base, description: `${description} ${i + 1}/${n}`, amountCents: parts[i], dueDate: dates[i], competenceMonth: monthDate(iso(dates[i]).slice(0, 7)),
            source: 'INSTALLMENT', installmentGroup: group, installmentNumber: i + 1, installmentTotal: n,
          },
          select: { id: true },
        });
        ids.push(row.id);
      }
    });
    return { ids };
  }

  if (mode === 'SERIES') {
    if (!(await payableFeatures(member.restaurantId)).series) throw new PayableError('Repetir todo mês é do plano Business', 403);
    const series = await prisma.payableSeries.create({
      data: {
        restaurantId: member.restaurantId, description, category, supplierId, amountCents, dueDay: Number(due.slice(8, 10)),
        startMonth: monthDate(due.slice(0, 7)), createdById: member.userId,
      },
    });
    await ensureSeries(member.restaurantId, now, series.id);
    const rows = await prisma.payable.findMany({ where: { seriesId: series.id }, orderBy: { competenceMonth: 'asc' }, select: { id: true } });
    return { ids: rows.map((r) => r.id) };
  }

  throw new PayableError('Modo inválido');
}

async function ownPayable(member: RestaurantMember, id: unknown) {
  if (typeof id !== 'string') throw new PayableError('Conta não encontrada', 404);
  const p = await prisma.payable.findFirst({ where: { id, restaurantId: member.restaurantId } });
  if (!p) throw new PayableError('Conta não encontrada', 404);
  return p;
}
export { ownPayable };

export async function listPayables(member: RestaurantMember, query: { status?: string | null; category?: string | null; month?: string | null }, now = new Date()) {
  const { restaurantId } = member;
  await ensureSeries(restaurantId, now);
  const today = brtToday(now);
  const ym = today.slice(0, 7);
  const where: Prisma.PayableWhereInput = { restaurantId };
  if (query.category && CATEGORIES.includes(query.category as PayableCategory)) where.category = query.category as PayableCategory;
  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) where.competenceMonth = monthDate(query.month);
  // The situation filter runs in the database: a long paid history never pushes the open bills out of the list
  const open = query.status === 'OPEN' || query.status === 'OVERDUE';
  if (open) where.status = 'OPEN';
  if (query.status === 'OVERDUE') where.dueDate = { lt: dayDate(today) };
  if (query.status === 'PAID' || query.status === 'CANCELED') where.status = query.status;
  const rows = await prisma.payable.findMany({
    where,
    orderBy: open ? [{ dueDate: 'asc' }, { createdAt: 'asc' }] : [{ dueDate: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    include: { supplier: { select: { name: true } } },
  });
  const items = rows.map((r) => ({
    id: r.id,
    description: r.description,
    category: r.category,
    categoryLabel: CATEGORY_LABEL[r.category as PayableCategory],
    supplierName: r.supplier?.name ?? null,
    amountCents: r.amountCents,
    dueDate: iso(r.dueDate),
    competenceMonth: monthOf(r.competenceMonth),
    state: displayState(r, today) as DisplayState,
    source: r.source,
    installment: r.installmentNumber ? `${r.installmentNumber}/${r.installmentTotal}` : null,
    seriesId: r.seriesId,
    paidAt: r.paidAt ? iso(r.paidAt) : null,
    paidMethod: r.paidMethod,
    paidFrom: r.paidFrom,
    notes: r.notes,
  }));
  // The cards always read the whole restaurant, whatever the filters: open bills up to 7 days ahead, and the month
  const in7 = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000);
  const [soon, month] = await Promise.all([
    prisma.payable.findMany({ where: { restaurantId, status: 'OPEN', dueDate: { lte: in7 } }, select: { status: true, dueDate: true, amountCents: true } }),
    prisma.payable.aggregate({ where: { restaurantId, status: { not: 'CANCELED' }, competenceMonth: monthDate(ym) }, _sum: { amountCents: true }, _count: true }),
  ]);
  const sum = (state: DisplayState) => {
    const sel = soon.filter((r) => displayState(r, today) === state);
    return { count: sel.length, cents: sel.reduce((s, r) => s + r.amountCents, 0) };
  };
  const summary = {
    overdue: sum('OVERDUE'),
    today: sum('TODAY'),
    week: sum('WEEK'),
    month: { count: month._count, cents: month._sum.amountCents ?? 0 },
  };
  return { summary, items, features: await payableFeatures(restaurantId) };
}

export async function editPayable(
  member: RestaurantMember,
  id: string,
  body: { description?: unknown; amount?: unknown; dueDate?: unknown; competenceMonth?: unknown; category?: unknown; notes?: unknown; supplierId?: unknown; scope?: unknown },
) {
  const p = await ownPayable(member, id);
  if (p.status !== 'OPEN') throw new PayableError('Só uma conta a pagar pode ser editada', 409);
  const data: Prisma.PayableUpdateInput = { updatedById: member.userId };
  const touchesMoney = body.amount !== undefined || body.dueDate !== undefined || body.competenceMonth !== undefined;
  if (p.source === 'UTILITY' && touchesMoney) throw new PayableError('Edite esta conta em Contas de consumo', 409);
  if (body.description !== undefined) data.description = descriptionOf(body.description);
  if (body.category !== undefined) data.category = manualCategoryOf(body.category);
  if (body.amount !== undefined) data.amountCents = amountOf(body.amount);
  if (body.notes !== undefined) data.notes = notesOf(body.notes);
  let supplierSet: string | null | undefined;
  if (body.supplierId !== undefined) {
    supplierSet = await supplierOf(member.restaurantId, body.supplierId);
    data.supplier = supplierSet ? { connect: { id: supplierSet } } : { disconnect: true };
  }
  let newDue: string | null = null;
  if (body.dueDate !== undefined) {
    newDue = parseDay(body.dueDate);
    data.dueDate = dayDate(newDue);
  }
  if (body.competenceMonth !== undefined) data.competenceMonth = monthDate(competenceOf(body.competenceMonth, newDue ?? iso(p.dueDate)));

  if (body.scope === 'NEXT' && p.seriesId) {
    // "Esta e as próximas": the series and every OPEN bill of it from this month on; paid and canceled ones stay
    const seriesData: Prisma.PayableSeriesUpdateInput = {};
    if (data.description) seriesData.description = data.description as string;
    if (data.category) seriesData.category = data.category as PayableCategory;
    // A field sent unchanged (the February 28th of a day-31 series, a one-off amount) never reaches the series
    const amountChanged = data.amountCents !== undefined && data.amountCents !== p.amountCents;
    const dueChanged = newDue !== null && newDue !== iso(p.dueDate);
    if (amountChanged) seriesData.amountCents = data.amountCents as number;
    if (dueChanged) seriesData.dueDay = Number(newDue!.slice(8, 10));
    if (supplierSet !== undefined) seriesData.supplierId = supplierSet;
    await prisma.$transaction(async (tx) => {
      // This bill gets exactly what was typed (notes and date included); the next ones follow the series
      await tx.payable.update({ where: { id: p.id }, data });
      const series = await tx.payableSeries.update({ where: { id: p.seriesId! }, data: seriesData });
      const next = await tx.payable.findMany({ where: { seriesId: p.seriesId, status: 'OPEN', competenceMonth: { gt: p.competenceMonth } } });
      for (const n of next) {
        await tx.payable.update({
          where: { id: n.id },
          data: {
            description: series.description, category: series.category, supplierId: series.supplierId, updatedById: member.userId,
            ...(amountChanged ? { amountCents: series.amountCents } : {}),
            ...(dueChanged ? { dueDate: dueDateIn(monthOf(n.competenceMonth), series.dueDay) } : {}),
          },
        });
      }
    });
  } else {
    await prisma.payable.update({ where: { id: p.id }, data });
  }
  await recordAudit(member, { action: 'UPDATE', entityType: 'Payable', entityId: p.id, changes: { scope: body.scope === 'NEXT' ? 'NEXT' : 'THIS', body } });
  return { ok: true as const };
}

export async function cancelPayable(member: RestaurantMember, id: string, reason: unknown) {
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (why.length < 3) throw new PayableError('Informe o motivo do cancelamento');
  const p = await ownPayable(member, id);
  if (p.status === 'PAID') throw new PayableError('Desfaça o pagamento antes de cancelar', 409);
  if (p.status === 'CANCELED') return { ok: true as const };
  await prisma.payable.update({ where: { id: p.id }, data: { status: 'CANCELED', canceledAt: new Date(), canceledById: member.userId, cancelReason: why.slice(0, 200) } });
  await recordAudit(member, { action: 'UPDATE', entityType: 'Payable', entityId: p.id, changes: { canceled: why } });
  return { ok: true as const };
}

/** The open shift the drawer money comes from: the one named, else the only open one */
async function drawerShift(restaurantId: string, cashSessionId: unknown, noneMessage: string) {
  if (typeof cashSessionId === 'string' && cashSessionId) {
    const s = await prisma.cashSession.findFirst({ where: { id: cashSessionId, restaurantId, status: 'OPEN' }, select: { id: true } });
    if (!s) throw new PayableError('Este caixa não está aberto', 409);
    return s.id;
  }
  const open = await prisma.cashSession.findMany({ where: { restaurantId, status: 'OPEN' }, include: { cashRegister: { select: { name: true } } } });
  if (open.length === 0) throw new PayableError(noneMessage, 409);
  if (open.length > 1) {
    throw new PayableError('Escolha o caixa', 409, { shifts: open.map((o) => ({ id: o.id, registerName: o.cashRegister.name })) });
  }
  return open[0].id;
}

export async function payPayable(
  member: RestaurantMember,
  id: string,
  body: { paidAt?: unknown; method?: unknown; from?: unknown; cashSessionId?: unknown; force?: unknown },
  now = new Date(),
) {
  const p = await ownPayable(member, id);
  if (p.status === 'PAID') throw new PayableError('Esta conta já foi paga', 409);
  if (p.status === 'CANCELED') throw new PayableError('Esta conta foi cancelada', 409);
  if (body.from !== 'DRAWER' && body.from !== 'BANK') throw new PayableError('Informe de onde saiu o dinheiro');
  // Money from the drawer is cash, whatever the request says
  const method = body.from === 'DRAWER' ? 'CASH' : typeof body.method === 'string' && (PAY_METHODS as readonly string[]).includes(body.method) ? body.method : null;
  if (!method) throw new PayableError('Forma de pagamento inválida');
  const paidAt = body.paidAt === undefined || body.paidAt === '' ? brtToday(now) : parseDay(body.paidAt, 'Data do pagamento');
  const shiftId = body.from === 'DRAWER' ? await drawerShift(member.restaurantId, body.cashSessionId, 'Abra o caixa para pagar com dinheiro da gaveta') : null;

  // Claimed first: two clicks at once pay once
  const claimed = await prisma.payable.updateMany({
    where: { id: p.id, status: 'OPEN' },
    data: { status: 'PAID', paidAt: dayDate(paidAt), paidMethod: method, paidFrom: body.from, paidById: member.userId, updatedById: member.userId },
  });
  if (claimed.count === 0) throw new PayableError('Esta conta já foi paga', 409);

  if (shiftId) {
    let entryId: string;
    try {
      const { entry } = await addEntry(member, shiftId, {
        type: 'EXPENSE', amount: p.amountCents / 100, category: 'outros', description: `Conta a pagar: ${p.description}`.slice(0, 200),
        force: body.force === true, payableId: p.id,
      });
      entryId = entry.id;
    } catch (error) {
      // The drawer refused (not enough cash, shift closed): the bill stays open
      await prisma.payable.update({ where: { id: p.id }, data: { status: 'OPEN', paidAt: null, paidMethod: null, paidFrom: null, paidById: null } });
      throw error;
    }
    // The money left the drawer: the bill stays paid even if this link fails (undo waits for it)
    await prisma.payable.update({ where: { id: p.id }, data: { cashEntryId: entryId } });
  }
  await recordAudit(member, { action: 'UPDATE', entityType: 'Payable', entityId: p.id, changes: { paid: { method, from: body.from, paidAt, shiftId } } });
  return { ok: true as const };
}

export async function undoPayment(member: RestaurantMember, id: string, reason: unknown, cashSessionId?: unknown) {
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (why.length < 3) throw new PayableError('Informe o motivo');
  const p = await ownPayable(member, id);
  if (p.status !== 'PAID') throw new PayableError('Esta conta não está paga', 409);
  // A drawer payment is undone only once its expense is in the drawer: never money back for an expense still being written
  if (p.paidFrom === 'DRAWER' && !p.cashEntryId) throw new PayableError('O pagamento pela gaveta ainda está sendo registrado. Tente de novo em instantes', 409);
  const shiftId = p.paidFrom === 'DRAWER' ? await drawerShift(member.restaurantId, cashSessionId, 'Abra um caixa para devolver o dinheiro à gaveta') : null;
  // Claimed first: two undos at once give the money back once
  const done = await prisma.payable.updateMany({
    where: { id: p.id, status: 'PAID', cashEntryId: p.cashEntryId },
    data: { status: 'OPEN', paidAt: null, paidMethod: null, paidFrom: null, paidById: null, cashEntryId: null, updatedById: member.userId },
  });
  if (done.count === 0) throw new PayableError('Esta conta não está paga', 409);
  if (shiftId) {
    try {
      await addEntry(member, shiftId, {
        type: 'ADJUSTMENT', direction: 'IN', method: 'CASH', amount: p.amountCents / 100,
        description: `Pagamento desfeito: ${p.description} (${why})`.slice(0, 200),
      });
    } catch (error) {
      // The drawer refused: the bill stays paid as it was
      await prisma.payable.update({
        where: { id: p.id },
        data: { status: 'PAID', paidAt: p.paidAt, paidMethod: p.paidMethod, paidFrom: p.paidFrom, paidById: p.paidById, cashEntryId: p.cashEntryId },
      });
      throw error;
    }
  }
  await recordAudit(member, { action: 'UPDATE', entityType: 'Payable', entityId: p.id, changes: { undone: why, from: p.paidFrom } });
  return { ok: true as const };
}

/**
 * A utility bill with a due date is a bill to pay (spec 2026-10-18 §5): its payable is created or follows it while
 * still open; a paid one keeps its values. Without a due date an open payable is canceled, a paid one stays.
 */
const DUE_REMOVED = 'Vencimento removido na conta de consumo';

export async function syncUtilityPayable(restaurantId: string, billId: string, userId: string) {
  const bill = await prisma.utilityBill.findFirst({ where: { id: billId, restaurantId }, include: { account: { select: { name: true } } } });
  if (!bill) return;
  const existing = await prisma.payable.findUnique({ where: { utilityBillId: bill.id } });
  if (!bill.dueDate) {
    if (existing?.status === 'OPEN') {
      await prisma.payable.update({
        where: { id: existing.id },
        data: { status: 'CANCELED', canceledAt: new Date(), canceledById: userId, cancelReason: DUE_REMOVED },
      });
    }
    return;
  }
  const values = {
    description: `${bill.account.name} ${monthLabel(monthOf(bill.referenceMonth))}`.slice(0, 120),
    amountCents: bill.amountCents,
    competenceMonth: bill.referenceMonth,
    dueDate: bill.dueDate,
  };
  if (!existing) {
    await prisma.payable.create({ data: { restaurantId, category: 'UTILITIES', source: 'UTILITY', utilityBillId: bill.id, createdById: userId, ...values } });
    return;
  }
  // Paid ones keep their values; one the owner canceled in Contas a pagar stays canceled
  if (existing.status === 'PAID') return;
  if (existing.status === 'CANCELED' && existing.cancelReason !== DUE_REMOVED) return;
  const { description: _name, ...money } = values; // a name edited in Contas a pagar stays
  await prisma.payable.update({
    where: { id: existing.id },
    // Canceled only because the due date was cleared: it comes back with the date
    data: { ...money, status: 'OPEN', canceledAt: null, canceledById: null, cancelReason: null, updatedById: userId },
  });
}

/**
 * The boletos of an imported purchase NF-e become merchandise bills (spec 2026-10-18 §5, Business). The same note
 * imported again never creates a second bill: (restaurantId, nfeKey, nfeDupNumber) is unique.
 */
export async function createFromNfe(restaurantId: string, userId: string, parsed: NfeDuplicatas): Promise<{ created: number; skipped: number } | { refused: 'business' }> {
  if (!parsed.duplicatas.length) return { created: 0, skipped: 0 };
  if (!(await payableFeatures(restaurantId)).nfe) return { refused: 'business' };
  const digits = (v: string | null) => (v ?? '').replace(/\D/g, '');
  const suppliers = parsed.cnpj ? await prisma.supplier.findMany({ where: { restaurantId, cnpj: { not: null } }, select: { id: true, cnpj: true } }) : [];
  const supplierId = suppliers.find((s) => digits(s.cnpj) === digits(parsed.cnpj))?.id ?? null;
  // Without an access key the note number and the supplier keep the import from duplicating; a note without
  // either is told apart by its own content, so two unrelated notes never block each other
  const key = parsed.key
    ?? (parsed.nNF && digits(parsed.cnpj)
      ? `NF${parsed.nNF}-${digits(parsed.cnpj)}`
      : `SEMCHAVE-${crypto.createHash('sha256').update(JSON.stringify([parsed.emitente, parsed.duplicatas])).digest('hex').slice(0, 32)}`);
  let created = 0;
  let skipped = 0;
  for (const dup of parsed.duplicatas) {
    try {
      await prisma.payable.create({
        data: {
          restaurantId, category: 'MERCHANDISE', source: 'NFE', supplierId, createdById: userId,
          description: `NF ${parsed.nNF} - ${parsed.emitente} ${dup.nDup}`.slice(0, 120),
          amountCents: dup.amountCents, dueDate: dayDate(dup.dueDate), competenceMonth: monthDate(dup.dueDate.slice(0, 7)),
          nfeKey: key, nfeDupNumber: dup.nDup,
        },
      });
      created++;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') skipped++;
      else throw error;
    }
  }
  return { created, skipped };
}

export async function stopSeries(member: RestaurantMember, seriesId: string) {
  const s = await prisma.payableSeries.findFirst({ where: { id: seriesId, restaurantId: member.restaurantId } });
  if (!s) throw new PayableError('Repetição não encontrada', 404);
  await prisma.payableSeries.update({ where: { id: s.id }, data: { active: false } });
  await recordAudit(member, { action: 'UPDATE', entityType: 'PayableSeries', entityId: s.id, changes: { active: false } });
  return { ok: true as const };
}

export { addMonths, money as formatMoney };
