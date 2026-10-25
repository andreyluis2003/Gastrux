'use client';

import { useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

// "Gastrux em 1 minuto" (made in the gastrux-videos Remotion project). It starts muted because
// browsers only autoplay muted video; every line of the narration is also on screen as text.
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const toggleSound = () => {
    const video = ref.current;
    if (!video) return;
    if (muted) {
      // Turning the sound on restarts the video so the visitor hears it from the beginning
      video.currentTime = 0;
      video.muted = false;
      void video.play();
    } else {
      video.muted = true;
    }
    setMuted(!muted);
  };

  return (
    <div className="relative mt-10 mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl shadow-brand-green/20 bg-brand-ink">
      <video
        ref={ref}
        className="block w-full aspect-video"
        src="/videos/gastrux-em-1-minuto.mp4"
        poster="/videos/gastrux-em-1-minuto-capa.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Vídeo: o Gastrux em 1 minuto"
      />
      <button
        type="button"
        onClick={toggleSound}
        className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-white/90 dark:bg-slate-900/90 px-2.5 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-brand-ink dark:text-slate-100 shadow-lg backdrop-blur hover:bg-white dark:hover:bg-slate-900"
      >
        {muted ? <VolumeX className="w-4 h-4" aria-hidden /> : <Volume2 className="w-4 h-4" aria-hidden />}
        {muted ? 'Ouvir com som' : 'Sem som'}
      </button>
    </div>
  );
}
