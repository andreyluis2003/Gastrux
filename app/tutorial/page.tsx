import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BackButton } from '@/components/ui/back-button';
import { TutorialContent } from '@/components/tutorial/tutorial-content';

export const metadata = {
  title: 'Tutorial - Como Usar a Plataforma',
  description: 'Guia passo a passo sobre como utilizar cada módulo da plataforma',
};

export default async function TutorialPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/auth/signin');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-primary/10 bg-gradient-to-r from-white to-primary/2 dark:from-slate-950 dark:to-primary/5 backdrop-blur-md shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:py-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <BackButton />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Tutorial</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Aprenda a usar cada módulo passo a passo</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        <TutorialContent />
      </main>
    </div>
  );
}
