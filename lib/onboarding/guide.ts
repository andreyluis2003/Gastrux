import { prisma } from '@/lib/prisma';
import { firstSteps, ONBOARDING_DAYS, type FirstStep } from '@/lib/onboarding/first-steps';

/**
 * Primeiro acesso guiado (spec docs/superpowers/specs/2026-11-05-primeiro-acesso-guiado-design.md): the first
 * steps in groups by how the restaurant sells, each with the minutes it takes. The "done" of the steps that
 * already existed still comes from lib/onboarding/first-steps.ts; the new ones come from marks on the
 * restaurant (restaurants.onboardingGuide) and from a real site order.
 */
export const CHANNELS = ['balcao', 'mesas', 'delivery'] as const;
export type Channel = (typeof CHANNELS)[number];
export const MARKS = ['testOrder', 'qrcodes', 'deliveryLink'] as const;
export type GuideMark = (typeof MARKS)[number];
export interface GuideState { channels?: Channel[]; marks?: Partial<Record<GuideMark, string>> }

export type GuideStepKey = FirstStep['key'] | 'teste' | 'qrcodes' | 'deliveryLink' | 'deliveryOrder';
export interface GuideStep { key: GuideStepKey; label: string; href: string; minutes: number; done: boolean; optional?: boolean }
export type GuideGroupId = 'inicio' | 'mesas' | 'delivery';
export interface GuideGroup { id: GuideGroupId; title: string; steps: GuideStep[] }
export interface Guide { channels: Channel[]; channelsChosen: boolean; groups: GuideGroup[]; done: number; total: number }

/** How a business usually sells, before the owner says (spec §2; my call) */
const TABLES_FIRST = ['restaurantes', 'bar', 'espetaria'];
const DELIVERY_FIRST = ['pizzaria', 'hamburgueria', 'japones', 'marmitaria', 'acai', 'lanchonete', 'doceria'];
export function defaultChannels(businessType: string | null | undefined): Channel[] {
  if (businessType && TABLES_FIRST.includes(businessType)) return ['balcao', 'mesas'];
  if (businessType && DELIVERY_FIRST.includes(businessType)) return ['balcao', 'delivery'];
  return ['balcao'];
}

const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** The stored JSON, keeping only known channels and dated marks */
export function parseGuideState(raw: unknown): GuideState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: GuideState = {};
  if (Array.isArray(r.channels)) {
    out.channels = CHANNELS.filter((c) => (r.channels as unknown[]).includes(c));
  }
  if (r.marks && typeof r.marks === 'object' && !Array.isArray(r.marks)) {
    const m = r.marks as Record<string, unknown>;
    const marks: GuideState['marks'] = {};
    for (const k of MARKS) if (isIso(m[k])) marks[k] = m[k] as string;
    out.marks = marks;
  }
  return out;
}

/** Minutes each step takes (spec §2; my estimates) */
const MINUTES: Record<GuideStepKey, number> = {
  teste: 3, cardapio: 10, caixa: 1, venda: 2, endereco: 1, nfce: 15, mesas: 2, qrcodes: 3, equipe: 3, deliveryLink: 1, deliveryOrder: 3,
};

export function buildGuide(input: { steps: FirstStep[]; state: GuideState; businessType: string | null | undefined; deliveryOrders: number }): Guide {
  const { state } = input;
  const channelsChosen = Array.isArray(state.channels);
  const channels = channelsChosen ? state.channels! : defaultChannels(input.businessType);
  const marks = state.marks ?? {};
  const byKey = new Map(input.steps.map((s) => [s.key, s]));
  const old = (key: FirstStep['key']): GuideStep => {
    const s = byKey.get(key);
    return { key, label: s?.label ?? key, href: s?.href ?? '/dashboard', minutes: MINUTES[key], done: !!s?.done, ...(s?.optional ? { optional: true } : {}) };
  };

  const groups: GuideGroup[] = [{
    id: 'inicio',
    title: 'Comece por aqui',
    steps: [
      { key: 'teste', label: 'Fazer o pedido de teste guiado', href: '/vender', minutes: MINUTES.teste, done: !!marks.testOrder },
      old('cardapio'), old('caixa'), old('venda'), old('endereco'), old('nfce'),
    ],
  }];
  if (channels.includes('mesas')) {
    groups.push({
      id: 'mesas',
      title: 'Mesas',
      steps: [
        old('mesas'),
        { key: 'qrcodes', label: 'Imprimir os QR Codes das mesas', href: '/admin/tables/qrcodes', minutes: MINUTES.qrcodes, done: !!marks.qrcodes },
        old('equipe'),
      ],
    });
  }
  if (channels.includes('delivery')) {
    groups.push({
      id: 'delivery',
      title: 'Delivery',
      steps: [
        { key: 'deliveryLink', label: 'Copiar o link do seu site de delivery', href: '/admin/delivery-site', minutes: MINUTES.deliveryLink, done: !!marks.deliveryLink },
        { key: 'deliveryOrder', label: 'Fazer um pedido de teste pelo site', href: '/admin/delivery-site', minutes: MINUTES.deliveryOrder, done: input.deliveryOrders > 0 },
      ],
    });
  }
  const required = groups.flatMap((g) => g.steps).filter((s) => !s.optional);
  return { channels, channelsChosen, groups, done: required.filter((s) => s.done).length, total: required.length };
}

export interface GuideStatus extends Guide { active: boolean; hasProducts: boolean }

/** The guide of one restaurant, as the panel and the home show it */
export async function loadGuide(restaurantId: string, now = new Date()): Promise<GuideStatus> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { createdAt: true, onboardingGuide: true, ownerId: true },
  });
  const [steps, owner, deliveryOrders, products] = await Promise.all([
    firstSteps(restaurantId),
    restaurant ? prisma.user.findUnique({ where: { id: restaurant.ownerId }, select: { businessType: true } }) : null,
    prisma.externalOrder.count({ where: { restaurantId, integration: { platform: 'delivery_site' } } }),
    prisma.menuItem.count({ where: { restaurantId } }),
  ]);
  const guide = buildGuide({ steps, state: parseGuideState(restaurant?.onboardingGuide), businessType: owner?.businessType, deliveryOrders });
  const days = Math.floor((now.getTime() - (restaurant?.createdAt ?? now).getTime()) / 86_400_000);
  return { ...guide, active: days <= ONBOARDING_DAYS && guide.done < guide.total, hasProducts: products > 0 };
}

/** Saves how the restaurant sells, or marks one of the new steps done (the first date stays) */
export async function updateGuide(restaurantId: string, change: { channels?: Channel[]; mark?: GuideMark }): Promise<void> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { onboardingGuide: true } });
  const state = parseGuideState(r?.onboardingGuide);
  if (change.channels) state.channels = CHANNELS.filter((c) => change.channels!.includes(c));
  if (change.mark) state.marks = { ...state.marks, [change.mark]: state.marks?.[change.mark] ?? new Date().toISOString() };
  await prisma.restaurant.update({ where: { id: restaurantId }, data: { onboardingGuide: state as object } });
}
