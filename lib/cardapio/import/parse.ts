/**
 * Reads a menu out of another ordering platform's store page (spec 2026-11-06 importar-cardapio-por-link).
 * Pure: the HTML comes in, the menu comes out, nothing is written. Two readers: the Zé Pediu store data
 * (window.__INITIAL_DATA__ with catalogo.categorias) and the schema.org Menu in JSON-LD.
 */

export interface ImportedItem {
  /** The id in the source page, so the screen keeps track of what is ticked */
  ref: string;
  nome: string;
  descricao: string;
  preco: number;
  foto: string | null;
  codigo: string | null;
  disponivel: boolean;
}
export interface ImportedCategory { nome: string; itens: ImportedItem[] }
export interface ImportedAddon { grupo: string; nome: string; preco: number }
export interface ImportedMenu {
  fonte: 'zepediu' | 'schema';
  loja: string | null;
  categorias: ImportedCategory[];
  adicionais: ImportedAddon[];
  /** What the Gastrux cannot keep (required groups, "escolha até N") */
  avisos: string[];
}

export type ParseResult = { ok: true; menu: ImportedMenu } | { ok: false; error: string };

export const MAX_ITEMS = 300;

/** Pages that block or hide their menu: the owner goes to the photo import instead */
export const PHOTO_HINT = 'Mande um print ou o PDF do cardápio para a IA (botão Pergunte ao Gastrux) que ela monta o cardápio para você.';

export function blockedSourceMessage(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host === 'ifood.com.br' || host.endsWith('.ifood.com.br')) {
    return `O iFood não deixa outros sistemas lerem o cardápio pelo link. ${PHOTO_HINT}`;
  }
  if (host.endsWith('anota.ai')) return `O Anota AI não deixa outros sistemas lerem o cardápio pelo link. ${PHOTO_HINT}`;
  return null;
}

const BS = String.fromCharCode(92);

/** The JSON object that starts right after `marker` (string-aware brace matching), or null */
export function jsonAfter(html: string, marker: string): unknown {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let k = start; k < html.length; k++) {
    const c = html[k];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === BS) escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, k + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const price = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 99999) return null;
  return Math.round(n * 100) / 100;
};
const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 1000) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
};
const values = (v: unknown): any[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const byOrder = (a: any, b: any) => (Number(a?.ordem) || 0) - (Number(b?.ordem) || 0);

/** Zé Pediu (LigaFiles "alloy" store): window.__INITIAL_DATA__.catalogo.categorias */
export function parseZePediu(html: string): ImportedMenu | null {
  const data = jsonAfter(html, 'window.__INITIAL_DATA__') as any;
  const cats = data?.catalogo?.categorias;
  if (!cats || typeof cats !== 'object') return null;
  const categorias: ImportedCategory[] = [];
  const addons = new Map<string, ImportedAddon>();
  let required = 0;
  let limited = 0;
  for (const c of values(cats).sort(byOrder)) {
    const nome = text(c?.nome, 120);
    if (!nome) continue;
    const itens: ImportedItem[] = [];
    for (const i of values(c?.itens).sort(byOrder)) {
      const n = text(i?.nome, 120);
      const p = price(i?.preco);
      if (!n || p === null) continue;
      itens.push({
        ref: String(i?.id ?? `${nome}-${n}`),
        nome: n,
        descricao: text(i?.descricao, 500),
        preco: p,
        foto: httpsUrl(i?.foto_principal),
        codigo: text(i?.cod_pdv, 60) || null,
        disponivel: i?.status === undefined || i?.status === 'disponivel',
      });
      for (const g of values(i?.categorias_complementos)) {
        const grupo = text(g?.nome, 80);
        if (!grupo) continue;
        if (g?.obrigatorio) required++;
        if (Number(g?.qtd_maxima) > 1) limited++;
        for (const o of values(g?.complementos)) {
          const on = text(o?.nome, 120);
          if (!on) continue;
          const key = `${grupo.toLowerCase()}|${on.toLowerCase()}`;
          if (!addons.has(key)) addons.set(key, { grupo, nome: on, preco: price(o?.preco) ?? 0 });
        }
      }
    }
    if (itens.length) categorias.push({ nome, itens });
  }
  if (!categorias.length) return null;
  const avisos: string[] = [];
  if (required) avisos.push('Escolhas obrigatórias (como "Escolha sua carne") entram como adicionais comuns: o Gastrux não obriga a escolher.');
  if (limited) avisos.push('Limites como "escolha até 3" não passam para o Gastrux.');
  if (addons.size) avisos.push('Os adicionais entram na lista de Adicionais do restaurante, agrupados pelo nome do grupo, sem ligação com cada produto.');
  return { fonte: 'zepediu', loja: text(data?.loja?.nome_fantasia, 120) || null, categorias, adicionais: [...addons.values()], avisos };
}

/** schema.org Menu in JSON-LD: hasMenuSection[].hasMenuItem[] with offers.price */
export function parseSchemaMenu(html: string): ImportedMenu | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const nodes: any[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      nodes.push(v);
      if (v['@graph']) walk(v['@graph']);
      if (v.hasMenu && typeof v.hasMenu === 'object') walk(v.hasMenu);
    }
  };
  for (const b of blocks) {
    try {
      walk(JSON.parse(b));
    } catch {
      /* a broken block is skipped */
    }
  }
  const menu = nodes.find((n) => n?.['@type'] === 'Menu' && n.hasMenuSection);
  if (!menu) return null;
  const categorias: ImportedCategory[] = [];
  let k = 0;
  for (const s of values(menu.hasMenuSection)) {
    const nome = text(s?.name, 120);
    if (!nome) continue;
    const itens: ImportedItem[] = [];
    for (const i of values(s?.hasMenuItem)) {
      const n = text(i?.name, 120);
      const offer = Array.isArray(i?.offers) ? i.offers[0] : i?.offers;
      const p = price(offer?.price);
      if (!n || p === null) continue;
      const img = Array.isArray(i?.image) ? i.image[0] : i?.image;
      itens.push({ ref: `s${k++}`, nome: n, descricao: text(i?.description, 500), preco: p, foto: httpsUrl(typeof img === 'object' ? img?.url : img), codigo: null, disponivel: true });
    }
    if (itens.length) categorias.push({ nome, itens });
  }
  if (!categorias.length) return null;
  return { fonte: 'schema', loja: text(menu.name, 120) || null, categorias, adicionais: [], avisos: [] };
}

export function parseMenuPage(html: string): ParseResult {
  const menu = parseZePediu(html) ?? parseSchemaMenu(html);
  if (!menu) return { ok: false, error: `Não encontramos um cardápio que dê para ler nesta página. ${PHOTO_HINT}` };
  let n = 0;
  for (const c of menu.categorias) {
    if (n + c.itens.length > MAX_ITEMS) c.itens = c.itens.slice(0, Math.max(0, MAX_ITEMS - n));
    n += c.itens.length;
  }
  menu.categorias = menu.categorias.filter((c) => c.itens.length);
  return { ok: true, menu };
}
