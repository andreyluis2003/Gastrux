/**
 * What Equipe e acessos may change about a staff member's pay (2026-10-23): the commission rule of
 * lib/staff/commission-rules.ts, the base salary (DRE estimate when no payroll is launched) and the default
 * hours. Pure, unit-tested in __tests__/unit/staff-pay.test.ts. Fields left out are not changed.
 */
export interface StaffPayInput {
  commissionType?: unknown;
  commissionValue?: unknown;
  baseSalary?: unknown;
  defaultStartTime?: unknown;
  defaultEndTime?: unknown;
}

export interface StaffPayData {
  commissionType?: 'PERCENTAGE' | 'FIXED';
  commissionValue?: number | null;
  basesalary?: number | null;
  defaultStartTime?: string;
  defaultEndTime?: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "5", "2,50", 2.5 -> number; "" and null -> null; anything else -> NaN */
function amount(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+([.,]\d{1,2})?$/.test(v.trim())) return Number(v.trim().replace(',', '.'));
  return NaN;
}

export function parseStaffPay(body: StaffPayInput): { ok: true; data: StaffPayData } | { ok: false; error: string } {
  const data: StaffPayData = {};

  if (body.commissionType !== undefined) {
    if (body.commissionType !== 'PERCENTAGE' && body.commissionType !== 'FIXED') {
      return { ok: false, error: 'Tipo de comissão inválido: use % das vendas ou R$ por conta fechada' };
    }
    data.commissionType = body.commissionType;
  }

  // The value means a % or R$ only with its type, so they come together
  if ((body.commissionValue !== undefined) !== (body.commissionType !== undefined)) {
    return { ok: false, error: 'Informe o tipo e o valor da comissão juntos' };
  }
  if (body.commissionValue !== undefined) {
    const v = amount(body.commissionValue);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return { ok: false, error: 'Valor da comissão inválido' };
    if (data.commissionType === 'PERCENTAGE' && v !== null && v > 100) return { ok: false, error: 'A comissão em % vai de 0 a 100' };
    data.commissionValue = v;
  }

  if (body.baseSalary !== undefined) {
    const v = amount(body.baseSalary);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return { ok: false, error: 'Salário inválido' };
    data.basesalary = v;
  }

  for (const key of ['defaultStartTime', 'defaultEndTime'] as const) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !TIME.test(v)) return { ok: false, error: 'Horário inválido (use HH:MM)' };
    data[key] = v;
  }

  if (Object.keys(data).length === 0) return { ok: false, error: 'Nada para mudar' };
  return { ok: true, data };
}
