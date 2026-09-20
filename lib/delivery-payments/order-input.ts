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

const LINE_BREAKS = /\r\n|[\r\n\u2028\u2029]/;
// Whitespace plus zero-width / bidi format characters a customer could hide in front of a word.
const INVISIBLE_LEAD = '\\s\\u00AD\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\uFEFF';
const STARTS_WITH_PAYMENT = new RegExp(`^[${INVISIBLE_LEAD}]*pagamento`, 'i');

/**
 * The customer's free-text note as one clearly labelled line block for the
 * order notes. The server-generated "Pagamento..." line lives in the same note,
 * so any customer line that starts with "Pagamento" is dropped and the rest is
 * prefixed: only the server can produce a line that starts with "Pagamento".
 * Returns '' when nothing is left.
 */
export function sanitizeCustomerNote(text: unknown): string {
  if (typeof text !== 'string') return '';
  const lines = text
    .split(LINE_BREAKS)
    .filter((line) => !STARTS_WITH_PAYMENT.test(line))
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return '';
  return `Obs. do cliente: ${lines.join('\n')}`;
}

/**
 * A customer-supplied value that goes after a fixed label ("Endereço: ...") in
 * the order notes: line breaks are collapsed so it cannot start a line of its own.
 */
export function singleLine(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .trim();
}
