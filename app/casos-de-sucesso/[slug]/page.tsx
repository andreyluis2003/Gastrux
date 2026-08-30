// @ts-nocheck
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CASE_STUDIES,
  getCaseStudyBySlug,
  getAllCaseStudySlugs,
} from '@/lib/marketing/case-studies';
import { ArrowLeft, ArrowRight, Quote, CheckCircle2 } from 'lucide-react';

export async function generateStaticParams() {
  return getAllCaseStudySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const cs = getCaseStudyBySlug(params.slug);
  if (!cs) return { title: 'Caso não encontrado' };
  return {
    title: `${cs.company} — Caso de Sucesso | Gastrux`,
    description: cs.summary,
  };
}

export default function CaseStudyDetail({ params }: { params: { slug: string } }) {
  const cs = getCaseStudyBySlug(params.slug);
  if (!cs) notFound();

  const others = CASE_STUDIES.filter((c) => c.slug !== cs.slug).slice(0, 3);

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold">
              R
            </div>
            <span className="font-bold text-lg text-gray-900">Gastrux</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/#features" className="text-gray-600 hover:text-gray-900">
              Recursos
            </Link>
            <Link href="/pricing" className="text-gray-600 hover:text-gray-900">
              Preços
            </Link>
            <Link href="/casos-de-sucesso" className="text-gray-600 hover:text-gray-900">
              Casos
            </Link>
          </div>
          <Link
            href="/auth/signup"
            className="text-sm bg-gradient-to-r from-blue-600 to-violet-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-violet-700 transition"
          >
            Começar grátis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className={`relative bg-gradient-to-br ${cs.coverGradient} text-white`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <Link
            href="/casos-de-sucesso"
            className="inline-flex items-center gap-2 text-white/90 hover:text-white text-sm mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> Todos os casos
          </Link>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-4xl">
              {cs.emoji}
            </div>
            <div>
              <div className="text-sm text-white/80 uppercase tracking-wide">
                {cs.segment} • {cs.city}/{cs.state}
              </div>
              <h1 className="text-3xl md:text-5xl font-bold">{cs.company}</h1>
            </div>
          </div>
          <p className="text-xl md:text-2xl text-white/95 max-w-3xl leading-relaxed">
            {cs.summary}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {cs.tags.map((t) => (
              <span
                key={t}
                className="text-xs bg-white/20 backdrop-blur-sm text-white px-3 py-1 rounded-full"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="py-12 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6">
          {cs.metrics.map((m, i) => (
            <div
              key={i}
              className={`text-center ${
                m.highlight ? 'text-blue-600' : 'text-gray-800'
              }`}
            >
              <div className="text-3xl md:text-4xl font-bold">{m.value}</div>
              <div className="mt-1 text-sm text-gray-600">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Content */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 space-y-12">
          {/* Quote */}
          <div className="bg-gradient-to-r from-blue-50 to-violet-50 border-l-4 border-blue-600 p-6 rounded-r-lg">
            <Quote className="w-8 h-8 text-blue-500 mb-3" />
            <p className="text-lg md:text-xl text-gray-800 italic leading-relaxed">
              “{cs.quote}”
            </p>
            <div className="mt-4 text-sm text-gray-700">
              <strong>{cs.ownerName}</strong> — {cs.ownerRole}, {cs.company}
            </div>
          </div>

          {/* Desafio */}
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              O desafio
            </h2>
            <p className="text-gray-700 leading-relaxed text-lg">{cs.challenge}</p>
          </div>

          {/* Solução */}
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              A solução
            </h2>
            <p className="text-gray-700 leading-relaxed text-lg">{cs.solution}</p>
          </div>

          {/* Resultados */}
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Resultados
            </h2>
            <ul className="space-y-3">
              {cs.results.map((r, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800 text-lg">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Related */}
      {others.length > 0 && (
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-10">
              Outros casos de sucesso
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {others.map((o) => (
                <Link
                  key={o.slug}
                  href={`/casos-de-sucesso/${o.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden border border-gray-200 hover:shadow-xl transition"
                >
                  <div
                    className={`h-32 bg-gradient-to-br ${o.coverGradient} flex items-center justify-center`}
                  >
                    <span className="text-5xl">{o.emoji}</span>
                  </div>
                  <div className="p-5">
                    <div className="text-xs text-gray-500 uppercase">{o.segment}</div>
                    <h3 className="mt-1 font-bold text-gray-900 group-hover:text-blue-700">
                      {o.company}
                    </h3>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-3">
                      {o.summary}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-violet-700">
        <div className="max-w-4xl mx-auto px-4 text-center text-white">
          <h2 className="text-3xl md:text-5xl font-bold">
            Pronto para escrever sua história?
          </h2>
          <p className="mt-4 text-lg md:text-xl text-white/90">
            30 dias grátis, sem cartão de crédito.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 px-8 py-4 rounded-lg font-bold shadow-lg hover:bg-gray-50 transition"
            >
              Começar Grátis <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center bg-white/10 border border-white/30 text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/20 transition"
            >
              Ver planos
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Gastrux — Gestão inteligente para food service.
      </footer>
    </div>
  );
}
