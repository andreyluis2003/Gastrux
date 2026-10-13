import { prisma } from '@/lib/prisma';

export type FirstStepKey = 'caixa' | 'venda' | 'cardapio' | 'endereco' | 'nfce';
export interface FirstStep { key: FirstStepKey; label: string; href: string; done: boolean }

/** An item created this long after the account is the owner's own (the example menu comes with the sign-up) */
const OWN_ITEM_AFTER_MS = 10 * 60_000;

/**
 * Primeiros passos of a new account, each one done by what the restaurant actually did. The home used
 * to show stock and CMV cards to an account that had not sold yet, with no way to the sale screen
 * (usability walkthrough 2026-10-12).
 */
export async function firstSteps(restaurantId: string): Promise<FirstStep[]> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { createdAt: true, address: true } });
  const since = new Date((restaurant?.createdAt ?? new Date()).getTime() + OWN_ITEM_AFTER_MS);
  const [shifts, sales, ownItems, anyItem, example, fiscal] = await Promise.all([
    prisma.cashSession.count({ where: { restaurantId } }),
    prisma.orderSession.count({ where: { restaurantId, status: 'CLOSED' } }),
    prisma.menuItem.count({ where: { restaurantId, createdAt: { gt: since } } }),
    prisma.menuItem.count({ where: { restaurantId } }),
    // Started from the example menu (its recipes are DEMO-): only an item added later is the owner's own
    prisma.recipe.count({ where: { restaurantId, code: { startsWith: 'DEMO-' } } }),
    prisma.nFeConfig.count({ where: { restaurantId, active: true, nfeApiKey: { not: '' } } }),
  ]);
  return [
    { key: 'caixa', label: 'Abrir o caixa', href: '/vender', done: shifts > 0 },
    { key: 'venda', label: 'Fazer a primeira venda', href: '/vender', done: sales > 0 },
    { key: 'cardapio', label: 'Cadastrar seus produtos e preços', href: '/admin/cardapio', done: example > 0 ? ownItems > 0 : anyItem > 0 },
    { key: 'endereco', label: 'Completar o endereço', href: '/admin/settings', done: !!restaurant?.address },
    { key: 'nfce', label: 'Configurar a nota fiscal (NFC-e)', href: '/admin/fiscal', done: fiscal > 0 },
  ];
}
