/** The Monday-to-Sunday week that holds `now`, moved by `offset` weeks (Turnos; on Sundays it showed the next week) */
export function weekRange(now: Date, offset: number): { start: Date; end: Date } {
  const start = new Date(now);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
