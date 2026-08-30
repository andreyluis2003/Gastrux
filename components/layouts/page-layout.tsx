'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  title,
  subtitle,
  action,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{
        duration: 0.3,
        ease: 'easeInOut',
      }}
      className="min-h-screen"
    >
      {/* Header */}
      {(title || subtitle || action) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-40"
        >
          <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 flex items-center justify-between">
            <div>
              {title && (
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{title}</h1>
              )}
              {subtitle && (
                <p className="text-sm sm:text-base text-muted-foreground mt-1">{subtitle}</p>
              )}
            </div>
            {action && <div className="flex items-center gap-2">{action}</div>}
          </div>
        </motion.div>
      )}

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </motion.div>
  );
};
