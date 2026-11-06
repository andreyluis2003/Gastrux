/** Page reads per restaurant per hour (spec 2026-11-06 importar-cardapio-por-link §13); one server process, so a map is enough */
export const READS_PER_HOUR = 20;
const reads = new Map<string, number[]>();

export function takeRead(restaurantId: string, now = Date.now()): boolean {
  const recent = (reads.get(restaurantId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= READS_PER_HOUR) {
    reads.set(restaurantId, recent);
    return false;
  }
  recent.push(now);
  reads.set(restaurantId, recent);
  return true;
}
