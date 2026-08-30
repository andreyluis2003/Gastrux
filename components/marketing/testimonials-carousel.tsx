'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Star, ChevronLeft, ChevronRight, Quote, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CASE_STUDIES, type CaseStudy } from '@/lib/marketing/case-studies';
import { cn } from '@/lib/utils';

type Props = {
  caseStudies?: CaseStudy[];
  autoplay?: boolean;
  showStats?: boolean;
  ctaLink?: string;
  ctaLabel?: string;
};

export function TestimonialsCarousel({
  caseStudies = CASE_STUDIES.filter((c) => c.featured),
  autoplay = true,
  showStats = true,
  ctaLink = '/casos-de-sucesso',
  ctaLabel = 'Ver todos os casos',
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const total = caseStudies.length;

  useEffect(() => {
    if (!autoplay || total <= 1) return;
    const id = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % total);
    }, 7000);
    return () => clearInterval(id);
  }, [autoplay, total]);

  if (total === 0) return null;
  const current = caseStudies[activeIndex];

  const prev = () => setActiveIndex((i) => (i - 1 + total) % total);
  const next = () => setActiveIndex((i) => (i + 1) % total);

  return (
    <section className="py-16 px-4 sm:px-6 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold tracking-wide uppercase mb-3">
            Quem usa, recomenda
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-3">
            Donos que largaram o caderno e nunca mais voltaram
          </h2>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Restaurantes reais que trocaram o caderno pela Gastrux — e finalmente sabem quanto lucram.
          </p>
        </div>

        <div className="relative">
          <div className="grid lg:grid-cols-5 gap-8 items-stretch bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            {/* Left: gradient panel */}
            <div
              className={cn(
                'lg:col-span-2 relative p-8 sm:p-10 flex flex-col justify-between text-white bg-gradient-to-br',
                current.coverGradient
              )}
            >
              <div>
                <div className="text-5xl mb-4" aria-hidden="true">
                  {current.emoji}
                </div>
                <div className="text-sm uppercase tracking-widest opacity-80 mb-2">
                  {current.segment}
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold mb-2">{current.company}</h3>
                <p className="text-sm opacity-90">
                  {current.city} / {current.state}
                </p>
              </div>
              {showStats && (
                <div className="grid grid-cols-2 gap-3 mt-8">
                  {current.metrics.slice(0, 4).map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-xl p-3 backdrop-blur',
                        m.highlight
                          ? 'bg-white/20 border border-white/30'
                          : 'bg-white/10'
                      )}
                    >
                      <div className="text-xl sm:text-2xl font-bold leading-tight">{m.value}</div>
                      <div className="text-xs opacity-90 mt-1">{m.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: content */}
            <div className="lg:col-span-3 p-8 sm:p-10 flex flex-col justify-between">
              <div>
                <div className="flex gap-0.5 mb-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <Quote className="w-10 h-10 text-blue-500/20 -ml-1 mb-2" aria-hidden="true" />
                <blockquote className="text-xl sm:text-2xl font-medium text-slate-900 dark:text-slate-100 leading-snug mb-6">
                  “{current.quote}”
                </blockquote>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{current.ownerName}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {current.ownerRole} • {current.company}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <Link
                  href={`/casos-de-sucesso/${current.slug}`}
                  className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1 text-sm"
                >
                  Ler o caso completo <ArrowRight className="w-4 h-4" />
                </Link>
                <div className="flex items-center gap-3">
                  <button
                    onClick={prev}
                    aria-label="Anterior"
                    className="w-9 h-9 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex gap-1.5">
                    {caseStudies.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveIndex(i)}
                        aria-label={`Ver caso ${i + 1}`}
                        className={cn(
                          'h-1.5 rounded-full transition-all',
                          i === activeIndex
                            ? 'w-6 bg-blue-600 dark:bg-blue-400'
                            : 'w-1.5 bg-slate-300 dark:bg-slate-600'
                        )}
                      />
                    ))}
                  </div>
                  <button
                    onClick={next}
                    aria-label="Próximo"
                    className="w-9 h-9 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {ctaLink && (
          <div className="text-center mt-10">
            <Link href={ctaLink}>
              <Button variant="outline" size="lg" className="gap-2">
                {ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
