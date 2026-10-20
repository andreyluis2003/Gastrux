import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/email/transactional';
import { getPlatformAdminEmails } from '@/lib/admin/guard';

/**
 * Onboarding tips by e-mail (owner decision 2026-10-19, option A): four e-mails to the owner of a restaurant in
 * its first two weeks, sent with Resend. They replaced the Abacus.AI sequence, whose texts promised a 14-day trial,
 * CSV import, demand forecast and smart alerts. The end of the trial is told by lib/billing/trial-reminders.ts.
 *
 * Who: the owner of a restaurant that is not internal (tests), never the platform team, never staff, never after
 * "Parar as dicas". When: each e-mail on its day of the account, and only in the 3 days after it, so an old account
 * never gets the whole series at once. The "sent" flags are the User columns of the old sequence.
 */
const DAY_MS = 86_400_000;
export const SEND_WINDOW_DAYS = 3;

export const ONBOARDING_STEPS = [
  { key: 'welcome', day: 0, label: 'Boas-vindas e primeiros passos', flag: 'emailSentWelcome', sentAt: 'emailWelcomeSentAt' },
  { key: 'day1', day: 1, label: 'Mesas, caixa, cozinha e equipe', flag: 'emailSentDay1', sentAt: 'emailDay1SentAt' },
  { key: 'day7', day: 7, label: 'Custo dos pratos e estoque', flag: 'emailSentDay7', sentAt: 'emailDay7SentAt' },
  { key: 'day14', day: 14, label: 'Relatórios, DRE e contas a pagar', flag: 'emailSentDay14', sentAt: 'emailDay14SentAt' },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]['key'];
type Step = (typeof ONBOARDING_STEPS)[number];

export const stepByKey = (key: string): Step | undefined => ONBOARDING_STEPS.find((s) => s.key === key);

/** The account's creation interval in which this step is due: created between `from` and `to` */
export function dueWindow(step: { day: number }, now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - (step.day + SEND_WINDOW_DAYS) * DAY_MS),
    to: new Date(now.getTime() - step.day * DAY_MS),
  };
}

const appUrl = () => (process.env.NEXTAUTH_URL || 'https://gastrux.com').replace(/\/$/, '');
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Signed link to stop the tips; the secret is the login one, so nobody can stop them for someone else */
export function unsubscribeToken(userId: string): string {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET || 'gastrux-dev').update(`onboarding-optout:${userId}`).digest('hex').slice(0, 32);
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(String(token || ''));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const unsubscribeUrl = (userId: string) =>
  `${appUrl()}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;

const p = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1f2937">${html}</p>`;
const h = (text: string) => `<h2 style="margin:22px 0 8px;font-size:16px;color:#142D27">${text}</h2>`;
const b = (text: string) => `<strong>${text}</strong>`;
const button = (href: string, text: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#335538;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">${text}</a></p>`;

function layout(body: string, userId: string): string {
  return [
    '<div style="background:#F7F8F2;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">',
    '<p style="margin:0 0 20px;font-size:20px;font-weight:bold;color:#142D27">gastrux</p>',
    body,
    p(`Dúvidas? Use o botão ${b('Pergunte ao Gastrux')} no canto da tela ou a <a href="${appUrl()}/ajuda" style="color:#335538">Central de Ajuda</a>.`),
    '</div>',
    `<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6b7280;text-align:center">`,
    'Você recebe estas dicas porque criou uma conta no Gastrux. ',
    `<a href="${unsubscribeUrl(userId)}" style="color:#6b7280">Parar as dicas</a>. Os avisos da sua conta (fim do teste, senha) continuam.`,
    '</p></div>',
  ].join('');
}

/** Subject and HTML of one step, for one owner */
export function buildOnboardingEmail(key: OnboardingStepKey, user: { id: string; name?: string | null }): { subject: string; html: string } {
  const name = escapeHtml((user.name || '').trim().split(/\s+/)[0] || 'tudo bem');
  const hello = p(user.name?.trim() ? `Olá, ${name}.` : 'Olá.');
  const url = appUrl();
  switch (key) {
    case 'welcome':
      return {
        subject: 'Bem-vindo ao Gastrux: seu teste de 30 dias começou',
        html: layout([
          hello,
          p(`Seu teste de ${b('30 dias com tudo do plano Business')} começou, sem cartão. Três passos para vender ainda hoje:`),
          h('1. Monte o cardápio'),
          p(`No ${b('Início')}, em Primeiros passos, toque em ${b('Fazer com a IA')} e mande até 4 fotos ou o PDF do seu cardápio. Você revisa nomes e preços antes de confirmar. Se preferir, cadastre em ${b('Cardápio e produtos › Cardápio digital')}.`),
          h('2. Abra o caixa'),
          p(`Em ${b('Caixa e pagamentos › Caixa')}, abra o caixa com o troco inicial.`),
          h('3. Faça a primeira venda'),
          p(`Em ${b('Vender › Mesas e balcão')}, toque numa mesa ou no balcão, escolha os itens e receba.`),
          button(`${url}/dashboard`, 'Abrir o Gastrux'),
          p('Nos primeiros 30 dias, as primeiras 100 perguntas ao assistente são grátis.'),
        ].join(''), user.id),
      };
    case 'day1':
      return {
        subject: 'Mesas, caixa e cozinha: o básico do dia a dia',
        html: layout([
          hello,
          p('Com o cardápio pronto, estes são os passos que mais ajudam no movimento:'),
          h('Mesas'),
          p(`Em ${b('Vender › Mesas e balcão')}, toque na mesa, lance os itens e envie para a cozinha. Para fechar, toque em ${b('Conta')} e escolha a forma de pagamento. As mesas são criadas em ${b('Vender › Mesas')}.`),
          h('Cozinha'),
          p(`Deixe ${b('Vender › Cozinha (KDS)')} aberto num tablet na cozinha: os pedidos enviados aparecem na hora.`),
          h('Equipe'),
          p(`Em ${b('Equipe › Equipe e acessos')}, cada pessoa ganha o próprio login: garçom, caixa ou cozinha. Cada um vê só o que precisa.`),
          h('Fechar o caixa'),
          p(`No fim do dia, em ${b('Caixa e pagamentos › Caixa')}, feche o caixa: você conta o dinheiro sem ver o valor esperado, e o Gastrux mostra a diferença.`),
          button(`${url}/vender`, 'Ir para Mesas e balcão'),
        ].join(''), user.id),
      };
    case 'day7':
      return {
        subject: 'Uma semana de Gastrux: o custo de cada prato',
        html: layout([
          hello,
          p('Com as vendas rodando, o próximo passo é saber quanto cada prato custa e quanto você ganha nele.'),
          h('Fichas técnicas'),
          p(`Em ${b('Cardápio e produtos › Fichas técnicas')}, diga quais insumos, e quanto de cada um, vão em cada prato. Ao editar o produto no Cardápio digital, aparecem o custo, a margem e o CMV.`),
          h('Custo dos insumos'),
          p(`Mantenha o custo em ${b('Cardápio e produtos › Insumos')}. Em ${b('Estoque e compras › Importar nota de compra')}, o XML da nota do fornecedor atualiza os custos.`),
          h('Estoque'),
          p(`Cada venda baixa o estoque pelas fichas. Lance as compras em ${b('Estoque e compras › Estoque')} (Entrada em lote) e confira em ${b('Contagem de estoque')}, pelo celular.`),
          button(`${url}/receitas`, 'Abrir as fichas técnicas'),
        ].join(''), user.id),
      };
    case 'day14':
      return {
        subject: 'Metade do teste: os números do seu restaurante',
        html: layout([
          hello,
          p('Duas semanas de vendas já dão números para olhar:'),
          h('Vendas e CMV'),
          p(`Em ${b('Relatórios › Vendas')}, veja o que vendeu por dia e por produto. Em ${b('Relatórios › CMV')}, quanto do que você vendeu foi custo de mercadoria.`),
          h('Resultado do mês'),
          p(`Em ${b('Mais recursos › DRE')}, a receita, o CMV e as despesas do mês num só lugar.`),
          h('Contas a pagar'),
          p(`Em ${b('Caixa e pagamentos › Contas a pagar')}, lance aluguel, fornecedores e boletos com vencimento, e não esqueça nenhum.`),
          p(`O teste continua até o 30º dia. Depois, escolha entre o ${b('Pro (R$ 149/mês)')} e o ${b('Business (R$ 199/mês)')}.`),
          button(`${url}/dashboard/reports/sales`, 'Ver minhas vendas'),
        ].join(''), user.id),
      };
  }
}

/** Owners due for a step now (see the header): who would get it if it ran now */
export async function dueRecipients(step: Step, now = new Date()) {
  const { from, to } = dueWindow(step, now);
  const platform = getPlatformAdminEmails();
  const users = await prisma.user.findMany({
    where: { active: true, onboardingEmailsOptOut: false, email: { not: '' }, [step.flag]: false, createdAt: { gte: from, lte: to } },
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    // No cap: the 3-day window keeps it small, and a cap here cut owners before the restaurant check below (staff
    // and test accounts in the same window filled it; test run of 2026-10-19)
  });
  // Restaurant.ownerId has no relation in the schema: the owners among them, of a restaurant that is not a test
  const owned = await prisma.restaurant.findMany({
    where: { ownerId: { in: users.map((u) => u.id) }, isInternal: false },
    select: { ownerId: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const restaurantOf = new Map<string, string>();
  for (const r of owned) if (!restaurantOf.has(r.ownerId)) restaurantOf.set(r.ownerId, r.name);
  return users
    .filter((u) => restaurantOf.has(u.id) && !platform.includes(u.email.toLowerCase()))
    .map((u) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt, restaurantName: restaurantOf.get(u.id)! }));
}

/**
 * Sends one step to one owner. The flag is taken first (updateMany on false), so a second run at the same time
 * does not send twice; a failed send gives the flag back so the next run tries again.
 */
export async function sendOnboardingStep(userId: string, key: OnboardingStepKey, now = new Date()): Promise<'sent' | 'skipped' | 'failed'> {
  const step = stepByKey(key)!;
  const claimed = await prisma.user.updateMany({ where: { id: userId, [step.flag]: false }, data: { [step.flag]: true, [step.sentAt]: now } });
  if (claimed.count === 0) return 'skipped';
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  try {
    const { subject, html } = buildOnboardingEmail(key, user!);
    const result = await sendTransactionalEmail({ to: user!.email, subject, html, notificationId: `onboarding-${key}` });
    if (result.provider === 'none') throw new Error('Nenhum provedor de e-mail configurado (RESEND_API_KEY)');
    return 'sent';
  } catch (error) {
    console.error(`[onboarding-emails] ${key} to ${userId} failed`, error);
    await prisma.user.updateMany({ where: { id: userId }, data: { [step.flag]: false, [step.sentAt]: null } });
    return 'failed';
  }
}

/** The welcome right after sign-up, if this new owner is a recipient (the daily run catches anyone missed) */
export async function sendWelcomeIfDue(userId: string, now = new Date()): Promise<'sent' | 'skipped' | 'failed'> {
  const due = await dueRecipients(stepByKey('welcome')!, now);
  if (!due.some((u) => u.id === userId)) return 'skipped';
  return sendOnboardingStep(userId, 'welcome', now);
}

/** Daily run (VPS cron) or the "Enviar agora" button of Plataforma › Onboarding */
export async function runOnboardingEmails(now = new Date()) {
  const byStep: Record<string, { sent: number; failed: number }> = {};
  for (const step of ONBOARDING_STEPS) {
    byStep[step.key] = { sent: 0, failed: 0 };
    for (const u of await dueRecipients(step, now)) {
      const r = await sendOnboardingStep(u.id, step.key, now);
      if (r === 'sent') byStep[step.key].sent++;
      if (r === 'failed') byStep[step.key].failed++;
    }
  }
  const sent = Object.values(byStep).reduce((s, v) => s + v.sent, 0);
  const failed = Object.values(byStep).reduce((s, v) => s + v.failed, 0);
  return { sent, failed, byStep };
}
