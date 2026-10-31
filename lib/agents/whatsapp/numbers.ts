/**
 * Meta can report a Brazilian mobile without the ninth digit (the official number itself is listed that
 * way), while sign-up stores it with the 9. A conversation must not split in two, so each number has one
 * canonical key: 55 + DDD + the last 8 digits for mobiles. Landlines and foreign numbers stay as they are.
 */
const digits = (raw: string) => raw.replace(/\D/g, '');

export function phoneKey(raw: string): string {
  const d = digits(raw);
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') return d.slice(0, 4) + d.slice(5);
  return d;
}

/** Both spellings of a number, to find the client who owns it */
export function phoneVariants(raw: string): string[] {
  const key = phoneKey(raw);
  // After the key, a 12-digit Brazilian number starting 6-9 is a mobile without the 9; 2-5 is a landline
  if (key.length === 12 && key.startsWith('55') && Number(key[4]) >= 6) return [key, key.slice(0, 4) + '9' + key.slice(4)];
  return [key];
}
