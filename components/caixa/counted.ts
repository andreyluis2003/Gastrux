/** The blind close fields (spec §8.2): Portuguese input ("1.234,50", empty = 0) -> amounts the API accepts. */

export type CountKey = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'outros';

export const COUNT_FIELDS: Array<{ key: CountKey; label: string }> = [
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'pix', label: 'PIX' },
  { key: 'credito', label: 'Cartão de crédito' },
  { key: 'debito', label: 'Cartão de débito' },
  { key: 'outros', label: 'Outros' },
];

export function buildCountedPayload(fields: Record<CountKey, string>) {
  const counted: Record<string, string> = {};
  const invalid: string[] = [];
  for (const { key, label } of COUNT_FIELDS) {
    let t = (fields[key] ?? '').trim();
    if (!t) {
      counted[key] = '0.00';
      continue;
    }
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) {
      invalid.push(label);
      continue;
    }
    counted[key] = (Math.round(Number(t) * 100) / 100).toFixed(2);
  }
  return { counted, invalid };
}
