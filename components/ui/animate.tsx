'use client';

import React from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';

// ==================== PRESET VARIANTS ====================

const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: { duration: 0.2 },
  },
};

const slideInUpVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    y: 20,
    transition: { duration: 0.2 },
  },
};

const slideInLeftVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: 0.2 },
  },
};

const slideInRightVariants: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.2 },
  },
};

const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 },
  },
};

// ==================== ANIMATION COMPONENTS ====================

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const FadeIn: React.FC<FadeInProps> = ({ children, className = '', delay = 0 }) => (
  <motion.div
    className={className}
    initial="hidden"
    animate="visible"
    exit="exit"
    variants={fadeInVariants}
    transition={{ delay }}
  >
    {children}
  </motion.div>
);

interface ScaleInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const ScaleIn: React.FC<ScaleInProps> = ({ children, className = '', delay = 0 }) => (
  <motion.div
    className={className}
    initial="hidden"
    animate="visible"
    exit="exit"
    variants={scaleInVariants}
    transition={{ delay }}
  >
    {children}
  </motion.div>
);

interface SlideInProps {
  children: React.ReactNode;
  className?: string;
  direction?: 'up' | 'left' | 'right';
  delay?: number;
}

export const SlideIn: React.FC<SlideInProps> = ({
  children,
  className = '',
  direction = 'up',
  delay = 0,
}) => {
  const variantsMap = {
    up: slideInUpVariants,
    left: slideInLeftVariants,
    right: slideInRightVariants,
  };

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={variantsMap[direction]}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
};

interface StaggerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

export const Stagger: React.FC<StaggerProps> = ({
  children,
  className = '',
  staggerDelay = 0.1,
}) => (
  <motion.div
    className={className}
    initial="hidden"
    animate="visible"
    variants={staggerContainerVariants}
    transition={{ staggerChildren: staggerDelay }}
  >
    {children}
  </motion.div>
);

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
}

export const StaggerItem: React.FC<StaggerItemProps> = ({ children, className = '' }) => (
  <motion.div className={className} variants={staggerItemVariants}>
    {children}
  </motion.div>
);

interface HoverLiftProps {
  children: React.ReactNode;
  className?: string;
  lift?: number;
}

export const HoverLift: React.FC<HoverLiftProps> = ({
  children,
  className = '',
  lift = 8,
}) => (
  <motion.div
    className={className}
    whileHover={{ y: -lift }}
    transition={{ duration: 0.2 }}
  >
    {children}
  </motion.div>
);

interface PressScaleProps {
  children: React.ReactNode;
  className?: string;
  scale?: number;
}

export const PressScale: React.FC<PressScaleProps> = ({
  children,
  className = '',
  scale = 0.95,
}) => (
  <motion.div
    className={className}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale }}
    transition={{ duration: 0.1 }}
  >
    {children}
  </motion.div>
);

interface SkeletonPulseProps {
  className?: string;
  count?: number;
}

export const SkeletonPulse: React.FC<SkeletonPulseProps> = ({
  className = 'w-full h-12',
  count = 1,
}) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <motion.div
        key={i}
        className={`bg-muted rounded-lg ${className}`}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    ))}
  </div>
);

// ==================== EXPORT VARIANTS ====================

export {
  fadeInVariants,
  scaleInVariants,
  slideInUpVariants,
  slideInLeftVariants,
  slideInRightVariants,
  staggerContainerVariants,
  staggerItemVariants,
};
