/**
 * Cupons de desconto (spec 2026-11-08 cupons): pure rules shared by the admin screen, the delivery site and the
 * server. Money in cents.
 */
export type CouponKind = 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';
export const KINDS: CouponKind[] = ['PERCENT', 'FIXED', 'FREE_DELIVERY'];

export interface CouponRules {
  code: string;
  kind: CouponKind;
  value: number;
  minOrderCents: number;
  validFrom: Date | null;
  validUntil: Date | null;
  maxUses: number | null;
  maxPerCustomer: number | null;
  firstOrderOnly: boolean;
  active: boolean;
  usedCount: number;
}

/** "primeira 10" -> "PRIMEIRA10"; accents and symbols out */
export const normalizeCode = (raw: unknown) =>
  typeof raw === 'string' ? raw.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';

export const codeOk = (code: string) => /^[A-Z0-9]{3,20}$/.test(code);

/** What the screen sends to create a coupon, validated */
export function parseCouponInput(raw: any): { ok: true; value: Omit<CouponRules, 'active' | 'usedCount'> } | { ok: false; error: string } {
  const code = normalizeCode(raw?.code);
  if (!codeOk(code)) return { ok: false, error: 'O código tem de 3 a 20 letras ou números.' };
  const kind = raw?.kind as CouponKind;
  if (!KINDS.includes(kind)) return { ok: false, error: 'Escolha o tipo de desconto.' };
  let value = 0;
  if (kind === 'PERCENT') {
    value = Number(raw?.value);
    if (!Number.isInteger(value) || value < 1 || value > 100) return { ok: false, error: 'A porcentagem vai de 1 a 100.' };
  } else if (kind === 'FIXED') {
    value = Number(raw?.value);
    if (!Number.isInteger(value) || value < 1 || value > 10_000_00) return { ok: false, error: 'O valor do desconto vai de R$ 0,01 a R$ 10.000.' };
  }
  const minOrderCents = raw?.minOrderCents === undefined || raw?.minOrderCents === null ? 0 : Number(raw.minOrderCents);
  if (!Number.isInteger(minOrderCents) || minOrderCents < 0 || minOrderCents > 100_000_00) return { ok: false, error: 'Pedido mínimo inválido.' };
  const date = (v: unknown) => {
    if (v === undefined || v === null || v === '') return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const validFrom = date(raw?.validFrom);
  const validUntil = date(raw?.validUntil);
  if (validFrom === undefined || validUntil === undefined) return { ok: false, error: 'Data de validade inválida.' };
  if (validFrom && validUntil && validUntil <= validFrom) return { ok: false, error: 'O fim da validade vem depois do início.' };
  const limit = (v: unknown, what: string): number | null | string => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : `${what} inválido.`;
  };
  const maxUses = limit(raw?.maxUses, 'Limite de usos');
  if (typeof maxUses === 'string') return { ok: false, error: maxUses };
  const maxPerCustomer = raw?.maxPerCustomer === undefined ? 1 : limit(raw?.maxPerCustomer, 'Limite por cliente');
  if (typeof maxPerCustomer === 'string') return { ok: false, error: maxPerCustomer };
  return { ok: true, value: { code, kind, value, minOrderCents, validFrom, validUntil, maxUses, maxPerCustomer, firstOrderOnly: raw?.firstOrderOnly === true } };
}

/** The discount of a coupon on an order; never more than the subtotal (or the delivery fee, for free delivery) */
export function discountFor(c: Pick<CouponRules, 'kind' | 'value'>, subtotalCents: number, deliveryFeeCents: number): number {
  if (c.kind === 'FREE_DELIVERY') return Math.max(0, deliveryFeeCents);
  if (c.kind === 'PERCENT') return Math.min(subtotalCents, Math.round((subtotalCents * c.value) / 100));
  return Math.min(subtotalCents, c.value);
}

/** Why a coupon cannot be used on this order now (the customer reads it), or null. Counts come from the database. */
export function refusal(
  c: CouponRules,
  o: { subtotalCents: number; deliveryFeeCents: number; now: Date; usesByCustomer: number; customerOrdered: boolean },
): string | null {
  if (!c.active) return 'Este cupom não está ativo.';
  if (c.validFrom && o.now < c.validFrom) return 'Este cupom ainda não começou a valer.';
  if (c.validUntil && o.now > c.validUntil) return 'Este cupom venceu.';
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return 'Este cupom já foi usado o número máximo de vezes.';
  if (c.maxPerCustomer !== null && o.usesByCustomer >= c.maxPerCustomer) return 'Você já usou este cupom.';
  if (c.firstOrderOnly && o.customerOrdered) return 'Este cupom é só para o primeiro pedido.';
  if (o.subtotalCents < c.minOrderCents) return `Este cupom vale para pedidos a partir de ${(c.minOrderCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`;
  if (c.kind === 'FREE_DELIVERY' && o.deliveryFeeCents <= 0) return 'Este cupom é de entrega grátis e o pedido não tem taxa de entrega.';
  return null;
}

/** "10% de desconto", "R$ 5,00 de desconto", "Entrega grátis" */
export function couponLabel(c: Pick<CouponRules, 'kind' | 'value'>): string {
  if (c.kind === 'FREE_DELIVERY') return 'Entrega grátis';
  if (c.kind === 'PERCENT') return `${c.value}% de desconto`;
  return `${(c.value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de desconto`;
}
