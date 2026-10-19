/**
 * Início header: the day and who is here. "Minha conta" and "Sair" live in the side menu (one place for each),
 * 2026-10-18 UX research.
 */
export function DashboardHeader({ userName }: { userName: string }) {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' });
  return (
    <header className="border-b border-primary/10 bg-white/80 dark:bg-slate-950/80">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Resumo do dia</h1>
        <p className="text-sm text-muted-foreground mt-0.5 first-letter:uppercase">
          {today}{userName ? ` · Olá, ${userName}` : ''}
        </p>
      </div>
    </header>
  );
}
