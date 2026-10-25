'use client';

import { useCallback, useEffect, useState } from 'react';

/** The tutorial videos this person watched (spec 2026-10-25 tutoriais-em-video); marking is optimistic */
export function useTutorialProgress(): { watched: Set<string>; markWatched: (slug: string) => void; loading: boolean } {
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
    void fetch('/api/tutorials/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    }).catch(() => undefined);
  }, []);

  return { watched, markWatched, loading };
}
