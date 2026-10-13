/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils';

/**
 * The brand marks of the kit "gastrux marca" (2026-10-13), as the "curvas" SVGs in public/brand: the
 * letters are outlines, so every device draws them exactly as delivered (the editable SVGs depend on Arial).
 * Size them by height; the width follows the artwork.
 */
export function GastruxLogo({ negative = false, className }: { negative?: boolean; className?: string }) {
  return (
    <img
      src={negative ? '/brand/gastrux-negativa.svg' : '/brand/gastrux.svg'}
      alt="Gastrux"
      width={174}
      height={74}
      className={cn('h-10 w-auto', className)}
    />
  );
}

/** The symbol alone (the g with the chef hat): avatars, small spaces, the app header */
export function GastruxSymbol({ className }: { className?: string }) {
  return <img src="/brand/gastrux-simbolo.svg" alt="Gastrux" width={58} height={74} className={cn('h-10 w-auto', className)} />;
}

/** Helpflow, the company behind Gastrux */
export function HelpflowLogo({ negative = false, className }: { negative?: boolean; className?: string }) {
  return (
    <img
      src={negative ? '/brand/helpflow-negativa.svg' : '/brand/helpflow.svg'}
      alt="Helpflow"
      width={182}
      height={57}
      className={cn('h-8 w-auto', className)}
    />
  );
}
