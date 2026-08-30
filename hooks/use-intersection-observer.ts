'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Hook for detecting when an element enters the viewport
 * Useful for triggering analytics events when sections become visible
 */
export function useIntersectionObserver(options = {}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.unobserve(entry.target);
      }
    }, {
      threshold: 0.1,
      ...options
    });

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => {
      if (elementRef.current) {
        observer.unobserve(elementRef.current);
      }
      observer.disconnect();
    };
  }, [options]);

  return { elementRef, isVisible };
}
