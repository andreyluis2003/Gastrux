/**
 * One navigation for the whole app (2026-10-05). There used to be three: the "Admin" sidebar with 27
 * loose items, a 10-item mobile menu, and nothing at all on the dashboard, the cash register and the
 * production screens. Competitors (Goomer, Anota AI, Consumer) group a few areas by the day's task and
 * keep the rest out of sight; this does the same. No feature is removed: whatever is not in a group
 * is still reachable from "Todos os recursos" on the dashboard.
 *
 * Pure module (no React): unit-tested in __tests__/unit/app-nav.test.ts.
 */

export type NavRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'COOK' | 'ADMIN';

export interface NavLink {
  label: string;
  href: string;
  /** Roles that see the link; absent = every role of the restaurant */
  roles?: NavRole[];
}

export interface NavGroup {
  id: string;
  label: string;
  links: NavLink[];
  /** Only for Gastrux platform staff */
  platformOnly?: boolean;
}

const MANAGERS: NavRole[] = ['OWNER', 'MANAGER', 'ADMIN'];
const FRONT: NavRole[] = ['OWNER', 'MANAGER', 'ADMIN', 'CASHIER'];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'inicio',
    label: 'Início',
    links: [{ label: 'Resumo do dia', href: '/dashboard' }],
  },
  {
    id: 'vender',
    label: 'Vender',
    links: [
      { label: 'Mesas e balcão', href: '/vender', roles: FRONT },
      { label: 'Mesas', href: '/admin/tables', roles: MANAGERS },
      { label: 'Pedidos de delivery', href: '/admin/integrations/orders', roles: FRONT },
      { label: 'Cozinha (KDS)', href: '/cozinha', roles: [...MANAGERS, 'COOK'] },
    ],
  },
  {
    id: 'caixa',
    label: 'Caixa e pagamentos',
    links: [
      { label: 'Caixa', href: '/caixa', roles: FRONT },
      { label: 'Histórico de caixas', href: '/caixa/historico', roles: MANAGERS },
      { label: 'Pagamentos online', href: '/dashboard/pagamentos', roles: MANAGERS },
    ],
  },
  {
    id: 'cardapio',
    label: 'Cardápio e produtos',
    links: [
      { label: 'Cardápio digital', href: '/admin/cardapio', roles: MANAGERS },
      { label: 'Fichas técnicas', href: '/receitas', roles: [...MANAGERS, 'COOK'] },
      { label: 'Insumos', href: '/insumos', roles: [...MANAGERS, 'COOK'] },
      { label: 'Engenharia de cardápio', href: '/engenharia-cardapio', roles: MANAGERS },
      { label: 'QR Codes das mesas', href: '/admin/tables/qrcodes', roles: MANAGERS },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque e compras',
    links: [
      { label: 'Estoque', href: '/estoque', roles: [...MANAGERS, 'COOK'] },
      { label: 'Contagem', href: '/contagem', roles: [...MANAGERS, 'COOK'] },
      { label: 'Compras', href: '/compras', roles: MANAGERS },
      { label: 'Desperdício', href: '/desperdicio', roles: [...MANAGERS, 'COOK'] },
      { label: 'Planejamento de produção', href: '/planejamento', roles: [...MANAGERS, 'COOK'] },
      { label: 'Fornecedores', href: '/admin/fornecedores-painel', roles: MANAGERS },
      { label: 'Importar nota de compra', href: '/admin/nfe-import', roles: MANAGERS },
    ],
  },
  {
    id: 'fiscal',
    label: 'Fiscal',
    links: [{ label: 'Notas fiscais (NFC-e)', href: '/admin/fiscal', roles: MANAGERS }],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    links: [
      { label: 'CMV', href: '/cmv', roles: MANAGERS },
      { label: 'Vendas', href: '/dashboard/reports/sales', roles: MANAGERS },
      { label: 'Lucratividade', href: '/dashboard/reports/profitability', roles: MANAGERS },
      { label: 'Financeiro', href: '/dashboard/financeiro', roles: MANAGERS },
      { label: 'DRE', href: '/dashboard/financeiro/dre', roles: MANAGERS },
      { label: 'Relatório executivo (PDF)', href: '/relatorios', roles: MANAGERS },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes e marketing',
    links: [
      { label: 'Clientes (CRM)', href: '/dashboard/crm', roles: MANAGERS },
      { label: 'Fidelidade', href: '/dashboard/loyalty', roles: MANAGERS },
      { label: 'Cashback', href: '/admin/cashback', roles: MANAGERS },
      { label: 'Campanhas', href: '/admin/messaging/campaigns', roles: MANAGERS },
      { label: 'Site de delivery', href: '/admin/delivery-site', roles: MANAGERS },
    ],
  },
  {
    id: 'equipe',
    label: 'Equipe',
    links: [
      { label: 'Equipe e acessos', href: '/admin/staff', roles: MANAGERS },
      { label: 'Turnos', href: '/admin/staff/shifts', roles: MANAGERS },
      { label: 'Comissões', href: '/admin/staff/commissions', roles: MANAGERS },
    ],
  },
  {
    id: 'config',
    label: 'Configurações',
    links: [
      { label: 'Configurações do restaurante', href: '/admin/settings', roles: MANAGERS },
      { label: 'WhatsApp', href: '/admin/integrations/whatsapp', roles: MANAGERS },
      { label: 'Maquininha', href: '/admin/pdv', roles: MANAGERS },
      { label: 'Várias lojas', href: '/admin/multi-location', roles: MANAGERS },
      { label: 'Todos os recursos', href: '/dashboard#modulos', roles: MANAGERS },
    ],
  },
  {
    id: 'plataforma',
    label: 'Plataforma Gastrux',
    platformOnly: true,
    links: [
      { label: 'Visão da plataforma', href: '/admin/platform' },
      { label: 'Clientes', href: '/admin/customers' },
      { label: 'Usuários', href: '/admin/users' },
      { label: 'Auditoria', href: '/admin/audit-logs' },
      { label: 'Suporte', href: '/admin/support' },
      { label: 'Onboarding', href: '/admin/onboarding' },
      { label: 'Base de conhecimento', href: '/admin/knowledge-base' },
      { label: 'Lead nurturing', href: '/admin/nurturing' },
      { label: 'Leads', href: '/admin/marketing/leads' },
    ],
  },
];

/** The groups a person sees: links filtered by role, empty groups dropped */
export function navFor(role: string | undefined | null, isPlatformAdmin: boolean): NavGroup[] {
  const r = (role || 'OWNER') as NavRole;
  return NAV_GROUPS.filter((g) => !g.platformOnly || isPlatformAdmin)
    .map((g) => ({ ...g, links: g.links.filter((l) => !l.roles || l.roles.includes(r) || (isPlatformAdmin && r === 'ADMIN')) }))
    .filter((g) => g.links.length > 0);
}

/** The link that matches the current page best (longest prefix), so one item is highlighted */
export function activeHref(groups: NavGroup[], pathname: string): string | null {
  let best: string | null = null;
  for (const g of groups) {
    for (const l of g.links) {
      const href = l.href.split('#')[0];
      if (pathname === href || pathname.startsWith(href + '/')) {
        if (!best || href.length > best.split('#')[0].length) best = l.href;
      }
    }
  }
  return best;
}

/**
 * Where the menu shows:
 * - 'none': public pages (site, login, customer menu and delivery, print pages) keep their own layout
 * - 'drawer': full-screen operation (comanda, kitchen) keeps the whole screen; the menu opens from a button
 * - 'sidebar': everything else, with the menu always visible on a computer
 */
export type ShellMode = 'none' | 'drawer' | 'sidebar';

const NO_SHELL_PREFIXES = [
  '/auth', '/pricing', '/ajuda', '/casos-de-sucesso', '/roadmap', '/feedback/share', '/showcase', '/docs',
  '/survey', '/termos', '/privacidade', '/billing/success', '/lp', '/para', '/menu', '/delivery', '/imprimir',
  '/conta/trocar-senha',
];
const DRAWER_PREFIXES = ['/vender', '/comanda', '/cozinha'];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

export function shellMode(pathname: string | null | undefined): ShellMode {
  const p = pathname || '/';
  if (p === '/') return 'none';
  if (NO_SHELL_PREFIXES.some((x) => matches(p, x))) return 'none';
  if (DRAWER_PREFIXES.some((x) => matches(p, x))) return 'drawer';
  return 'sidebar';
}
