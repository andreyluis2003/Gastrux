'use client';

import { useI18n } from '@/lib/i18n';
import Link from 'next/link';
import { UserCog } from 'lucide-react';
import { LogoutButton } from '@/components/logout-button';

interface DashboardHeaderProps {
  userName: string;
  userRole: string;
}

export function DashboardHeader({ userName, userRole }: DashboardHeaderProps) {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b border-primary/10 bg-gradient-to-r from-white to-primary/2 dark:from-slate-950 dark:to-primary/5 backdrop-blur-md shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:py-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 text-white font-bold text-lg">
            🍽️
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('dashboard.title')}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t('dashboard.welcome')}, {userName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            <span className="text-xs sm:text-sm font-medium text-primary">{userRole}</span>
          </div>
          {/* The account page (password change) was reachable only by typing /conta */}
          <Link
            href="/conta#alterar-senha"
            className="inline-flex items-center gap-2 rounded-md border border-primary/20 px-3 py-2 text-sm font-medium text-foreground hover:bg-primary/10"
            aria-label="Minha conta e alterar senha"
          >
            <UserCog className="h-4 w-4" />
            <span className="hidden sm:inline">Minha conta</span>
          </Link>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
