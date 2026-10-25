'use client';

import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { markTutorialWatched } from '@/hooks/use-tutorial-progress';
import type { Tutorial } from '@/lib/tutorials/catalog';
import { TutorialPlayer } from './tutorial-player';

/** The video of a screen over the screen itself ("Vídeo desta tela", first steps), without leaving it */
export function TutorialModal({ tutorial, onClose }: { tutorial: Tutorial | null; onClose: () => void }) {
  return (
    <Dialog open={!!tutorial} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-4 sm:p-6">
        {tutorial && (
          <>
            <DialogHeader>
              <DialogTitle>{tutorial.title}</DialogTitle>
              <DialogDescription>{tutorial.summary}</DialogDescription>
            </DialogHeader>
            <TutorialPlayer tutorial={tutorial} autoPlay onWatched={() => markTutorialWatched(tutorial.slug)} />
            <div className="flex justify-end">
              <Link href={`/tutoriais/${tutorial.slug}`} onClick={onClose} className="text-sm font-medium text-brand-green hover:underline">
                Ver o passo a passo escrito
              </Link>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
