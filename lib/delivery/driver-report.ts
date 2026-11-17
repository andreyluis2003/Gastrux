import { prisma } from '@/lib/prisma';
import { CashRuleError } from '@/lib/caixa/rules';
import { normalizeDriverName } from '@/lib/caixa/driver-settlement';
import { comandaWhere, orderWhere, workDayOf } from '@/lib/delivery/driver-pay';

/**
 * Report of the drivers by period (spec 2026-11-17 entregadores): deliveries and daily rates by work day,
 * what was paid in the period and what is still to pay. Dates are YYYY-MM-DD in São Paulo.
 */

export interface DriverReportRow {
  /** The driver's id, or 'name:' + the typed name in lower case */
  key: string;
  driverName: string;
  /** null = a typed name without a registration */
  active: boolean | null;
  deliveries: number;
  dailies: number;
  paidCents: number;
  /** Deliveries of the period not paid to the driver yet */
  unpaidDeliveries: number;
}

const DAY = 86400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 20000;

/** The date in São Paulo of an instant (workDayOf turns the day at 05:00, so add the 5 h back) */
const dateOf = (d: Date) => workDayOf(new Date(d.getTime() + 5 * 3600_000));

export function validPeriod(from: unknown, to: unknown): { from: string; to: string } {
  if (typeof from !== 'string' || typeof to !== 'string' || !DATE_RE.test(from) || !DATE_RE.test(to) || Number.isNaN(Date.parse(`${from}T00:00:00Z`)) || Number.isNaN(Date.parse(`${to}T00:00:00Z`))) {
    throw new CashRuleError('Período inválido');
  }
  if (from > to) throw new CashRuleError('A data inicial deve vir antes da final');
  if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * DAY) throw new CashRuleError('Escolha um período de até 1 ano');
  return { from, to };
}

export async function driverReport(restaurantId: string, from: string, to: string): Promise<DriverReportRow[]> {
  validPeriod(from, to);
  // Wide window in UTC (São Paulo is UTC-3, the day turns at 05:00); the exact filter is by date below
  const lo = new Date(Date.parse(`${from}T00:00:00Z`) - DAY);
  const hi = new Date(Date.parse(`${to}T00:00:00Z`) + 2 * DAY);
  const inWindow = { gte: lo, lt: hi };

  const [orders, comandas, payments, paidDays, drivers] = await Promise.all([
    prisma.externalOrder.findMany({
      where: { ...orderWhere(restaurantId, null, undefined, true), dispatchedAt: inWindow },
      select: { driverId: true, driverName: true, dispatchedAt: true, driverPaymentId: true },
      take: LIMIT,
    }),
    prisma.orderSession.findMany({
      where: { ...comandaWhere(restaurantId, null, undefined, true), dispatchedAt: inWindow },
      select: { driverId: true, driverName: true, dispatchedAt: true, driverPaymentId: true },
      take: LIMIT,
    }),
    prisma.driverPayment.findMany({
      where: { restaurantId, createdAt: inWindow },
      select: { driverId: true, driverName: true, paidCents: true, createdAt: true },
      take: LIMIT,
    }),
    prisma.driverPaidDay.findMany({
      where: { workDay: { gte: from, lte: to }, driver: { restaurantId } },
      select: { driverId: true },
      take: LIMIT,
    }),
    prisma.driver.findMany({ where: { restaurantId }, select: { id: true, name: true, active: true } }),
  ]);

  const registered = new Map(drivers.map((d) => [d.id, d]));
  const rows = new Map<string, DriverReportRow & { seenAt: number }>();
  const rowOf = (driverId: string | null, driverName: string | null, at: Date) => {
    const reg = driverId ? registered.get(driverId) : undefined;
    const typed = reg ? null : normalizeDriverName(driverName);
    if (!reg && !typed) return null;
    const key = reg ? reg.id : `name:${typed!.toLowerCase()}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, driverName: reg ? reg.name : typed!, active: reg ? reg.active : null, deliveries: 0, dailies: 0, paidCents: 0, unpaidDeliveries: 0, seenAt: 0 };
      rows.set(key, row);
    }
    // A typed name shows its most recent spelling
    if (!reg && at.getTime() >= row.seenAt) { row.seenAt = at.getTime(); row.driverName = typed!; }
    return row;
  };

  for (const d of [...orders, ...comandas]) {
    const day = workDayOf(d.dispatchedAt!);
    if (day < from || day > to) continue;
    const row = rowOf(d.driverId, d.driverName, d.dispatchedAt!);
    if (!row) continue;
    row.deliveries += 1;
    if (!d.driverPaymentId) row.unpaidDeliveries += 1;
  }
  for (const p of payments) {
    const day = dateOf(p.createdAt);
    if (day < from || day > to) continue;
    const row = rowOf(p.driverId, p.driverName, p.createdAt);
    if (row) row.paidCents += p.paidCents;
  }
  for (const p of paidDays) {
    const row = rowOf(p.driverId, null, new Date(0));
    if (row) row.dailies += 1;
  }

  return [...rows.values()]
    .map(({ seenAt: _seenAt, ...row }) => row)
    .sort((a, b) => a.driverName.localeCompare(b.driverName, 'pt-BR'));
}
