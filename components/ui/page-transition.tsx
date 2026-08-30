'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface PageTransitionProps {
  children: React.ReactNode;
  duration?: number;
}

export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  duration = 0.3,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{
        duration,
        ease: 'easeInOut',
      }}
    >
      {children}
    </motion.div>
  );
};
