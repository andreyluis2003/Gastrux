'use client';

import { useEffect } from 'react';

/**
 * Workaround for a known Radix UI bug (present in @radix-ui/react-dialog 1.1.x,
 * react-select 2.1.x, react-dropdown-menu 2.1.x, etc.) where, after a modal
 * overlay (Dialog / AlertDialog / Select / DropdownMenu / Popover) closes, the
 * inline `pointer-events: none` that Radix applies to <body> is sometimes NOT
 * removed. This leaves the whole page non-interactive, so the user has to click
 * 2-3 times before anything responds (the first click(s) are "swallowed").
 *
 * This component watches <body> for that stale inline style and clears it
 * whenever there is no genuinely-open Radix overlay in the DOM.
 */
export function RadixPointerEventsFix() {
  useEffect(() => {
    const OPEN_OVERLAY_SELECTOR = [
      '[data-radix-popper-content-wrapper]', // Select / DropdownMenu / Popover content (portaled while open)
      '[role="dialog"][data-state="open"]',
      '[role="alertdialog"][data-state="open"]',
      '[data-radix-select-viewport]',
    ].join(', ');

    const clearIfStale = () => {
      const body = document.body;
      if (!body) return;
      if (body.style.pointerEvents !== 'none') return;
      // Only clear when nothing is actually open right now.
      if (!document.querySelector(OPEN_OVERLAY_SELECTOR)) {
        body.style.pointerEvents = '';
      }
    };

    // React to any inline style change on <body> (Radix toggles pointer-events there).
    const observer = new MutationObserver(() => {
      requestAnimationFrame(clearIfStale);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });

    // Fallback: after every pointer interaction, re-check shortly after (covers
    // cases where the close animation finished without a further style mutation).
    const onPointerUp = () => setTimeout(clearIfStale, 120);
    document.addEventListener('pointerup', onPointerUp, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('pointerup', onPointerUp, true);
    };
  }, []);

  return null;
}
