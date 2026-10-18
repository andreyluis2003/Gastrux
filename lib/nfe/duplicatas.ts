/**
 * The boletos (duplicatas, <cobr><dup>) of a purchase NF-e XML (spec 2026-10-18 contas a pagar §5). Pure and
 * dependency-free: the import route and the import screen (in the browser) read the same thing.
 */
export interface NfeDuplicatas {
  key: string | null;
  nNF: string;
  emitente: string;
  cnpj: string;
  duplicatas: Array<{ nDup: string; dueDate: string; amountCents: number }>;
}

const tag = (name: string, src: string): string => {
  const m = src.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`));
  return m ? m[1].trim() : '';
};

export function parseDuplicatas(xml: string): NfeDuplicatas {
  const keyMatch = xml.match(/<infNFe[^>]*\bId="NFe(\d{44})"/);
  const emit = xml.split('</emit>')[0] || xml;
  const duplicatas: NfeDuplicatas['duplicatas'] = [];
  for (const m of xml.matchAll(/<dup>([\s\S]*?)<\/dup>/g)) {
    const block = m[1];
    const dueDate = tag('dVenc', block);
    const value = Number(tag('vDup', block));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(value) || value <= 0) continue;
    duplicatas.push({ nDup: tag('nDup', block) || String(duplicatas.length + 1), dueDate, amountCents: Math.round(value * 100) });
  }
  return { key: keyMatch ? keyMatch[1] : null, nNF: tag('nNF', xml), emitente: tag('xNome', emit), cnpj: tag('CNPJ', emit), duplicatas };
}
