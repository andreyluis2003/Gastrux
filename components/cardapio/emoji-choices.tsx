'use client';

/** Food and drink emojis to pick for a menu category (pedido de cliente, 2026-11-17): typing an emoji on a PC is hard */
export const CATEGORY_EMOJIS = [
  '🍕', '🍔', '🌭', '🍟', '🥩', '🍖', '🍗', '🥓', '🍤', '🐟', '🍣', '🍜', '🍝', '🍛', '🍚', '🥗', '🥪', '🌮', '🥟', '🍳', '🥞',
  '🧁', '🍰', '🍦', '🍫', '🥐', '🍞',
  '☕', '🥤', '🧃', '🍺', '🍷', '🍹', '💧',
];

/** A row of emoji buttons: a click picks one, clicking the picked one clears it */
export function EmojiChoices({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Escolher emoji">
      {CATEGORY_EMOJIS.map((e) => {
        const picked = value === e;
        return (
          <button
            key={e}
            type="button"
            aria-pressed={picked}
            aria-label={`Emoji ${e}`}
            onClick={() => onChange(picked ? '' : e)}
            className={`h-9 w-9 rounded-md border text-xl leading-none ${picked ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-gray-100'}`}
          >
            {e}
          </button>
        );
      })}
    </div>
  );
}
