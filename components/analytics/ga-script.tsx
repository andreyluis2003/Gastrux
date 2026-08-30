'use client';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-PLACEHOLDER';

/**
 * Google Analytics 4 Script Component
 * Initializes GA4 tracking for the application
 * 
 * Add this component to your root layout
 * Measurement ID is read from NEXT_PUBLIC_GA_MEASUREMENT_ID environment variable
 */
export function GAScript() {
  // If using placeholder, log a warning
  if (GA_MEASUREMENT_ID === 'G-PLACEHOLDER') {
    console.warn(
      'Google Analytics is configured with a placeholder Measurement ID. ' +
      'Please set NEXT_PUBLIC_GA_MEASUREMENT_ID in your .env.local file.'
    );
  }

  return (
    <>
      {/* Google tag (gtag.js) */}
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', {
              'send_page_view': true,
              'anonymize_ip': true,
              'allow_google_signals': false,
              'allow_ad_personalization_signals': false
            });
          `,
        }}
      />
    </>
  );
}
