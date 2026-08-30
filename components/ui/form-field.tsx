'use client';

import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface FormFieldProps {
  label?: string;
  error?: string;
  success?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  error,
  success,
  hint,
  required = false,
  children,
  className,
}: FormFieldProps) {
  const hasError = !!error;
  const hasSuccess = !!success && !error;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <label className="text-sm font-medium text-foreground flex items-center gap-1">
          {label}
          {required && <span className="text-destructive">*</span>}
        </label>
      )}

      <div className="flex flex-col gap-1">
        {children}

        {hasError && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </div>
        )}

        {hasSuccess && (
          <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-500">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{success}</span>
          </div>
        )}

        {hint && !hasError && (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}
