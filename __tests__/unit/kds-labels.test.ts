/** The kitchen screen speaks Portuguese (video screenshots 2026-10-24: PENDING, PREPARING, "Kitchen Display System") */
import fs from 'fs';
import path from 'path';
import { kdsPriorityLabel, kdsStatusLabel } from '../../lib/kds/status-label';

it('order statuses are shown in Portuguese, like the counters on top', () => {
  expect(kdsStatusLabel('PENDING')).toBe('A fazer');
  expect(kdsStatusLabel('PREPARING')).toBe('Em preparo');
  expect(kdsStatusLabel('READY')).toBe('Pronto');
  expect(kdsStatusLabel('COMPLETED')).toBe('Concluído');
  expect(kdsStatusLabel('CANCELLED')).toBe('Cancelado');
  expect(kdsStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
});

it('the kitchen components print no English title or raw status', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
  expect(read('components/kds/kds-display.tsx')).not.toMatch(/Kitchen Display System/);
  const card = read('components/kds/kds-order-card.tsx');
  expect(card).not.toMatch(/\{order\.status\}/);
  expect(card).not.toMatch(/Est: \{/);
});

it('priorities too', () => {
  expect(kdsPriorityLabel('HIGH')).toBe('Prioridade alta');
  expect(kdsPriorityLabel('URGENT')).toBe('Urgente');
  const card = fs.readFileSync(path.join(process.cwd(), 'components/kds/kds-order-card.tsx'), 'utf8');
  expect(card).not.toMatch(/\{order\.priority\}/);
});
