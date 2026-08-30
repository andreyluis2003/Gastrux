'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MobileOptimizedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export function MobileOptimizedButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: MobileOptimizedButtonProps) {
  const baseStyles = 'font-medium rounded-lg transition-colors active:scale-95 disabled:opacity-50';
  
  const sizeStyles = {
    sm: 'px-3 py-2 text-sm min-h-10',
    md: 'px-4 py-2.5 text-base min-h-11',
    lg: 'px-6 py-3 text-base min-h-12',
  };

  const variantStyles = {
    primary: 'bg-primary text-white hover:bg-primary/90 active:bg-primary/80',
    secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-white',
    outline: 'border border-slate-200 text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:text-white',
  };

  return (
    <button
      className={cn(
        baseStyles,
        sizeStyles[size],
        variantStyles[variant],
        'touch-target-48', // Ensure 48px minimum touch target
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
