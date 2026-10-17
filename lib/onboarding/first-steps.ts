import { prisma } from '@/lib/prisma';

export type FirstStepKey = 'caixa' | 'venda' | 'cardapio' | 'mesas' | 'equipe' | 'endereco' | 'nfce';
export interface FirstStep { key: FirstStepKey; label: string; href: string; done: boolean; optional?: boolean }

/** An item created this long after the account is the owner's own (the example menu comes with the sign-up) */
const OWN_ITEM_AFTER_MS = 10 * 60_000;

/**
 * Primeiros passos of a new account, each one done by what the restaurant actually did. The home used
 * to show stock and CMV cards to an account that had not sold yet, with no way to the sale screen
 * (usability walkthrough 2026-10-12).
 */
export async function firstSteps(restaurantId: string): Promise<FirstStep[]> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { createdAt: true, address: true, ownerId: true } });
  const since = new Date((restaurant?.createdAt ?? new Date()).getTime() + OWN_ITEM_AFTER_MS);
  const ownerId = restaurant?.ownerId ?? '';
  const [shifts, sales, ownItems, anyItem, example, fiscal, tables, team] = await Promise.all([
    prisma.cashSession.count({ where: { restaurantId } }),
    prisma.orderSession.count({ where: { restaurantId, status: 'CLOSED' } }),
    prisma.menuItem.count({ where: { restaurantId, createdAt: { gt: since } } }),
    prisma.menuItem.count({ where: { restaurantId } }),
    // Started from the example menu (its recipes are DEMO-): only an item added later is the owner's own
    prisma.recipe.count({ where: { restaurantId, code: { startsWith: 'DEMO-' } } }),
    prisma.nFeConfig.count({ where: { restaurantId, active: true, nfeApiKey: { not: '' } } }),
    // The sign-up example comes with two tables described 'Mesa de exemplo' (lib/onboarding/seed-template.ts)
    // (SQL NOT leaves out a NULL description, so the null case is spelled out)
    prisma.table.count({ where: { restaurantId, OR: [{ description: null }, { description: { not: 'Mesa de exemplo' } }] } }),
    prisma.restaurantUser.count({ where: { restaurantId, isActive: true, NOT: { userId: ownerId } } }),
  ]);
  return [
    { key: 'caixa', label: 'Abrir o caixa', href: '/vender', done: shifts > 0 },
    { key: 'venda', label: 'Fazer a primeira venda', href: '/vender', done: sales > 0 },
    { key: 'cardapio', label: 'Cadastrar seus produtos e preços', href: '/admin/cardapio', done: example > 0 ? ownItems > 0 : anyItem > 0 },
    { key: 'mesas', label: 'Cadastrar as mesas', href: '/admin/tables', done: tables > 0 },
    { key: 'equipe', label: 'Cadastrar a equipe', href: '/admin/staff', done: team > 0, optional: true },
    { key: 'endereco', label: 'Completar o endereço', href: '/admin/settings', done: !!restaurant?.address },
    { key: 'nfce', label: 'Configurar a nota fiscal (NFC-e)', href: '/admin/fiscal', done: fiscal > 0 },
  ];
}

export const ONBOARDING_DAYS = 30;

/** Progress for the chat and the AI (spec 2026-10-17 ia-implantacao §3.1-§3.3): required steps only */
export async function onboardingStatus(restaurantId: string, now = new Date()) {
  const [steps, r] = await Promise.all([
    firstSteps(restaurantId),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { createdAt: true } }),
  ]);
  const required = steps.filter((s) => !s.optional);
  const pending = required.find((s) => !s.done) ?? steps.find((s) => !s.done) ?? null;
  const daysSinceSignup = Math.floor((now.getTime() - (r?.createdAt ?? now).getTime()) / 86_400_000);
  return {
    active: daysSinceSignup <= ONBOARDING_DAYS && required.some((s) => !s.done),
    done: required.filter((s) => s.done).length, total: required.length,
    next: pending ? { key: pending.key, label: pending.label, href: pending.href } : null,
    daysSinceSignup, steps,
  };
}
