/** Contas a pagar rules (spec 2026-10-18 contas a pagar §5) */
import { displayState, dueDateIn, splitInstallments, installmentDueDates, seriesMonths, dreLine, brtToday } from '@/lib/payables/rules';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

it('display state by the Brasília day', () => {
  const today = '2026-10-18';
  expect(displayState({ status: 'OPEN', dueDate: d('2026-10-17') }, today)).toBe('OVERDUE');
  expect(displayState({ status: 'OPEN', dueDate: d('2026-10-18') }, today)).toBe('TODAY');
  expect(displayState({ status: 'OPEN', dueDate: d('2026-10-25') }, today)).toBe('WEEK');
  expect(displayState({ status: 'OPEN', dueDate: d('2026-10-26') }, today)).toBe('LATER');
  expect(displayState({ status: 'PAID', dueDate: d('2026-10-01') }, today)).toBe('PAID');
  expect(displayState({ status: 'CANCELED', dueDate: d('2026-10-01') }, today)).toBe('CANCELED');
  expect(brtToday(new Date('2026-10-19T02:00:00Z'))).toBe('2026-10-18'); // 23h in Brasília
});

it('day 31 falls on the last day of shorter months', () => {
  expect(dueDateIn('2027-02', 31).toISOString().slice(0, 10)).toBe('2027-02-28');
  expect(dueDateIn('2028-02', 30).toISOString().slice(0, 10)).toBe('2028-02-29');
  expect(dueDateIn('2026-11', 5).toISOString().slice(0, 10)).toBe('2026-11-05');
});

it('installments: equal parts, cents on the last, monthly dates', () => {
  expect(splitInstallments(100000, 3)).toEqual([33333, 33333, 33334]);
  expect(splitInstallments(1000, 2)).toEqual([500, 500]);
  expect(installmentDueDates('2026-12-31', 3).map((x) => x.toISOString().slice(0, 10))).toEqual(['2026-12-31', '2027-01-31', '2027-02-28']);
});

it('series keeps the current month and the next two', () => {
  expect(seriesMonths('2026-11')).toEqual(['2026-11', '2026-12', '2027-01']);
});

it('what reaches the DRE', () => {
  expect(['RENT', 'TAXES', 'SERVICES', 'LOANS', 'OTHER'].map((c) => dreLine(c as any))).toEqual(Array(5).fill('OPERATIONAL'));
  expect(dreLine('PAYROLL')).toBe('PAYROLL');
  expect(dreLine('UTILITIES')).toBeNull();
  expect(dreLine('MERCHANDISE')).toBeNull();
});
