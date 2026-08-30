'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Stagger, StaggerItem } from '@/components/ui/animate';

interface DashboardWrapperProps {
  children: React.ReactNode;
}

export const DashboardWrapper: React.FC<DashboardWrapperProps> = ({ children }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{
        duration: 0.3,
        ease: 'easeInOut',
      }}
      className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-950 dark:to-slate-900/50"
    >
      {children}
    </motion.div>
  );
};
