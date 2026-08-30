'use client';

import React from 'react';
import { Button, ButtonProps } from './button';

interface AccessibleButtonProps extends ButtonProps {
  /**
   * Aria label for screen readers (required if icon-only)
   */
  ariaLabel?: string;
  /**
   * Description for additional context (shown in title)
   */
  description?: string;
}

const AccessibleButton = React.forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  ({ ariaLabel, description, children, title, className, ...props }, ref) => {
    const isIconOnly = !children || (typeof children === 'string' && children.trim() === '');

    if (isIconOnly && !ariaLabel) {
      console.warn(
        'AccessibleButton: Icon-only buttons must have an ariaLabel prop for screen reader accessibility.'
      );
    }

    return (
      <Button
        ref={ref}
        aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
        title={description || title}
        className={className}
        {...props}
      >
        {children}
      </Button>
    );
  }
);

AccessibleButton.displayName = 'AccessibleButton';

export { AccessibleButton };
