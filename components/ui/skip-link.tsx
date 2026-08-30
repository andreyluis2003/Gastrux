'use client';

import React from 'react';

interface SkipLinkProps {
  /**
   * The target ID to skip to
   */
  targetId?: string;
}

/**
 * Skip Link Component for keyboard navigation accessibility
 * Allows users to skip repetitive navigation content
 * Visible only when focused (keyboard navigation)
 */
export const SkipLink: React.FC<SkipLinkProps> = ({
  targetId = 'main-content',
}) => {
  return (
    <a
      href={`#${targetId}`}
      className="absolute top-0 left-0 -translate-y-full focus:translate-y-0 bg-primary text-primary-foreground px-4 py-2 rounded-b-lg transition-transform focus:z-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
      aria-label="Skip to main content"
    >
      Skip to main content
    </a>
  );
};
