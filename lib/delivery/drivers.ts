import type { Driver, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CashRuleError, parseCountedCents } from '@/lib/caixa/rules';
import { normalizeDriverName } from '@/lib/caixa/driver-settlement';
import { normalizePhone } from '@/lib/cashback/rules';

/**
 * Cadastro de entregadores (spec docs/superpowers/specs/2026-11-17-entregadores-taxa-fixa-design.md): name, phone,
 * a daily rate and a per-delivery rate. Never deleted, only deactivated; the name is unique among the active ones of
 * the restaurant (rule 9, checked here: no partial index). Values come from the screen in reais ("8,50").
 */

export interface DriverInput {
  name?: unknown;
  phone?: unknown;
  dailyRate?: unknown;
  perDelivery?: unknown;
  active?: unknown;
}

const DUPLICATE = 'Já existe um entregador ativo com esse nome';

export async function listDrivers(restaurantId: string, opts: { includeInactive?: boolean } = {}): Promise<Driver[]> {
  return prisma.driver.findMany({
    where: { restaurantId, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
}

function parseName(value: unknown): string {
  const name = normalizeDriverName(value);
  if (!name) throw new CashRuleError('Informe o nome do entregador');
  return name;
}

/** Optional phone: empty = none; otherwise DDD + number, stored as digits */
function parsePhone(value: unknown): string | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const phone = normalizePhone(value);
  if (!phone) throw new CashRuleError('Celular inválido: use DDD e número');
  return phone;
}

/** Empty = 0; otherwise reais with up to 2 decimals, as the cash register reads them */
function parseRate(value: unknown, field: string): number {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  return parseCountedCents(value, field);
}

/** Refuses a second active driver with the same name (case and accents as typed, case-insensitive) */
async function assertNameFree(restaurantId: string, name: string, exceptId?: string) {
  const clash = await prisma.driver.findFirst({
    where: { restaurantId, active: true, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new CashRuleError(DUPLICATE, 409);
}

export async function createDriver(restaurantId: string, input: DriverInput): Promise<Driver> {
  const name = parseName(input.name);
  const data = {
    restaurantId,
    name,
    phone: parsePhone(input.phone),
    dailyRateCents: parseRate(input.dailyRate, 'Diária'),
    perDeliveryCents: parseRate(input.perDelivery, 'Valor por entrega'),
  };
  await assertNameFree(restaurantId, name);
  return prisma.driver.create({ data });
}

/** Partial edit; a driver of another restaurant is "not found" (404) */
export async function updateDriver(restaurantId: string, id: string, input: DriverInput): Promise<Driver> {
  const driver = await prisma.driver.findFirst({ where: { id, restaurantId } });
  if (!driver) throw new CashRuleError('Entregador não encontrado', 404);
  const data: Prisma.DriverUpdateInput = {};
  if (input.name !== undefined) data.name = parseName(input.name);
  if (input.phone !== undefined) data.phone = parsePhone(input.phone);
  if (input.dailyRate !== undefined) data.dailyRateCents = parseRate(input.dailyRate, 'Diária');
  if (input.perDelivery !== undefined) data.perDeliveryCents = parseRate(input.perDelivery, 'Valor por entrega');
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new CashRuleError('Ativo: use sim ou não');
    data.active = input.active;
  }
  const name = (data.name as string | undefined) ?? driver.name;
  const active = (data.active as boolean | undefined) ?? driver.active;
  // Only when it ends up active under a name that changed, or comes back to active
  if (active && (name !== driver.name || !driver.active)) await assertNameFree(restaurantId, name, driver.id);
  return prisma.driver.update({ where: { id: driver.id }, data });
}
