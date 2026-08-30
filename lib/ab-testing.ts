// @ts-nocheck
/**
 * A/B Testing Utility for Landing Page Experiments
 * Implements simple A/B testing with variant selection and tracking
 */

export type ABTestVariant = 'control' | 'variant-a' | 'variant-b';

export interface ABTestConfig {
  testId: string;
  variants: {
    control: string;
    'variant-a': string;
    'variant-b'?: string;
  };
  weights?: {
    control: number;
    'variant-a': number;
    'variant-b'?: number;
  };
  description?: string;
}

/**
 * Get or create a consistent variant for a user
 * Uses localStorage to persist variant for the user session
 */
export function getVariant(testId: string, variantWeights?: Record<string, number>): ABTestVariant {
  const storedKey = `ab-test-${testId}`;
  
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(storedKey);
    if (stored) {
      return stored as ABTestVariant;
    }
  }

  // Default weights: 50% control, 25% each variant
  const weights = variantWeights || {
    'control': 0.5,
    'variant-a': 0.25,
    'variant-b': 0.25,
  };

  const rand = Math.random();
  let cumulative = 0;
  
  for (const [variant, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (rand < cumulative) {
      const selectedVariant = variant as ABTestVariant;
      if (typeof window !== 'undefined') {
        localStorage.setItem(storedKey, selectedVariant);
      }
      return selectedVariant;
    }
  }

  const fallback = 'control' as ABTestVariant;
  if (typeof window !== 'undefined') {
    localStorage.setItem(storedKey, fallback);
  }
  return fallback;
}

/**
 * Get the content for the current variant
 */
export function getVariantContent(config: ABTestConfig): string {
  const variant = getVariant(config.testId, config.weights);
  return config.variants[variant] || config.variants.control;
}

/**
 * A/B Testing experiments for landing page
 */
export const AB_TESTS = {
  HERO_HEADLINE: {
    testId: 'hero-headline',
    variants: {
      control: 'Troque o caderno pelo controle de verdade',
      'variant-a': 'Você sabe quanto lucra por prato? Descubra em 10 min',
      'variant-b': 'Chega de caderno. Seu restaurante merece mais.',
    },
    description: 'Test different hero headlines for conversion',
  } as ABTestConfig,

  HERO_CTA_PRIMARY: {
    testId: 'hero-cta-primary',
    variants: {
      control: 'Trocar o Caderno Agora',
      'variant-a': 'Começar Grátis em 10 Min',
      'variant-b': 'Ver Meu Lucro Real',
    },
    description: 'Test primary CTA button text',
  } as ABTestConfig,

  HERO_CTA_SECONDARY: {
    testId: 'hero-cta-secondary',
    variants: {
      control: 'Ver Como Funciona',
      'variant-a': 'Calcular Meu Lucro',
      'variant-b': 'Quero Saber Mais',
    },
    description: 'Test secondary CTA button text',
  } as ABTestConfig,

  FINAL_CTA_HEADLINE: {
    testId: 'final-cta-headline',
    variants: {
      control: 'Seu restaurante merece mais que um caderno',
      'variant-a': 'Chega de adivinhar se está lucrando ou não',
      'variant-b': 'Troque o caderno. Veja seu lucro de verdade.',
    },
    description: 'Test final CTA section headline',
  } as ABTestConfig,

  FINAL_CTA_BUTTON: {
    testId: 'final-cta-button',
    variants: {
      control: 'Criar Conta Grátis',
      'variant-a': 'Comece Agora',
      'variant-b': 'Teste Gratuitamente',
    },
    description: 'Test final CTA button text',
  } as ABTestConfig,

  HERO_DESCRIPTION: {
    testId: 'hero-description',
    variants: {
      control: 'Você sabe quanto custa cada prato que serve? Com a Gastrux, em 10 minutos você descobre — e nunca mais precisa de caderno, planilha ou calculadora.',
      'variant-a': 'Se você ainda anota no caderno ou na planilha, está perdendo dinheiro sem saber. A Gastrux mostra seu lucro real em cada prato.',
      'variant-b': 'Pare de adivinhar se está lucrando. A Gastrux calcula seu CMV, controla estoque e mostra onde você perde dinheiro — tudo no celular.',
    },
    description: 'Test hero description text',
  } as ABTestConfig,
};

/**
 * Track A/B test event
 */
export function trackABTestVariant(testId: string, variant: ABTestVariant) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'ab_test_variant', {
      'test_id': testId,
      'variant': variant,
      'event_category': 'conversion',
    });
  }
}

/**
 * Track A/B test conversion
 */
export function trackABTestConversion(testId: string, variant: ABTestVariant) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'ab_test_conversion', {
      'test_id': testId,
      'variant': variant,
      'event_category': 'conversion',
    });
  }
}

/**
 * Hook helper for A/B tests
 */
export function useABTest(config: ABTestConfig) {
  const variant = getVariant(config.testId, config.weights);
  const content = config.variants[variant] || config.variants.control;
  
  // Track variant assignment
  if (typeof window !== 'undefined') {
    trackABTestVariant(config.testId, variant);
  }

  return {
    variant,
    content,
    isControl: variant === 'control',
    isVariantA: variant === 'variant-a',
    isVariantB: variant === 'variant-b',
  };
}
