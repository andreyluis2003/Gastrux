'use client';

import { useI18n } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/translations';
import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface I18nPageHeaderProps {
  titleKey: string;
  subtitleKey: string;
  backHref?: string;
  children?: React.ReactNode;
}

export function I18nPageHeader({ titleKey, subtitleKey, backHref = '/dashboard', children }: I18nPageHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <BackButton href={backHref} label={t('common.back')} />
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold">{t(titleKey as TranslationKey)}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t(subtitleKey as TranslationKey)}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// Reusable translated button with Plus icon for server components
export function I18nButton({ labelKey, className }: { labelKey: string; className?: string }) {
  const { t } = useI18n();
  return (
    <Button className={className || "w-full sm:w-auto"}>
      <Plus className="mr-2 h-4 w-4" />
      {t(labelKey as TranslationKey)}
    </Button>
  );
}

// Reusable translated text for server components
export function I18nText({ translationKey, className }: { translationKey: string; className?: string }) {
  const { t } = useI18n();
  return <span className={className}>{t(translationKey as TranslationKey)}</span>;
}
