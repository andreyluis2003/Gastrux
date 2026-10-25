'use client';

import { useRef } from 'react';
import { tutorialPosterUrl, tutorialVideoUrl, watchedAt, type Tutorial } from '@/lib/tutorials/catalog';

/** A tutorial video; calls onWatched once, at 90% or at the end */
export function TutorialPlayer({ tutorial, onWatched, autoPlay = false }: { tutorial: Tutorial; onWatched?: () => void; autoPlay?: boolean }) {
  const reported = useRef(false);
  const report = () => {
    if (reported.current) return;
    reported.current = true;
    onWatched?.();
  };

  return (
    <video
      key={tutorial.slug}
      className="block w-full aspect-video rounded-xl bg-brand-ink"
      src={tutorialVideoUrl(tutorial.slug)}
      poster={tutorialPosterUrl(tutorial.slug)}
      controls
      playsInline
      preload="metadata"
      autoPlay={autoPlay}
      onTimeUpdate={(e) => watchedAt(e.currentTarget.currentTime, e.currentTarget.duration) && report()}
      onEnded={report}
      aria-label={`Vídeo: ${tutorial.title}`}
    />
  );
}
