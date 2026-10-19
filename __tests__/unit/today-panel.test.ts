/** "Painel do dia" on Início (2026-10-18 UX research, proposal 1): the tiles each role sees and what they say */
import { panelTiles, type TodayData } from '@/lib/dashboard/today-tiles';

const base: TodayData = {
  salesCents: 124050, salesCount: 18,
  openShifts: [{ registerName: 'Caixa principal' }],
  openTables: 3, openComandas: 5,
  deliveryPending: 2,
  payables: { overdue: { count: 1, cents: 30000 }, today: { count: 2, cents: 145000 } },
  lowStock: 4,
  kitchenQueue: 6,
};
const keys = (role: string, d = base) => panelTiles(d, role).map((t) => t.key);

it('owner and manager see the whole day', () => {
  expect(keys('OWNER')).toEqual(['sales', 'cash', 'tables', 'delivery', 'kitchen', 'payables', 'stock']);
  expect(keys('MANAGER')).toEqual(keys('OWNER'));
});

it('cashier sees selling; cook sees the kitchen and the stock; nobody sees a tile of a screen they cannot open', () => {
  expect(keys('CASHIER')).toEqual(['cash', 'tables', 'delivery']);
  expect(keys('COOK')).toEqual(['kitchen', 'stock']);
});

it('what the tiles say', () => {
  const t = Object.fromEntries(panelTiles(base, 'OWNER').map((x) => [x.key, x]));
  expect(t.sales).toMatchObject({ value: 'R$ 1.240,50', hint: '18 vendas', href: '/dashboard/reports/sales' });
  expect(t.cash).toMatchObject({ value: 'Aberto', hint: 'Caixa principal', href: '/caixa', tone: 'ok' });
  expect(t.tables).toMatchObject({ value: '5', hint: '3 mesas ocupadas', href: '/vender' });
  expect(t.delivery).toMatchObject({ value: '2', hint: 'pedidos novos', href: '/admin/integrations/orders', tone: 'warn' });
  expect(t.kitchen).toMatchObject({ value: '6', hint: 'pedidos na fila', href: '/cozinha' });
  expect(t.payables).toMatchObject({ value: 'R$ 1.750,00', hint: '2 vencem hoje · 1 atrasada', href: '/contas-a-pagar', tone: 'alert' });
  expect(t.stock).toMatchObject({ value: '4', hint: 'insumos abaixo do mínimo', href: '/estoque', tone: 'warn' });
});

it('a quiet day: closed register asks to open it, nothing to pay, nothing low', () => {
  const quiet: TodayData = { ...base, salesCents: 0, salesCount: 0, openShifts: [], openTables: 0, openComandas: 0, deliveryPending: 0,
    payables: { overdue: { count: 0, cents: 0 }, today: { count: 0, cents: 0 } }, lowStock: 0, kitchenQueue: 0 };
  const t = Object.fromEntries(panelTiles(quiet, 'OWNER').map((x) => [x.key, x]));
  expect(t.sales).toMatchObject({ value: 'R$ 0,00', hint: 'nenhuma venda ainda' });
  expect(t.cash).toMatchObject({ value: 'Fechado', hint: 'Toque para abrir', tone: 'warn' });
  expect(t.tables).toMatchObject({ value: '0', hint: 'nenhuma comanda aberta' });
  expect(t.delivery.tone).toBe('neutral');
  expect(t.payables).toMatchObject({ value: 'R$ 0,00', hint: 'nada vence hoje', tone: 'ok' });
  expect(t.stock).toMatchObject({ value: '0', hint: 'tudo acima do mínimo', tone: 'ok' });
});

it('two registers open: both names; one sale and one table read in the singular', () => {
  const t = Object.fromEntries(panelTiles({ ...base, salesCount: 1, openTables: 1, openShifts: [{ registerName: 'Salão' }, { registerName: 'Bar' }] }, 'OWNER').map((x) => [x.key, x]));
  expect(t.cash.hint).toBe('Salão, Bar');
  expect(t.sales.hint).toBe('1 venda');
  expect(t.tables.hint).toBe('1 mesa ocupada');
});
