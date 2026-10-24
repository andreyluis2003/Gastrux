/**
 * Runs once when the server starts (Next.js instrumentation). The iFood events are polled every 30 seconds from here
 * (plan 2026-10-24 ifood), only on the Node runtime and only with IFOOD_POLLING=on. The runtime check wraps the import
 * the way Next.js documents, so the edge bundle never pulls the Node-only code.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startIfoodPollingIfEnabled } = await import('./lib/ifood/poller');
    startIfoodPollingIfEnabled();
  }
}
