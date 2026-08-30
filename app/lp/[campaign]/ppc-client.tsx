'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as LucideIcons from 'lucide-react';
import { ArrowRight, CheckCircle2, Quote, Star } from 'lucide-react';
import { useAnalytics } from '@/hooks/use-analytics';
import type { PPCCampaign } from '@/lib/marketing/ppc-campaigns';
import type { CaseStudy } from '@/lib/marketing/case-studies';

type Props = {
  campaign: PPCCampaign;
  testimonial: CaseStudy | null;
  utms: Record<string, string>;
};

export default function PPCLandingClient({ campaign, testimonial, utms }: Props) {
  const { trackEvent } = useAnalytics();

  useEffect(() => {
    // Capture UTMs to sessionStorage for later conversion attribution
    if (typeof window !== 'undefined') {
      try {
        const hasAnyUtm = Object.values(utms).some((v) => v);
        if (hasAnyUtm) {
          sessionStorage.setItem(
            'ppc_utm',
            JSON.stringify({ ...utms, campaign: campaign.slug, ts: Date.now() })
          );
        }
      } catch {}
    }
    trackEvent('ppc_landing_view', {
      campaign: campaign.slug,
      segment: campaign.segment,
      ...utms,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.slug]);

  const handleCTA = (position: string) => {
    trackEvent('ppc_landing_cta_click', {
      campaign: campaign.slug,
      position,
      ...utms,
    });
  };

  const signupHref = `/auth/signup?utm_source=${encodeURIComponent(
    utms.utm_source || 'ppc'
  )}&utm_campaign=${encodeURIComponent(utms.utm_campaign || campaign.slug)}`;

  const renderIcon = (name: string, className: string) => {
    const Icon: any = (LucideIcons as any)[name] || LucideIcons.Sparkles;
    return <Icon className={className} />;
  };

  const accent = `${campaign.theme.accentFrom} ${campaign.theme.accentTo}`;

  return (
    <div className="min-h-screen bg-white">
      {/* Simplified nav (no distractions on PPC) */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold">
              R
            </div>
            <span className="font-bold text-lg text-gray-900">Gastrux</span>
          </Link>
          <Link
            href={signupHref}
            onClick={() => handleCTA('nav')}
            className={`text-sm bg-gradient-to-r ${accent} text-white px-4 py-2 rounded-lg font-semibold shadow hover:opacity-90 transition`}
          >
            Começar Grátis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section
        className={`relative overflow-hidden bg-gradient-to-br ${accent} text-white`}
      >
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.4),transparent_70%)]" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm border border-white/30 px-3 py-1 rounded-full text-sm mb-6">
            <span>{campaign.hero.eyebrow}</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            {campaign.hero.headline}
          </h1>
          <p className="mt-6 text-lg md:text-xl text-white/95 max-w-3xl mx-auto">
            {campaign.hero.subheadline}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={signupHref}
              onClick={() => handleCTA('hero-primary')}
              className="inline-flex items-center justify-center gap-2 bg-white text-gray-900 px-8 py-4 rounded-lg font-bold shadow-xl hover:shadow-2xl hover:bg-gray-50 transition"
            >
              {campaign.hero.ctaPrimary} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="#beneficios"
              onClick={() => handleCTA('hero-secondary')}
              className="inline-flex items-center justify-center bg-white/10 border border-white/40 text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/20 transition"
            >
              {campaign.hero.ctaSecondary}
            </Link>
          </div>
          <div className="mt-6 text-sm text-white/80">
            {campaign.hero.trustLine}
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl md:text-4xl font-bold text-gray-900 text-center mb-10">
            Reconhece alguma dessas dores?
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {campaign.painPoints.map((p, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-red-600 text-lg">✕</span>
                </div>
                <p className="text-gray-800 text-base leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900">
              Como o Gastrux resolve isso
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Tudo em uma única plataforma. Configure em minutos.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {campaign.benefits.map((b, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition flex gap-4"
              >
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center flex-shrink-0`}
                >
                  {renderIcon(b.icon, 'w-7 h-7 text-white')}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{b.title}</h3>
                  <p className="mt-2 text-gray-600 leading-relaxed">
                    {b.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className={`py-16 bg-gradient-to-r ${accent} text-white`}>
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {campaign.stats.map((s, i) => (
            <div key={i}>
              <div className="text-4xl md:text-5xl font-bold">{s.value}</div>
              <div className="mt-1 text-sm text-white/90">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonial */}
      {testimonial && (
        <section className="py-16 md:py-24 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4">
            <div className="bg-white rounded-3xl shadow-xl border border-gray-200 p-8 md:p-12">
              <div className="flex items-center gap-2 mb-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className="w-5 h-5 fill-yellow-400 text-yellow-400"
                  />
                ))}
              </div>
              <Quote className="w-10 h-10 text-gray-200" />
              <p className="mt-4 text-xl md:text-2xl text-gray-800 italic leading-relaxed">
                “{testimonial.quote}”
              </p>
              <div className="mt-6 flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${testimonial.coverGradient} flex items-center justify-center text-2xl`}
                >
                  {testimonial.emoji}
                </div>
                <div>
                  <div className="font-bold text-gray-900">
                    {testimonial.ownerName}
                  </div>
                  <div className="text-sm text-gray-600">
                    {testimonial.ownerRole} — {testimonial.company}
                  </div>
                </div>
              </div>
              <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-gray-200">
                {testimonial.metrics.map((m, i) => (
                  <div key={i} className="text-center">
                    <div
                      className={`text-2xl font-bold ${
                        m.highlight ? 'text-blue-600' : 'text-gray-800'
                      }`}
                    >
                      {m.value}
                    </div>
                    <div className="text-xs text-gray-500">{m.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 text-center">
                <Link
                  href={`/casos-de-sucesso/${testimonial.slug}`}
                  className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Ler caso completo <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Trust features */}
      <section className="py-12 bg-white border-y border-gray-200">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-sm text-gray-700">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" /> 30 dias grátis
          </div>
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Sem cartão de crédito
          </div>
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Cancelável quando quiser
          </div>
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Suporte em português
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={`py-20 bg-gradient-to-r ${accent} text-white`}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <span className="text-6xl">{campaign.theme.emoji}</span>
          <h2 className="mt-4 text-3xl md:text-5xl font-bold">
            {campaign.finalCta.headline}
          </h2>
          <p className="mt-4 text-lg md:text-xl text-white/90">
            Configure em 15 minutos. Cancelável quando quiser.
          </p>
          <Link
            href={signupHref}
            onClick={() => handleCTA('final')}
            className="mt-8 inline-flex items-center gap-2 bg-white text-gray-900 px-10 py-5 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl hover:bg-gray-50 transition"
          >
            {campaign.finalCta.button} <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="mt-4 text-sm text-white/80">
            🔒 Seus dados estão seguros • LGPD Compliant
          </p>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-500">
        <div className="max-w-5xl mx-auto px-4">
          © {new Date().getFullYear()} Gastrux —{' '}
          <Link href="/pricing" className="hover:underline">
            Ver planos
          </Link>{' '}
          •{' '}
          <Link href="/casos-de-sucesso" className="hover:underline">
            Casos
          </Link>{' '}
          •{' '}
          <Link href="/ajuda" className="hover:underline">
            Ajuda
          </Link>
        </div>
      </footer>
    </div>
  );
}
