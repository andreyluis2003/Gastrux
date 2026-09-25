'use client';

/**
 * Prints a /imprimir/* page without leaving the current screen: the page is loaded in a hidden
 * iframe, which prints itself once its data is ready (?auto=1) and tells us when it is done.
 * An iframe is not blocked like a pop-up, so the KDS can print new orders by itself. With Chrome
 * started with --kiosk-printing on the kitchen computer, the print dialog is skipped too.
 */
export function printInHiddenFrame(path: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.src = `${path}${path.includes('?') ? '&' : '?'}auto=1`;
  const cleanup = () => {
    window.removeEventListener('message', onMessage);
    frame.remove();
  };
  const onMessage = (event: MessageEvent) => {
    if (event.source === frame.contentWindow && event.data?.type === 'gastrux:print-done') cleanup();
  };
  window.addEventListener('message', onMessage);
  setTimeout(cleanup, 120_000);
  document.body.appendChild(frame);
}

/** Called by a /imprimir/* page when its content is ready. */
export function printWhenReady() {
  const done = () => window.parent?.postMessage({ type: 'gastrux:print-done' }, window.location.origin);
  window.addEventListener('afterprint', done, { once: true });
  // let the browser lay out (and decode the QR code image) before printing
  setTimeout(() => window.print(), 300);
}
