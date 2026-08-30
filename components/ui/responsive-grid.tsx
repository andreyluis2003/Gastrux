'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveGridProps {
  children: ReactNode;
  cols?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

const gapMap = {
  sm: 'gap-2 sm:gap-3',
  md: 'gap-3 sm:gap-4',
  lg: 'gap-4 sm:gap-6',
};

const colsMap = {
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

export function ResponsiveGrid({
  children,
  cols = { mobile: 1, tablet: 2, desktop: 3 },
  gap = 'md',
  className,
}: ResponsiveGridProps) {
  const gridColsClass = `grid-cols-${cols.mobile} sm:grid-cols-${cols.tablet} lg:grid-cols-${cols.desktop}`;
  
  return (
    <div
      className={cn(
        'grid',
        gapMap[gap],
        className
      )}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(250px, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}
