/** What the trial / locked bar says (spec 2026-10-18 §6); null = no bar */
export type BannerTone = 'info' | 'warn' | 'danger';

export function bannerFor(state: string | null | undefined, daysLeft: number | null | undefined): { tone: BannerTone; text: string } | null {
  if (state === 'locked') return { tone: 'danger', text: 'Teste encerrado: escolha um plano para voltar a vender' };
  if (state !== 'trial') return null;
  const days = Math.max(1, daysLeft ?? 1);
  if (days === 1) return { tone: 'warn', text: 'Teste grátis: último dia' };
  return { tone: days <= 7 ? 'warn' : 'info', text: `Teste grátis: faltam ${days} dias` };
}
