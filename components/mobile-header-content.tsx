'use client';

import { useSession } from 'next-auth/react';
import { Bell, Moon, Sun, BellRing, Globe } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { useI18n, SUPPORTED_LANGUAGES } from '@/lib/i18n';

export function MobileHeaderContent() {
  const { data: session } = useSession() || {};
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useI18n();
  const [notificationCount, setNotificationCount] = useState(0);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

  useEffect(() => {
    // Check if push notifications are enabled
    const checkPushStatus = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsPushEnabled(!!subscription);
      } catch (error) {
        console.error('Error checking push status:', error);
      }
    };

    checkPushStatus();
  }, []);

  return (
    <div className="md:hidden fixed top-0 right-0 left-0 h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between pl-14 pr-4 z-30">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 dark:text-white truncate text-sm">
          {session?.user?.name || 'Usuário'}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Gestão de Produção</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Push Notification Indicator */}
        {isPushEnabled && (
          <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20" title="Notificações push ativas">
            <BellRing className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
        )}

        {/* Notification Bell */}
        <button className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <Bell className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-600 rounded-full" />
          )}
        </button>

        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => setIsLanguageOpen(!isLanguageOpen)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="Idioma"
          >
            <Globe className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </button>
          {isLanguageOpen && (
            <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsLanguageOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    language === lang.code
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  } ${lang.code === 'pt-BR' ? 'rounded-t-lg' : ''} ${lang.code === 'es' ? 'rounded-b-lg' : ''}`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5 text-slate-400" />
          ) : (
            <Moon className="h-5 w-5 text-slate-600" />
          )}
        </button>
      </div>
    </div>
  );
}
