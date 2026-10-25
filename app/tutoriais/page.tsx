'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle2, PlayCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTutorialProgress } from '@/hooks/use-tutorial-progress';
import { NAV_GROUPS } from '@/lib/navigation/app-nav';
import { essentialTrack, tutorialPosterUrl, tutorialsFor, type Tutorial } from '@/lib/tutorials/catalog';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const minutes = (sec: number) => (sec > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '');

/** All tutorial videos the person can use (spec 2026-10-25 tutoriais-em-video) */
export default function TutoriaisPage() {
  const { data: session } = useSession() || ({} as ReturnType<typeof useSession>);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const { watched } = useTutorialProgress();
  const [query, setQuery] = useState('');

  const all = useMemo(() => tutorialsFor(role), [role]);
  const track = useMemo(() => essentialTrack(role), [role]);
  const q = plain(query.trim());
  const found = q ? all.filter((t) => plain(t.title).includes(q) || plain(t.summary).includes(q)) : null;
  const doneInTrack = track.filter((t) => watched.has(t.slug)).length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-8">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold">Vídeos tutoriais</h1>
          <p className="text-sm text-muted-foreground mt-1">O passo a passo de cada tela do Gastrux, em vídeos curtos.</p>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar vídeo..." className="pl-9" aria-label="Buscar vídeo" />
        </div>
      </div>

      {all.length === 0 && <p className="text-sm text-muted-foreground">Os vídeos estão sendo preparados.</p>}

      {found ? (
        <Section title={`Resultados (${found.length})`}>
          {found.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum vídeo com esse nome.</p> : <Grid items={found} watched={watched} />}
        </Section>
      ) : (
        <>
          {track.length > 0 && (
            <Section title="Comece por aqui" note={`${doneInTrack} de ${track.length} assistidos`}>
              <Grid items={track} watched={watched} numbered />
            </Section>
          )}
          {NAV_GROUPS.map((g) => {
            const items = all.filter((t) => t.group === g.id && t.essentialOrder === undefined);
            return items.length ? (
              <Section key={g.id} title={g.label}>
                <Grid items={items} watched={watched} />
              </Section>
            ) : null;
          })}
        </>
      )}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <span className="text-sm text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Grid({ items, watched, numbered }: { items: Tutorial[]; watched: Set<string>; numbered?: boolean }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((t, i) => (
        <Link key={t.slug} href={`/tutoriais/${t.slug}`} className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
          <div className="relative aspect-video bg-brand-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tutorialPosterUrl(t.slug)} alt="" className="w-full h-full object-cover" loading="lazy" />
            <PlayCircle className="absolute inset-0 m-auto h-12 w-12 text-white/90 drop-shadow group-hover:scale-110 transition-transform" aria-hidden />
            {minutes(t.durationSec) && (
              <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">{minutes(t.durationSec)}</span>
            )}
          </div>
          <div className="p-3 flex items-start gap-2">
            {watched.has(t.slug) ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" aria-label="Assistido" />
            ) : numbered ? (
              <span className="h-5 w-5 shrink-0 mt-0.5 rounded-full bg-brand-green text-white text-xs flex items-center justify-center">{i + 1}</span>
            ) : null}
            <div>
              <p className="font-medium leading-snug">{t.title}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{t.summary}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
