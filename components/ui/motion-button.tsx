'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Button, ButtonProps } from './button';

interface MotionButtonProps extends ButtonProps {
  disableMotion?: boolean;
}

const MotionButton = React.forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ disableMotion = false, children, ...props }, ref) => {
    if (disableMotion) {
      return (
        <Button ref={ref} {...props}>
          {children}
        </Button>
      );
    }

    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 10,
        }}
      >
        <Button ref={ref} {...props}>
          {children}
        </Button>
      </motion.div>
    );
  }
);

MotionButton.displayName = 'MotionButton';

export { MotionButton };
