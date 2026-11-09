/**
 * Whether the agent may overwrite the reply box with a new suggestion: only when the box is empty or still
 * holds the text the agent put there last (the team has not typed anything of their own).
 */
export function shouldPrefill(box: string, previousDraft: string | null): boolean {
  return box.trim() === '' || box === previousDraft;
}
