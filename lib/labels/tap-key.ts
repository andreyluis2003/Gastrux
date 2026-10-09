/**
 * The Idempotency-Key of one print or settle attempt. The server stores every answer under its key
 * (lib/api/idempotency.ts), so the key is kept only while the answer is unknown (a retry must be the
 * same request); once any answer arrives, or the request changes, the next tap is a new attempt.
 * Keeping it after a refusal replayed that refusal until a reload (review of etiquetas 2026-10-09).
 */
export class TapKey {
  private key: string | null = null;

  constructor(private readonly make: () => string = () => crypto.randomUUID()) {}

  get(): string {
    this.key ??= this.make();
    return this.key;
  }

  /** The server answered (success or refusal): the next tap is a new request */
  answered() {
    this.key = null;
  }

  /** No answer (network): keep the key, so the retry is recognised as the same request */
  lost() {}

  /** The request changed (item, storage, date, quantity, copies, batch) */
  reset() {
    this.key = null;
  }
}
