'use client';

import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const headingVariants = cva('font-bold leading-tight tracking-tight', {
  variants: {
    level: {
      h1: 'text-4xl sm:text-5xl font-bold',
      h2: 'text-3xl sm:text-4xl font-bold',
      h3: 'text-2xl sm:text-3xl font-semibold',
      h4: 'text-xl sm:text-2xl font-semibold',
      h5: 'text-lg sm:text-xl font-semibold',
      h6: 'text-base sm:text-lg font-semibold',
    },
  },
  defaultVariants: {
    level: 'h2',
  },
});

interface AccessibleHeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  level?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  ariaLabel?: string;
}

const AccessibleHeading = React.forwardRef<HTMLHeadingElement, AccessibleHeadingProps>(
  ({ level = 'h2', className, ariaLabel, children, ...props }, ref) => {
    const Comp = level as keyof JSX.IntrinsicElements;

    const headingProps = {
      className: cn(headingVariants({ level, className })),
      'aria-label': ariaLabel,
      ref,
      ...props,
    };

    return React.createElement(Comp, headingProps, children);
  }
);

AccessibleHeading.displayName = 'AccessibleHeading';

export { AccessibleHeading, headingVariants };
