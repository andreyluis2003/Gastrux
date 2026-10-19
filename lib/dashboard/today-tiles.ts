import { canSeeModule } from '@/lib/navigation/app-nav';

/**
 * "Painel do dia" on Início (2026-10-18 UX research, proposal 1): what matters today, one tile per screen. A tile
 * shows only for who can open its screen (the menu rule), so the cashier sees selling and the cook the kitchen.
 */
export interface TodayData {
  salesCents: number;
  salesCount: number;
  openShifts: Array<{ registerName: string }>;
  openTables: number;
  openComandas: number;
  deliveryPending: number;
  payables: { overdue: { count: number; cents: number }; today: { count: number; cents: number } };
  lowStock: number;
  kitchenQueue: number;
}

export type TileTone = 'ok' | 'warn' | 'alert' | 'neutral';
export interface Tile { key: string; label: string; value: string; hint: string; href: string; tone: TileTone }

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function panelTiles(d: TodayData, role: string | null | undefined): Tile[] {
  const { overdue, today } = d.payables;
  const bills = [today.count ? `${today.count} ${today.count === 1 ? 'vence' : 'vencem'} hoje` : '', overdue.count ? n(overdue.count, 'atrasada', 'atrasadas') : '']
    .filter(Boolean).join(' · ');
  const tiles: Tile[] = [
    {
      key: 'sales', label: 'Vendas de hoje', value: brl(d.salesCents),
      hint: d.salesCount ? n(d.salesCount, 'venda', 'vendas') : 'nenhuma venda ainda', href: '/dashboard/reports/sales', tone: 'neutral',
    },
    d.openShifts.length
      ? { key: 'cash', label: 'Caixa', value: 'Aberto', hint: d.openShifts.map((s) => s.registerName).join(', '), href: '/caixa', tone: 'ok' }
      : { key: 'cash', label: 'Caixa', value: 'Fechado', hint: 'Toque para abrir', href: '/caixa', tone: 'warn' },
    {
      key: 'tables', label: 'Comandas abertas', value: String(d.openComandas),
      hint: d.openComandas ? n(d.openTables, 'mesa ocupada', 'mesas ocupadas') : 'nenhuma comanda aberta', href: '/vender', tone: 'neutral',
    },
    {
      key: 'delivery', label: 'Delivery', value: String(d.deliveryPending), hint: d.deliveryPending === 1 ? 'pedido novo' : 'pedidos novos',
      href: '/admin/integrations/orders', tone: d.deliveryPending ? 'warn' : 'neutral',
    },
    {
      key: 'kitchen', label: 'Cozinha', value: String(d.kitchenQueue), hint: d.kitchenQueue === 1 ? 'pedido na fila' : 'pedidos na fila',
      href: '/cozinha', tone: 'neutral',
    },
    {
      key: 'payables', label: 'Contas a pagar', value: brl(today.cents + overdue.cents), hint: bills || 'nada vence hoje',
      href: '/contas-a-pagar', tone: overdue.count ? 'alert' : today.count ? 'warn' : 'ok',
    },
    {
      key: 'stock', label: 'Estoque baixo', value: String(d.lowStock),
      hint: d.lowStock ? (d.lowStock === 1 ? 'insumo abaixo do mínimo' : 'insumos abaixo do mínimo') : 'tudo acima do mínimo',
      href: '/estoque', tone: d.lowStock ? 'warn' : 'ok',
    },
  ];
  return tiles.filter((t) => canSeeModule(t.href, role));
}
