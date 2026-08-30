'use client';

import { useI18n, SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { Globe } from 'lucide-react';
import { useState } from 'react';

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={t('nav.language' as any)}
        aria-label={t('nav.language' as any)}
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm font-medium">{language}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                language === lang.code
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              } ${lang.code === 'pt-BR' ? 'rounded-t-lg' : ''} ${lang.code === 'es' ? 'rounded-b-lg' : ''}`}
              aria-current={language === lang.code ? 'true' : 'false'}
            >
              {lang.name}
            </button>
          ))}
        </div>
      )}

      {/* Close dropdown when clicking outside */}
      {isOpen && (
        <div
          className="fixed inset-0"
          onClick={() => setIsOpen(false)}
          style={{ zIndex: 40 }}
        />
      )}
    </div>
  );
}
