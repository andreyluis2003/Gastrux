import { prisma } from '@/lib/prisma';
import { SEGMENTS } from '@/lib/marketing/segments';
import { ANSWER_LABELS, clientAlerts, clientStage, type ClientAlert, type ClientSignals, type ClientStage } from './client-health';

/**
 * What the Gastrux team needs to know about each client (platform screens only, 2026-10-07): who to
 * call, what they told us at sign-up, how far they got and what is wrong. One query per kind of
 * data for the whole page of restaurants, never one per restaurant.
 */

export interface ClientProfile {
  contact: { ownerName: string | null; ownerEmail: string | null; restaurantEmail: string | null; phone: string | null; city: string | null; state: string | null; addressMissing: boolean };
  answers: Array<{ question: string; answer: string }>;
  usage: { lastSignInAt: string | null; menuItems: number; recipes: number; closedBills: number; closedBills30d: number; users: number; mercadoPago: string; fiscal: string; openTickets: number };
  stage: ClientStage;
  alerts: ClientAlert[];
}

const OPEN_TICKET = ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] as const;
const businessTypeLabel = (slug: string) => SEGMENTS.find((s) => s.slug === slug)?.name.replace(/^Sistema para /, '') ?? slug;
const countBy = (rows: Array<{ restaurantId: string | null; _count: { _all: number } }>) =>
  new Map(rows.filter((r) => r.restaurantId).map((r) => [r.restaurantId as string, r._count._all]));

export async function clientProfiles(restaurantIds: string[], now = new Date()): Promise<Map<string, ClientProfile>> {
  const out = new Map<string, ClientProfile>();
  if (restaurantIds.length === 0) return out;
  const ids = { in: restaurantIds };
  const since30d = new Date(now.getTime() - 30 * 86_400_000);

  const restaurants = await prisma.restaurant.findMany({
    where: { id: ids },
    select: { id: true, ownerId: true, email: true, phone: true, address: true, city: true, state: true, status: true, subscriptionStatus: true, trialEndsAt: true, createdAt: true },
  });
  const ownerIds = restaurants.map((r) => r.ownerId).filter((x): x is string => !!x);

  const [owners, members, menuItems, recipes, bills, bills30d, mp, fiscal, tickets] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, name: true, email: true, lastSignInAt: true, businessStage: true, businessType: true, locationCount: true, mainPainPoint: true, leadQuality: true },
    }),
    prisma.restaurantUser.findMany({ where: { restaurantId: ids }, select: { restaurantId: true, user: { select: { lastSignInAt: true } } } }),
    prisma.menuItem.groupBy({ by: ['restaurantId'], where: { restaurantId: ids }, _count: { _all: true } }),
    prisma.recipe.groupBy({ by: ['restaurantId'], where: { restaurantId: ids }, _count: { _all: true } }),
    prisma.orderSession.groupBy({ by: ['restaurantId'], where: { restaurantId: ids, status: 'CLOSED' }, _count: { _all: true } }),
    prisma.orderSession.groupBy({ by: ['restaurantId'], where: { restaurantId: ids, status: 'CLOSED', closedAt: { gte: since30d } }, _count: { _all: true } }),
    prisma.mercadoPagoConnection.findMany({ where: { restaurantId: ids }, select: { restaurantId: true, status: true } }),
    prisma.nFeConfig.findMany({ where: { restaurantId: ids }, select: { restaurantId: true, environment: true, active: true, nfeApiKey: true } }),
    prisma.supportTicket.groupBy({ by: ['restaurantId'], where: { restaurantId: ids, status: { in: [...OPEN_TICKET] } }, _count: { _all: true } }),
  ]);

  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const menuBy = countBy(menuItems as any);
  const recipeBy = countBy(recipes as any);
  const billsBy = countBy(bills as any);
  const bills30By = countBy(bills30d as any);
  const ticketsBy = countBy(tickets as any);
  const mpBy = new Map(mp.map((m) => [m.restaurantId, m.status]));
  const fiscalBy = new Map(fiscal.map((f) => [f.restaurantId, f]));
  const lastLogin = new Map<string, Date>();
  const usersBy = new Map<string, number>();
  for (const m of members) {
    usersBy.set(m.restaurantId, (usersBy.get(m.restaurantId) ?? 0) + 1);
    const t = m.user?.lastSignInAt;
    if (t && (!lastLogin.has(m.restaurantId) || t > lastLogin.get(m.restaurantId)!)) lastLogin.set(m.restaurantId, t);
  }

  for (const r of restaurants) {
    const owner = r.ownerId ? ownerById.get(r.ownerId) : undefined;
    const ownerLogin = owner?.lastSignInAt ?? null;
    const memberLogin = lastLogin.get(r.id) ?? null;
    const last = ownerLogin && memberLogin ? (ownerLogin > memberLogin ? ownerLogin : memberLogin) : ownerLogin ?? memberLogin;
    const mpStatus = (mpBy.get(r.id) ?? null) as ClientSignals['mpStatus'];
    const f = fiscalBy.get(r.id);

    const signals: ClientSignals = {
      status: r.status,
      subscriptionStatus: r.subscriptionStatus ?? '',
      trialEndsAt: r.trialEndsAt,
      createdAt: r.createdAt,
      lastSignInAt: last,
      menuItems: menuBy.get(r.id) ?? 0,
      closedBills: billsBy.get(r.id) ?? 0,
      closedBills30d: bills30By.get(r.id) ?? 0,
      mpStatus,
      openTickets: ticketsBy.get(r.id) ?? 0,
    };

    const answers: ClientProfile['answers'] = [];
    if (owner?.businessStage) answers.push({ question: 'Situação do negócio', answer: ANSWER_LABELS.businessStage[owner.businessStage] ?? owner.businessStage });
    if (owner?.businessType) answers.push({ question: 'Tipo de negócio', answer: businessTypeLabel(owner.businessType) });
    if (owner?.locationCount) answers.push({ question: 'Unidades', answer: ANSWER_LABELS.locationCount[owner.locationCount] ?? owner.locationCount });
    if (owner?.mainPainPoint) answers.push({ question: 'Maior dor', answer: ANSWER_LABELS.mainPainPoint[owner.mainPainPoint] ?? owner.mainPainPoint });
    if (owner?.leadQuality) answers.push({ question: 'Perfil', answer: ANSWER_LABELS.leadQuality[owner.leadQuality] ?? owner.leadQuality });

    out.set(r.id, {
      contact: {
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        restaurantEmail: r.email,
        phone: r.phone,
        city: r.city,
        state: r.state,
        addressMissing: !r.address,
      },
      answers,
      usage: {
        lastSignInAt: last?.toISOString() ?? null,
        menuItems: signals.menuItems,
        recipes: recipeBy.get(r.id) ?? 0,
        closedBills: signals.closedBills,
        closedBills30d: signals.closedBills30d,
        users: usersBy.get(r.id) ?? 0,
        mercadoPago: mpStatus === 'ACTIVE' ? 'Conectado' : mpStatus === 'NEEDS_RECONNECT' ? 'Desconectado' : 'Não conectado',
        fiscal: f && f.active && f.nfeApiKey ? (f.environment === 'production' ? 'Emitindo (produção)' : 'Configurado (homologação)') : 'Não configurado',
        openTickets: signals.openTickets,
      },
      stage: clientStage(signals),
      alerts: clientAlerts(signals, now),
    });
  }
  return out;
}

/** How many clients reached each step, and how many need attention (all live clients, not one page) */
export async function clientFunnel(now = new Date()) {
  const all = await prisma.restaurant.findMany({ where: { deletedAt: null }, select: { id: true } });
  const profiles = await clientProfiles(all.map((r) => r.id), now);
  const byStage: Record<ClientStage, number> = { SIGNED_UP: 0, MENU_READY: 0, SELLING: 0, PAYING: 0 };
  let needAttention = 0;
  let urgent = 0;
  for (const p of profiles.values()) {
    byStage[p.stage] += 1;
    if (p.alerts.length) needAttention += 1;
    if (p.alerts.some((a) => a.level === 'red')) urgent += 1;
  }
  const entries = [...profiles];
  return {
    total: profiles.size,
    byStage,
    needAttention,
    urgent,
    attentionIds: entries.filter(([, p]) => p.alerts.length).map(([id]) => id),
    stageIds: (stage: ClientStage) => entries.filter(([, p]) => p.stage === stage).map(([id]) => id),
  };
}
