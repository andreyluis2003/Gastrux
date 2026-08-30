// @ts-nocheck
/**
 * Google Analytics 4 Utility Functions
 * Helper functions for common GA4 tracking scenarios
 */

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-PLACEHOLDER';

/**
 * Check if GA4 is properly configured
 */
export function isGAConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  return GA_MEASUREMENT_ID !== 'G-PLACEHOLDER' && !!window.gtag;
}

/**
 * Landing page conversion tracking constants
 */
export const GA_EVENTS = {
  // Landing page CTAs
  CTA_HERO_GET_STARTED: 'cta_hero_get_started',
  CTA_HERO_VIEW_FEATURES: 'cta_hero_view_features',
  CTA_FINAL_GET_STARTED: 'cta_final_get_started',
  
  // Feature engagement
  FEATURE_CARD_VIEW: 'feature_card_view',
  FEATURE_CARD_CLICK: 'feature_card_click',
  PRICING_TIER_VIEW: 'pricing_tier_view',
  PRICING_TIER_SELECT: 'pricing_tier_select',
  
  // Testimonial engagement
  TESTIMONIAL_VIEW: 'testimonial_view',
  TESTIMONIAL_EXPAND: 'testimonial_expand',
  
  // Form submissions
  SIGNUP_FORM_START: 'signup_form_start',
  SIGNUP_FORM_COMPLETE: 'signup_form_complete',
  SIGNIN_FORM_COMPLETE: 'signin_form_complete',
  
  // Navigation
  NAVIGATION_CLICK: 'navigation_click',
  FOOTER_LINK_CLICK: 'footer_link_click',
  
  // Scroll tracking
  PAGE_SCROLL: 'page_scroll',
  SECTION_VIEW: 'section_view',
  
  // Time tracking
  PAGE_TIME_ON_PAGE: 'time_on_page',
  
  // User engagement
  DEMO_REQUEST: 'demo_request',
  WEBINAR_REGISTER: 'webinar_register',
  DOCS_ACCESS: 'docs_access',
  
  // Dashboard/App usage
  MODULE_ACCESS: 'module_access',
  FEATURE_USAGE: 'feature_usage',
  DATA_EXPORT: 'data_export',
};

/**
 * Common GA4 event parameters
 */
export const GA_PARAMS = {
  // CTA button variants
  CTA_VARIANT_PRIMARY: 'primary',
  CTA_VARIANT_SECONDARY: 'secondary',
  CTA_VARIANT_OUTLINE: 'outline',
  
  // Sections
  SECTION_HERO: 'hero',
  SECTION_FEATURES: 'features',
  SECTION_PRICING: 'pricing',
  SECTION_TESTIMONIALS: 'testimonials',
  SECTION_CTA: 'final_cta',
  SECTION_FOOTER: 'footer',
  
  // Pricing tiers
  PRICING_TIER_STARTER: 'starter',
  PRICING_TIER_PROFESSIONAL: 'professional',
  PRICING_TIER_ENTERPRISE: 'enterprise',
};
