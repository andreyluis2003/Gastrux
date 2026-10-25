'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TutorialPlayer } from '@/components/tutorials/tutorial-player';
import { useTutorialProgress } from '@/hooks/use-tutorial-progress';
import { nextTutorial, tutorialBySlug } from '@/lib/tutorials/catalog';

/** One tutorial video with its written step by step (spec 2026-10-25 tutoriais-em-video) */
export default function TutorialPage({ params }: { params: { slug: string } }) {
  const { data: session } = useSession() || ({} as ReturnType<typeof useSession>);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const { markWatched } = useTutorialProgress();

  const tutorial = tutorialBySlug(params.slug);
  if (!tutorial) notFound();
  const next = nextTutorial(tutorial.slug, role);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <Link href="/tutoriais" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Vídeos tutoriais
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{tutorial.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{tutorial.summary}</p>
      </div>

      <TutorialPlayer tutorial={tutorial} onWatched={() => markWatched(tutorial.slug)} />

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={tutorial.routes[0]}>
            <ExternalLink className="h-4 w-4 mr-2" aria-hidden /> Abrir esta tela
          </Link>
        </Button>
        {next && (
          <Button asChild variant="outline">
            <Link href={`/tutoriais/${next.slug}`}>
              Próximo vídeo: {next.title} <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
            </Link>
          </Button>
        )}
      </div>

      {tutorial.steps.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Passo a passo</h2>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm leading-relaxed">
            {tutorial.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
