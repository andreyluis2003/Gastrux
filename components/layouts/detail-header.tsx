'use client';

import { ReactNode } from 'react';
import { Breadcrumb, BreadcrumbItem } from '@/components/ui/breadcrumb';
import { BackButton } from '@/components/ui/back-button';

interface DetailHeaderProps {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  icon?: ReactNode;
  actions?: ReactNode;
}

export function DetailHeader({
  title,
  description,
  breadcrumb = [],
  icon,
  actions,
}: DetailHeaderProps) {
  return (
    <div className="mb-8">
      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <div className="mb-4">
          <Breadcrumb items={breadcrumb} />
        </div>
      )}

      {/* Header with Title and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          {icon && (
            <div className="hidden sm:block">
              <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg">
                {icon}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-2">
              {icon && <div className="sm:hidden p-2 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg">{icon}</div>}
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
            </div>
            {description && (
              <p className="text-gray-600 dark:text-gray-400">{description}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-gray-200 to-transparent dark:from-gray-700"></div>
    </div>
  );
}
