'use client';

import { useEffect } from 'react';
import { reportWebVitals } from '@/lib/web-vitals-reporter';

/**
 * Componente para otimizações de performance globais
 * - Preload de recursos críticos
 * - Resource hints
 * - Web Vitals tracking
 */
export function PerformanceOptimizations() {
  useEffect(() => {
    const addedLinks: HTMLLinkElement[] = [];

    // Preconect para domínios externos críticos
    const preconnect = (href: string) => {
      // Avoid duplicates
      if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = href;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      addedLinks.push(link);
    };

    // Prefetch rotas críticas
    const prefetchRoute = (href: string) => {
      if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.as = 'fetch';
      document.head.appendChild(link);
      addedLinks.push(link);
    };

    // Aplicar otimizações
    if (process.env.NEXT_PUBLIC_API_URL) {
      preconnect(process.env.NEXT_PUBLIC_API_URL);
    }

    // Prefetch de rotas frequentemente visitadas
    const frequentRoutes = ['/dashboard', '/estoque', '/receitas', '/alertas'];
    const timeouts: NodeJS.Timeout[] = [];
    frequentRoutes.forEach(route => {
      const t = setTimeout(() => prefetchRoute(route), 2000);
      timeouts.push(t);
    });

    // Registrar Web Vitals
    try {
      reportWebVitals();
    } catch {
      // Silently ignore - web vitals is optional
    }

    // Cleanup: remove all links we added
    return () => {
      timeouts.forEach(t => clearTimeout(t));
      addedLinks.forEach(link => {
        try {
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
        } catch {
          // Ignore if already removed
        }
      });
    };
  }, []);

  return null;
}
