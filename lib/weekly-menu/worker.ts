import { releaseDue } from './release';

/**
 * The loop that releases the due pre-orders (spec 2026-11-10 cardapio-da-semana), started once per server process from
 * instrumentation.ts. The next run is scheduled only after the previous one ends, so two runs never overlap. A failed
 * run is logged and the loop goes on. Across processes the PLACED -> RELEASING claim keeps each release single.
 */
let running = false;

export function startWeeklyMenuWorker(everyMs = 60_000, run: () => Promise<unknown> = () => releaseDue()): { stop(): void } {
  if (running) return { stop() {} };
  running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const tick = async () => {
    try {
      await run();
    } catch (e: any) {
      console.error('[weekly-menu] release run failed:', e?.message ?? e);
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
