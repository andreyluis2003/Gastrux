'use client';

/**
 * The order bell (2026-11-03): a "ding-dong" made with the Web Audio API, so it needs no sound file and is loud
 * enough for a kitchen. Browsers only let a page play sound after a click or a key on it, so the bell is unlocked
 * by the first touch on the page; until then `soundReady()` is false and the screen asks for one tap.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Call from a click or key handler: the browser then lets the bell ring */
export async function unlockSound(): Promise<boolean> {
  const c = context();
  if (!c) return false;
  if (c.state === 'suspended') await c.resume().catch(() => {});
  return c.state === 'running';
}

export function soundReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

function strike(c: AudioContext, freq: number, start: number) {
  // A bell: the note plus a brighter partial, both fading out
  for (const [mult, level] of [[1, 0.6], [2.76, 0.25]] as const) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.2);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + 1.25);
  }
}

/** Ding-dong; does nothing until the sound is unlocked */
export function ringBell() {
  const c = context();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.02;
  strike(c, 1046.5, t);
  strike(c, 784, t + 0.45);
}
