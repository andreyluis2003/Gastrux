'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type SkeletonVariant = 'card' | 'text' | 'avatar' | 'button' | 'custom';

interface LoadingSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  count?: number;
  width?: string;
  height?: string;
}

const skeletonVariants: Record<SkeletonVariant, string> = {
  card: 'h-40 rounded-xl',
  text: 'h-4 rounded w-full',
  avatar: 'h-10 w-10 rounded-full',
  button: 'h-10 rounded-lg w-24',
  custom: '',
};

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  variant = 'text',
  count = 1,
  width,
  height,
  className,
}) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className={cn(
            'bg-gradient-to-r from-muted via-muted/50 to-muted rounded-lg',
            skeletonVariants[variant],
            width,
            height,
            className
          )}
          animate={{
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

/**
 * Loading Card Skeleton - Simulates a full card layout
 */
export const LoadingCardSkeleton: React.FC<{ count?: number }> = ({
  count = 1,
}) => {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 bg-card border border-border rounded-xl p-4">
          <LoadingSkeleton variant="text" height="h-6" width="w-1/3" />
          <LoadingSkeleton variant="text" count={2} />
          <div className="flex gap-2 pt-2">
            <LoadingSkeleton variant="button" />
            <LoadingSkeleton variant="button" />
          </div>
        </div>
      ))}
    </div>
  );
};
