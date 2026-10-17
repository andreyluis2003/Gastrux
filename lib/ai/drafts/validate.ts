/** Draft payloads of the AI and of the review screen (spec 2026-10-17 ia-implantacao §4.2, §4.5): same checks for both */
export type MenuPayload = { categorias: { nome: string; itens: { nome: string; descricao: string; preco: number }[] }[]; incompleto: boolean };
export type TablesPayload = { quantidade: number; inicio: number; area: string; lugares: number };
export type Papel = 'GERENTE' | 'CAIXA' | 'COZINHA';
export type StaffPayload = { pessoas: { nome: string; email: string; papel: Papel }[] };
/** Waiter = CASHIER: there is no waiter role (owner decision 2026-10-17) */
export const PAPEL_ROLE: Record<Papel, 'MANAGER' | 'CASHIER' | 'COOK'> = { GERENTE: 'MANAGER', CAIXA: 'CASHIER', COZINHA: 'COOK' };
type R<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const nameOk = (s: string) => s.length >= 1 && s.length <= 120;
const intIn = (v: unknown, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "32,90", "R$ 1.234,50", "32.90" or a number; 0.01 to 99999 reais */
export function parsePrice(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const s = v.replace(/R\$\s*/i, '').trim();
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(s)) return null;
    const thousandsOnly = /^\d{1,3}(\.\d{3})+$/.test(s);
    n = Number(s.includes(',') || thousandsOnly ? s.replace(/\./g, '').replace(',', '.') : s);
  } else return null;
  if (!Number.isFinite(n) || n < 0.01 || n > 99999) return null;
  return Math.round(n * 100) / 100;
}

export function validateMenu(raw: any): R<MenuPayload> {
  if (!raw || !Array.isArray(raw.categorias)) return { ok: false, error: 'Cardápio vazio' };
  const categorias: MenuPayload['categorias'] = [];
  let n = 0;
  for (const c of raw.categorias) {
    const nome = str(c?.nome);
    const itens = Array.isArray(c?.itens) ? c.itens : [];
    if (!itens.length) continue;
    if (!nameOk(nome)) return { ok: false, error: `Categoria "${nome || 'sem nome'}": nome inválido` };
    const out: MenuPayload['categorias'][number]['itens'] = [];
    for (const i of itens) {
      n++;
      const iname = str(i?.nome);
      if (!nameOk(iname)) return { ok: false, error: `Item ${n}: nome inválido` };
      const preco = parsePrice(i?.preco);
      if (preco === null) return { ok: false, error: `Item ${n} ("${iname}"): preço inválido` };
      out.push({ nome: iname, descricao: str(i?.descricao).slice(0, 500), preco });
    }
    categorias.push({ nome, itens: out });
  }
  if (n === 0) return { ok: false, error: 'Cardápio vazio' };
  if (n > 300) return { ok: false, error: 'No máximo 300 itens por vez' };
  return { ok: true, value: { categorias, incompleto: raw.incompleto === true } };
}

export function validateTables(raw: any): R<TablesPayload> {
  const quantidade = intIn(raw?.quantidade, 1, 200), inicio = intIn(raw?.inicio, 1, 9999), lugares = intIn(raw?.lugares, 1, 50);
  const area = str(raw?.area);
  if (quantidade === null) return { ok: false, error: 'Quantidade de mesas entre 1 e 200' };
  if (inicio === null || inicio + quantidade - 1 > 9999) return { ok: false, error: 'Números de mesa entre 1 e 9999' };
  if (lugares === null) return { ok: false, error: 'Lugares entre 1 e 50' };
  if (!nameOk(area)) return { ok: false, error: 'Área inválida' };
  return { ok: true, value: { quantidade, inicio, area, lugares } };
}

export function validateStaff(raw: any, opts: { requireEmail: boolean }): R<StaffPayload> {
  const list = Array.isArray(raw?.pessoas) ? raw.pessoas : [];
  if (!list.length) return { ok: false, error: 'Nenhuma pessoa' };
  if (list.length > 30) return { ok: false, error: 'No máximo 30 pessoas por vez' };
  const pessoas: StaffPayload['pessoas'] = [];
  for (const [i, p] of list.entries()) {
    const nome = str(p?.nome), email = str(p?.email).toLowerCase(), papel = p?.papel;
    if (!nameOk(nome)) return { ok: false, error: `Pessoa ${i + 1}: nome inválido` };
    if (typeof papel !== 'string' || !(papel in PAPEL_ROLE)) return { ok: false, error: `Pessoa ${i + 1} ("${nome}"): papel inválido` };
    if ((opts.requireEmail || email) && !EMAIL.test(email)) return { ok: false, error: `Pessoa ${i + 1} ("${nome}"): e-mail inválido` };
    pessoas.push({ nome, email, papel: papel as Papel });
  }
  return { ok: true, value: { pessoas } };
}
