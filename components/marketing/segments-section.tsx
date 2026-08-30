'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SEGMENTS } from '@/lib/marketing/segments';

export function SegmentsSection() {
  return (
    <section id="segmentos" className="py-20 px-4 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold tracking-wide uppercase mb-3">
            Para cada tipo de negócio
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            A solução ideal para o seu segmento
          </h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Funcionalidades adaptadas às necessidades reais de cada tipo de estabelecimento.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {SEGMENTS.map((seg) => (
            <Link
              key={seg.slug}
              href={`/para/${seg.slug}`}
              className="group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200"
            >
              <span className="text-3xl mb-3 block">{seg.emoji}</span>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-1">{seg.shortName}</h3>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                Saiba mais <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
