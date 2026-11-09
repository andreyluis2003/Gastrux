import { processPendingOnce } from './events';

/**
 * The loop that processes the stored 99Food webhook events (plan 2026-11-09 99food, Task 4), started once per server
 * process from instrumentation.ts. The next run is scheduled only after the previous one ends, so two runs never overlap.
 * A failed run is logged and the loop goes on. Across server processes the lease in processPendingOnce lets one run at a time.
 */
let running = false;

const runKeepingLease = () => processPendingOnce({ holdMs: 4_000 });

export function startNinetynineWorker(everyMs = 5_000, run: () => Promise<unknown> = runKeepingLease): { stop(): void } {
  if (running) return { stop() {} };
  running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const tick = async () => {
    try {
      await run();
    } catch (e: any) {
      console.error('[99food] events run failed:', e?.message ?? e);
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

/** Called by instrumentation.ts: the loop runs only with NINETYNINE_FOOD_EVENTS=on */
export function startNinetynineWorkerIfEnabled(): void {
  if (process.env.NINETYNINE_FOOD_EVENTS === 'on') startNinetynineWorker();
}
