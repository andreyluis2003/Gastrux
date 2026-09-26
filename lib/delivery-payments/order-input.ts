/**
 * Pure helpers that clean what a delivery customer types before it reaches the
 * order (quantities, free-text notes). No I/O: unit-testable without a database.
 */

const MAX_QUANTITY = 99;

/**
 * One integer in 1..99 for whatever the browser sent as a quantity. The same
 * value must feed the subtotal, the OrderItem quantity and totalItems so the
 * three can never disagree; a negative, fractional or non-numeric value cannot
 * lower the total or break the insert.
 */
export function normalizeQuantity(value: unknown): number {
  return Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(Number(value) || 1)));
}

/**
 * Every character class that can end a line: CR, LF, VT, FF, NEL, LS and PS.
 * The one place that defines it; a run of them is a single break. Written as a
 * string so the source holds only escapes, no raw invisible characters.
 */
const LINE_BREAKS = new RegExp('[\\r\\n\\v\\f\\u0085\\u2028\\u2029]+');

const SEPARATOR = ' / ';

/** Longest customer note kept (in characters) so it cannot flood the kitchen note. */
const MAX_NOTE_LENGTH = 500;

/** Every line-break run becomes one separator; empty segments are dropped. */
function collapseLines(value: string): string {
  return value
    .split(LINE_BREAKS)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(SEPARATOR);
}

/**
 * The customer's free-text note as ONE line for the order notes. The
 * server-generated "Pagamento..." line lives in the same note, so the rule is
 * structural rather than a list of forbidden words: no customer text can ever
 * start a line, because it is collapsed into a single line that begins with the
 * fixed label. Returns '' when nothing is left (or the input is not a string).
 */
export function sanitizeCustomerNote(text: unknown): string {
  if (typeof text !== 'string') return '';
  const collapsed = collapseLines(text);
  if (!collapsed) return '';
  const chars = Array.from(collapsed); // by code point: never cuts a character in half
  // When cut, do not leave a dangling separator at the end.
  const capped = chars.length > MAX_NOTE_LENGTH ? chars.slice(0, MAX_NOTE_LENGTH).join('').replace(/[\s/]+$/, '') : collapsed;
  return `Obs. do cliente: ${capped}`;
}

/**
 * A customer-supplied value that goes after a fixed label ("Endereço: ...") in
 * the order notes: line breaks of any kind are collapsed so it cannot start a
 * line of its own. '' when nothing is left.
 */
export function singleLine(value: unknown): string {
  return collapseLines(String(value ?? ''));
}
