/**
 * Whether the agent may overwrite the reply box with a new suggestion: only when the box is empty or still
 * holds the text the agent put there last (the team has not typed anything of their own).
 */
export function shouldPrefill(box: string, previousDraft: string | null): boolean {
  return box.trim() === '' || box === previousDraft;
}

/**
 * Whether a suggestion response may still be shown: no newer suggestion call, send or discard started since it
 * was requested, and the client message it answers is still the last message of the thread.
 */
export function shouldApplyResponse(
  callSeq: number,
  currentSeq: number,
  requestedFor: string | null,
  latestInId: string | null,
): boolean {
  return callSeq === currentSeq && requestedFor !== null && requestedFor === latestInId;
}

/**
 * Whether the agent's old draft must be removed from the box: the response is for a different client message
 * than the draft belongs to, it carries no new suggestion, and the box still holds the draft untouched.
 * A failed regenerate for the same message keeps the draft.
 */
export function shouldClearStaleDraft(
  box: string,
  lastDraft: string | null,
  draftFor: string | null,
  responseFor: string | null,
  responseIsSuggestion: boolean,
): boolean {
  if (responseIsSuggestion || lastDraft === null || draftFor === null) return false;
  if (responseFor === draftFor) return false;
  return shouldPrefill(box, lastDraft);
}
