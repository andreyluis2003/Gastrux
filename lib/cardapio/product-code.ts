/**
 * The product code other systems send in the Gastrux order API (plan 2026-10-23 api-de-pedidos): optional, unique in
 * the restaurant, kept in capitals so "esp-a" and "ESP-A" are the same code.
 */
export type ProductCodeResult = { ok: true; code: string | null | undefined } | { ok: false; error: string };

export function parseProductCode(v: unknown): ProductCodeResult {
  if (v === undefined) return { ok: true, code: undefined };
  if (v === null || (typeof v === 'string' && !v.trim())) return { ok: true, code: null };
  if (typeof v !== 'string') return { ok: false, error: 'Código do produto inválido' };
  const code = v.trim().toUpperCase();
  if (code.length > 40 || !/^[A-Z0-9._-]+$/.test(code)) return { ok: false, error: 'Use até 40 letras, números, ponto, hífen ou sublinhado no código' };
  return { ok: true, code };
}

export const CODE_TAKEN = 'Este código já é de outro produto';
export const isCodeTaken = (e: any) => e?.code === 'P2002' && String(e?.meta?.target ?? '').includes('code');
