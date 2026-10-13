'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * A home card the person can hide on this device ("Primeiros passos": a restaurant that will not set up
 * the NFC-e kept it forever, final review 2026-10-12). A per-device convenience: blocked storage shows it.
 */
export function Dismissible({ storageKey, children }: { storageKey: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(localStorage.getItem(storageKey) === '1'); } catch { /* blocked storage */ }
  }, [storageKey]);
  if (hidden) return null;
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Esconder"
        className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        onClick={() => {
          setHidden(true);
          try { localStorage.setItem(storageKey, '1'); } catch { /* blocked storage */ }
        }}
      >
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}
