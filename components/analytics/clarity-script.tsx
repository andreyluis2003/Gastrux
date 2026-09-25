'use client';

/**
 * Microsoft Clarity session-recording/heatmap script.
 * Rendered only on specific marketing pages (not the whole app) - see
 * app/page.tsx and app/pricing/page.tsx.
 */
export function ClarityScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "yhfo72fb0t");
        `,
      }}
    />
  );
}
