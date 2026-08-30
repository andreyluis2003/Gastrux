// @ts-nocheck
import Link from 'next/link';
import { CASE_STUDIES } from '@/lib/marketing/case-studies';
import { ArrowRight, Star } from 'lucide-react';

export const metadata = {
  title: 'Casos de Sucesso | Gastrux',
  description:
    'Conheça histórias reais de restaurantes que transformaram sua operação com a plataforma Gastrux. Pizzarias, hamburguerias, bistrôs e mais.',
};

export default function CasosDeSucesso() {
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
            <Link href="/casos-de-sucesso" className="text-blue-600 font-semibold">
              Casos
            </Link>
            <Link href="/ajuda" className="text-gray-600 hover:text-gray-900">
              Ajuda
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/auth/signin"
              className="hidden sm:inline-flex text-sm text-gray-700 hover:text-gray-900 px-3 py-2"
            >
              Entrar
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm bg-gradient-to-r from-blue-600 to-violet-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-violet-700 transition"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-blue-50 via-violet-50 to-white">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-blue-200 px-3 py-1 rounded-full text-sm text-blue-700 mb-6 shadow-sm">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span>500+ restaurantes usam a plataforma</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 tracking-tight">
            Histórias reais de{' '}
            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
              transformação
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            Pizzarias, hamburguerias, bistrôs e cozinhas industriais que deixaram
            as planilhas para trás e hoje operam com margem e escala.
          </p>
        </div>
      </section>

      {/* Grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {CASE_STUDIES.map((cs) => (
              <Link
                key={cs.slug}
                href={`/casos-de-sucesso/${cs.slug}`}
                className="group bg-white rounded-2xl overflow-hidden border border-gray-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col"
              >
                <div
                  className={`h-40 bg-gradient-to-br ${cs.coverGradient} flex items-center justify-center relative`}
                >
                  <span className="text-6xl">{cs.emoji}</span>
                  {cs.featured && (
                    <span className="absolute top-3 right-3 bg-white/95 text-xs font-semibold px-2 py-1 rounded-full text-gray-800 flex items-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" /> Destaque
                    </span>
                  )}
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">
                    {cs.segment} • {cs.city}/{cs.state}
                  </div>
                  <h3 className="mt-2 text-xl font-bold text-gray-900 group-hover:text-blue-700 transition">
                    {cs.company}
                  </h3>
                  <p className="mt-3 text-sm text-gray-600 leading-relaxed flex-1">
                    {cs.summary}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {cs.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                    Ler caso <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-violet-700">
        <div className="max-w-4xl mx-auto px-4 text-center text-white">
          <h2 className="text-3xl md:text-5xl font-bold">
            Sua história pode ser a próxima
          </h2>
          <p className="mt-4 text-lg md:text-xl text-white/90">
            30 dias grátis, sem cartão de crédito. Configure em 15 minutos.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center bg-white text-blue-700 px-8 py-4 rounded-lg font-bold shadow-lg hover:bg-gray-50 transition"
            >
              Começar Grátis
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
