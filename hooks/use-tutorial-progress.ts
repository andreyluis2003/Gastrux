'use client';

import { useCallback, useEffect, useState } from 'react';

/** Records that this person watched a tutorial video (spec 2026-10-25 tutoriais-em-video); fire and forget */
export function markTutorialWatched(slug: string): void {
  void fetch('/api/tutorials/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  }).catch(() => undefined);
}

/** The videos this person watched, for the list page only (the other screens just record) */
export function useWatchedTutorials(): { watched: Set<string>; markWatched: (slug: string) => void; loading: boolean } {
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/tutorials/progress')
      .then((r) => (r.ok ? r.json() : { watched: [] }))
      .then((d: { watched?: string[] }) => alive && setWatched(new Set(d.watched ?? [])))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const markWatched = useCallback((slug: string) => {
    setWatched((prev) => (prev.has(slug) ? prev : new Set(prev).add(slug)));
    markTutorialWatched(slug);
  }, []);

  return { watched, markWatched, loading };
}
