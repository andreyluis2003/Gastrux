'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  animated?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, className, animated = true, ...props }, ref) => {
    const content = (
      <div
        ref={ref}
        className={cn(
          'bg-white/10 dark:bg-slate-900/20 backdrop-blur-md border border-white/20 dark:border-slate-700/30',
          'rounded-xl p-6 shadow-xl hover:shadow-2xl transition-shadow',
          'hover:border-white/30 dark:hover:border-slate-600/50',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );

    if (animated) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4 }}
          transition={{
            default: { duration: 0.3 },
            y: { type: 'spring', stiffness: 300, damping: 25 },
          }}
        >
          {content}
        </motion.div>
      );
    }

    return content;
  }
);

GlassCard.displayName = 'GlassCard';
