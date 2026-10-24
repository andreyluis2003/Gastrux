/** The 30-second loop of the iFood events (plan 2026-10-24 ifood, Task 6) */
jest.mock('@/lib/ifood/events', () => ({ pollIfoodOnce: jest.fn() }));
import { startIfoodPoller } from '@/lib/ifood/poller';

describe('startIfoodPoller', () => {
  let stop: (() => void) | null = null;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    stop?.();
    stop = null;
    jest.useRealTimers();
    jest.spyOn(console, 'error').mockRestore();
  });

  it('runs every 30 s', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    stop = startIfoodPoller(run, 30_000).stop;
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(29_000);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('a slow run delays the next one (no overlap)', async () => {
    let running = 0;
    let most = 0;
    const run = jest.fn(async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 50_000));
      running--;
    });
    stop = startIfoodPoller(run, 30_000).stop;
    await jest.advanceTimersByTimeAsync(0);
    // the first run ends at 50 s, the next starts 30 s later
    await jest.advanceTimersByTimeAsync(79_000);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });

  it('an error does not stop the loop', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const run = jest.fn().mockRejectedValueOnce(new Error('iFood fora')).mockResolvedValue(undefined);
    stop = startIfoodPoller(run, 30_000).stop;
    await jest.advanceTimersByTimeAsync(30_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('a second start is ignored', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    stop = startIfoodPoller(run, 30_000).stop;
    const again = startIfoodPoller(run, 30_000);
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    again.stop();
  });
});
