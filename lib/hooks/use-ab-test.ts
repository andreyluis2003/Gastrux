// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';

type TestVariant = 'control' | 'variant-a' | 'variant-b';

interface ABTestConfig {
  testId: string;
  variants: TestVariant[];
  weights?: Record<TestVariant, number>; // e.g. { 'control': 0.5, 'variant-a': 0.3, 'variant-b': 0.2 }
}

const STORAGE_KEY = 'ab_tests';

/**
 * Hook para gerenciar A/B testing
 * Persiste a variante no localStorage para consistência entre sessões
 */
export function useABTest({ testId, variants, weights }: ABTestConfig): TestVariant {
  const [variant, setVariant] = useState<TestVariant>('control');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Recuperar variante armazenada
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      const tests = stored ? JSON.parse(stored) : {};

      if (tests[testId]) {
        setVariant(tests[testId]);
        setIsLoaded(true);
        return;
      }

      // Gerar nova variante
      const random = Math.random();
      const normalizedWeights = weights || Object.fromEntries(
        variants.map(v => [v, 1 / variants.length])
      ) as Record<TestVariant, number>;

      let cumulativeWeight = 0;
      let selectedVariant = variants[0];

      for (const v of variants) {
        cumulativeWeight += normalizedWeights[v] || 0;
        if (random <= cumulativeWeight) {
          selectedVariant = v;
          break;
        }
      }

      // Armazenar
      tests[testId] = selectedVariant;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tests));
      setVariant(selectedVariant);
    }
    setIsLoaded(true);
  }, [testId, variants, weights]);

  return isLoaded ? variant : 'control';
}

/**
 * Função auxiliar para registrar evento de conversão/interação
 */
export function trackABTestEvent(
  testId: string,
  eventName: string,
  metadata?: Record<string, any>
) {
  if (typeof window !== 'undefined') {
    // Enviar para API de analytics
    fetch('/api/analytics/ab-test-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testId,
        eventName,
        variant: localStorage.getItem(STORAGE_KEY)
          ? JSON.parse(localStorage.getItem(STORAGE_KEY)!)[testId]
          : 'control',
        metadata,
        timestamp: new Date().toISOString(),
      }),
    }).catch(err => console.warn('[A/B Test] Failed to track event:', err));
  }
}
