'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChefHat, ChevronDown, LogOut, Menu, UserCog, X } from 'lucide-react';
import { NotificationCenter } from '@/components/notification-center';
import { signOutSafely } from '@/lib/offline/sign-out';
import { activeHref, navFor, shellMode, type NavGroup } from '@/lib/navigation/app-nav';
import { cn } from '@/lib/utils';

/**
 * The one menu of the app (lib/navigation/app-nav.ts says what is in it and where it shows).
 * - computer: menu always visible on the left, except on full-screen operation (comanda, kitchen)
 * - phone, and full-screen operation: top bar with a button that opens the same menu
 * The computer layout comes from CSS breakpoints (md:), so the first paint is already right.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const { data: session, status } = useSession() || ({} as any);
  const mode = shellMode(pathname);
  const [open, setOpen] = useState(false);
  const isDesktop = useIsDesktop();

  // Close the drawer when the page changes
  useEffect(() => setOpen(false), [pathname]);

  if (mode === 'none' || status === 'unauthenticated') return <>{children}</>;

  const user = session?.user as { name?: string | null; role?: string } | undefined;
  const groups = navFor(user?.role, user?.role === 'ADMIN');
  const active = activeHref(groups, pathname);
  const sidebar = mode === 'sidebar';
  // The bell polls: mount it once, in the pinned menu on a computer, in the top bar otherwise
  const bellInMenu = sidebar && isDesktop === true;
  const bellInTopBar = isDesktop !== null && !bellInMenu;

  return (
    <>
      <header
        className={cn(
          'fixed top-0 inset-x-0 z-40 h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 px-3',
          sidebar && 'md:hidden'
        )}
      >
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Abrir menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0 flex-1">
          <ChefHat className="h-5 w-5 text-red-600 shrink-0" />
          <span className="font-semibold truncate">Gastrux</span>
        </Link>
        {bellInTopBar && <NotificationCenter />}
      </header>

      {open && <div className={cn('fixed inset-0 z-50 bg-black/50', sidebar && 'md:hidden')} onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-72 flex flex-col bg-gradient-to-b from-slate-900 to-slate-800 text-white transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
          sidebar && 'md:z-30 md:w-64 md:translate-x-0'
        )}
        aria-label="Menu principal"
      >
        <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-2 shrink-0">
          <ChefHat className="h-7 w-7 text-red-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight">Gastrux</p>
            <p className="text-xs text-slate-400 truncate">{user?.name || 'Gestão Integrada'}</p>
          </div>
          {bellInMenu && (
            <div className="text-slate-200 [&_button]:text-slate-200">
              <NotificationCenter />
            </div>
          )}
          <button
            onClick={() => setOpen(false)}
            className={cn('p-1 rounded hover:bg-slate-700', sidebar && 'md:hidden')}
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {groups.map((g) => (
            <NavSection key={g.id} group={g} active={active} />
          ))}
        </nav>

        <div className="p-3 border-t border-slate-700 space-y-1 shrink-0">
          <Link href="/conta" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700">
            <UserCog className="h-4 w-4" /> Minha conta e senha
          </Link>
          <button
            onClick={() => signOutSafely({ redirect: true, callbackUrl: '/auth/signin' })}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <div className={cn('pt-14', sidebar && 'md:pt-0 md:pl-64')}>{children}</div>
    </>
  );
}

function NavSection({ group, active }: { group: NavGroup; active: string | null }) {
  const containsActive = group.links.some((l) => l.href === active);
  const [expanded, setExpanded] = useState(containsActive);
  useEffect(() => {
    if (containsActive) setExpanded(true);
  }, [containsActive]);

  // A group with a single link is just that link ("Início", "Fiscal")
  if (group.links.length === 1) {
    const l = group.links[0];
    return <NavItem href={l.href} label={group.id === 'inicio' ? group.label : l.label} active={l.href === active} strong />;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium',
          containsActive ? 'text-white' : 'text-slate-300 hover:bg-slate-700'
        )}
        aria-expanded={expanded}
      >
        {group.label}
        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="ml-2 pl-2 border-l border-slate-700 space-y-0.5 mt-0.5 mb-1">
          {group.links.map((l) => (
            <NavItem key={l.href} href={l.href} label={l.label} active={l.href === active} />
          ))}
        </div>
      )}
    </div>
  );
}

function NavItem({ href, label, active, strong }: { href: string; label: string; active: boolean; strong?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'block px-3 py-2 rounded-lg text-sm transition-colors',
        strong && 'font-medium',
        active ? 'bg-blue-600 text-white' : strong ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700'
      )}
    >
      {label}
    </Link>
  );
}

/** null until mounted (the server cannot know the width) */
function useIsDesktop(): boolean | null {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}
