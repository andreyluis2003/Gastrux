'use client';

import { useEffect } from 'react';

/**
 * GA4 Analytics Hook
 * Provides functions to track custom events and page views
 * 
 * Usage:
 * const { trackEvent, trackPageView } = useAnalytics();
 * trackEvent('purchase', { value: 99.99, currency: 'BRL' });
 */

export function useAnalytics() {
  useEffect(() => {
    // Initialize GA4 tracking
    if (typeof window !== 'undefined' && window.gtag) {
      // Page view is automatically tracked by gtag.js
      window.gtag('consent', 'default', {
        'analytics_storage': 'granted'
      });
    }
  }, []);

  /**
   * Track a custom event
   * @param eventName - Name of the event (e.g., 'purchase', 'signup', 'scroll')
   * @param eventData - Additional event parameters
   */
  const trackEvent = (eventName: string, eventData?: Record<string, any>) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, eventData);
    }
  };

  /**
   * Track a conversion (key event)
   * @param conversionName - Name of the conversion
   * @param value - Optional monetary value
   * @param currency - Currency code (default: 'BRL')
   */
  const trackConversion = (conversionName: string, value?: number, currency: string = 'BRL') => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'conversion', {
        'event_category': 'conversion',
        'event_label': conversionName,
        ...(value && { 'value': value, 'currency': currency })
      });
    }
  };

  /**
   * Track a page view
   * @param pagePath - Path of the page
   * @param pageTitle - Title of the page
   */
  const trackPageView = (pagePath: string, pageTitle: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'page_view', {
        'page_path': pagePath,
        'page_title': pageTitle
      });
    }
  };

  /**
   * Track CTA clicks
   * @param ctaName - Name of the CTA button
   * @param destination - Where the CTA leads
   */
  const trackCTAClick = (ctaName: string, destination: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'cta_click', {
        'cta_name': ctaName,
        'destination': destination,
        'event_category': 'engagement'
      });
    }
  };

  /**
   * Track scroll depth
   * @param scrollPercentage - Percentage of page scrolled (0-100)
   */
  const trackScrollDepth = (scrollPercentage: number) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'scroll_depth', {
        'scroll_percentage': scrollPercentage,
        'event_category': 'engagement'
      });
    }
  };

  /**
   * Track feature view
   * @param featureName - Name of the feature
   */
  const trackFeatureView = (featureName: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'view_feature', {
        'feature_name': featureName,
        'event_category': 'engagement'
      });
    }
  };

  /**
   * Track signup
   * @param method - Method of signup (e.g., 'email', 'google')
   */
  const trackSignup = (method: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'sign_up', {
        'method': method,
        'event_category': 'conversion'
      });
    }
  };

  /**
   * Track login
   * @param method - Method of login (e.g., 'email', 'google')
   */
  const trackLogin = (method: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'login', {
        'method': method,
        'event_category': 'conversion'
      });
    }
  };

  return {
    trackEvent,
    trackConversion,
    trackPageView,
    trackCTAClick,
    trackScrollDepth,
    trackFeatureView,
    trackSignup,
    trackLogin
  };
}

// Extend window object for gtag
declare global {
  interface Window {
    gtag: any;
    dataLayer: any[];
  }
}
