'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardProps } from './card';

interface MotionCardProps extends CardProps {
  disableMotion?: boolean;
  hoverLift?: boolean;
}

const MotionCard = React.forwardRef<HTMLDivElement, MotionCardProps>(
  ({ disableMotion = false, hoverLift = true, children, ...props }, ref) => {
    if (disableMotion) {
      return (
        <Card ref={ref} {...props}>
          {children}
        </Card>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={hoverLift ? { y: -4 } : undefined}
        transition={{
          default: { duration: 0.3, ease: 'easeOut' },
          y: { type: 'spring', stiffness: 300, damping: 25 },
        }}
      >
        <Card ref={ref} {...props}>
          {children}
        </Card>
      </motion.div>
    );
  }
);

MotionCard.displayName = 'MotionCard';

export { MotionCard };
