'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  href?: string;
  label?: string;
  variant?: 'ghost' | 'outline' | 'default' | 'secondary' | 'destructive';
}

/**
 * "Back to the dashboard" is the menu's job since the app has one menu on every screen
 * (components/app-shell): such a button renders nothing. A back button to the parent screen (from an
 * ingredient to the ingredients list, for instance) still shows.
 */
const MENU_HOMES = new Set(['/dashboard', '/admin']);

export function BackButton({ href = '/dashboard', label = 'Voltar', variant = 'ghost' }: BackButtonProps) {
  const router = useRouter();
  if (MENU_HOMES.has(href)) return null;

  const handleBack = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(href);
  };

  return (
    <button
      onClick={handleBack}
      className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 gap-2 h-9 px-3 ${
        variant === 'ghost'
          ? 'text-slate-600 dark:text-slate-300 hover:bg-accent hover:text-accent-foreground'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'
      }`}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
