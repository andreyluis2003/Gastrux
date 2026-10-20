/** Onboarding tips by e-mail (2026-10-19): when each one is due, the stop link, and texts that only say what exists */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
import { ONBOARDING_STEPS, buildOnboardingEmail, dueWindow, unsubscribeToken, verifyUnsubscribeToken } from '@/lib/onboarding/emails';

const DAY = 86_400_000;
const now = new Date('2026-10-20T12:00:00Z');

it('each e-mail is due from its day of the account until 3 days later', () => {
  const day7 = ONBOARDING_STEPS.find((s) => s.key === 'day7')!;
  const { from, to } = dueWindow(day7, now);
  expect(now.getTime() - to.getTime()).toBe(7 * DAY);
  expect(now.getTime() - from.getTime()).toBe(10 * DAY);
  expect(ONBOARDING_STEPS.map((s) => s.day)).toEqual([0, 1, 7, 14]);
});

it('the stop link is signed for that person only', () => {
  const t = unsubscribeToken('user-a');
  expect(verifyUnsubscribeToken('user-a', t)).toBe(true);
  expect(verifyUnsubscribeToken('user-b', t)).toBe(false);
  expect(verifyUnsubscribeToken('user-a', 'x')).toBe(false);
  expect(verifyUnsubscribeToken('user-a', '')).toBe(false);
});

describe.each(ONBOARDING_STEPS.map((s) => s.key))('e-mail %s', (key) => {
  const { subject, html } = buildOnboardingEmail(key, { id: 'user-a', name: '<b>Ana Souza' });

  it('greets by first name, escaped, and carries the stop link', () => {
    expect(html).toContain('Olá, &#60;b&#62;Ana.');
    expect(html).not.toContain('<b>Ana');
    expect(html).toContain(`/api/email/unsubscribe?u=user-a&t=${unsubscribeToken('user-a')}`);
    expect(subject.length).toBeGreaterThan(10);
  });

  // What the old Abacus sequence promised and Gastrux does not have (review of 2026-10-19)
  it.each([/14 dias/, /CSV/i, /planilha/i, /\/kds\b/, /proje[cç][aã]o de demanda/i, /previs[aã]o/i, /alertas inteligentes/i,
    /Starter/, /R\$ ?99\b/, /R\$ ?249\b/, /simulador/i, /responda este e-?mail/i, /suporte priorit/i, /Metas/])('does not say %s', (re) => {
    expect(`${subject} ${html}`).not.toMatch(re);
  });
});

it('the welcome says the trial as it is', () => {
  expect(buildOnboardingEmail('welcome', { id: 'u', name: null }).html).toContain('30 dias com tudo do plano Business');
});
