/**
 * Questions the chat offers before the first message: by screen for the owner and the manager, by role for the cook
 * and the cashier, who must never be offered a question the AI will refuse them (prod check 2026-10-17: a cook saw
 * "Quanto vendi ontem?").
 */
const BY_PATH: Array<[string, string[]]> = [
  ['/contagem-do-dia', ['Qual espeto mais faltou esta semana?', 'Quantos espetos de frango vendi ontem?', 'Como fecho a contagem?']],
  ['/caixa', ['Quanto vendi hoje no caixa?', 'Quais despesas saíram hoje?', 'Como faço uma sangria?']],
  ['/vender', ['Quais mesas estão abertas há mais tempo?', 'Quanto tem em aberto nas mesas?', 'Como transfiro itens entre mesas?']],
  ['/dashboard/financeiro', ['Como está meu resultado este mês?', 'Quanto gastei de energia no mês passado?', 'Qual meu CMV em setembro?']],
  ['/etiquetas', ['O que vence hoje?', 'Como imprimo uma etiqueta?', 'Validades estão no meu plano?']],
  ['/receitas', ['Qual a margem do meu item mais vendido?', 'Como cadastro uma ficha técnica?', 'Quais insumos estão abaixo do mínimo?']],
];
const DEFAULT = ['Quanto vendi ontem?', 'Quais itens mais vendem este mês?', 'O que tem no meu plano?'];
const BY_ROLE: Record<string, string[]> = {
  COOK: ['Como marco um pedido como pronto na cozinha?', 'Quais insumos estão com estoque baixo?', 'O que vence hoje?'],
  CASHIER: ['Como faço uma sangria?', 'Como divido a conta de uma mesa?', 'Como transfiro itens entre mesas?'],
};

export function suggestionsFor(path: string, role?: string | null): string[] {
  if (role && BY_ROLE[role]) return BY_ROLE[role];
  return BY_PATH.find(([p]) => path.startsWith(p))?.[1] ?? DEFAULT;
}
