import { pollIfoodOnce } from './events';

/**
 * The loop that polls the iFood events (plan 2026-10-24 ifood, Task 6), started once per server process from
 * instrumentation.ts. The next run is scheduled only after the previous one ends, so two polls never overlap and the
 * interval never drops below 30 s (homologation rule). A failed run is logged and the loop goes on. Across server
 * processes (an overlapping deploy, a second replica) the lease in pollIfoodOnce lets one poll per 25 s.
 */
let running = false;

const pollKeepingLease = () => pollIfoodOnce({ holdMs: 25_000 });

export function startIfoodPoller(run: () => Promise<unknown> = pollKeepingLease, everyMs = 30_000): { stop(): void } {
  if (running) return { stop() {} };
  running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const tick = async () => {
    try {
      await run();
    } catch (e: any) {
      console.error('[ifood] poll failed:', e?.message ?? e);
    }
    if (!stopped) timer = setTimeout(tick, everyMs);
  };
  timer = setTimeout(tick, 0);
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      running = false;
    },
  };
}

/** Called by instrumentation.ts: the loop runs only with IFOOD_POLLING=on */
export function startIfoodPollingIfEnabled(): void {
  if (process.env.IFOOD_POLLING === 'on') startIfoodPoller();
}
