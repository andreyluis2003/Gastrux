'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type GradientVariant = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'vibrant';

interface GradientSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: GradientVariant;
}

const gradientVariants: Record<GradientVariant, string> = {
  primary: 'bg-gradient-to-br from-primary via-primary/80 to-primary/60',
  success: 'bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500',
  warning: 'bg-gradient-to-br from-yellow-500 via-orange-500 to-red-500',
  error: 'bg-gradient-to-br from-red-500 via-pink-500 to-rose-500',
  info: 'bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500',
  vibrant: 'bg-gradient-to-br from-purple-500 via-pink-500 to-red-500',
};

export const GradientSection = React.forwardRef<
  HTMLDivElement,
  GradientSectionProps
>(({ children, className, variant = 'primary' }, ref) => {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'relative rounded-2xl p-8 overflow-hidden',
        'shadow-2xl',
        gradientVariants[variant],
        className
      )}
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 opacity-20">
        <motion.div
          animate={{
            rotate: 360,
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        />
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
});

GradientSection.displayName = 'GradientSection';
