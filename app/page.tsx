'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Sparkles, ShieldCheck, Menu, X } from 'lucide-react';
import { GastruxLogo } from '@/components/brand/logo';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Button } from '@/components/ui/button';
import { useAnalytics } from '@/hooks/use-analytics';
import { useScrollTracking } from '@/hooks/use-scroll-tracking';
import { useTimeTracking } from '@/hooks/use-time-tracking';
import { useABTest } from '@/hooks/use-ab-test';
import { AB_TESTS } from '@/lib/ab-testing';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { FeaturesShowcase } from '@/components/marketing/features-showcase';
import { TrustSection } from '@/components/marketing/trust-section';
import { FAQSection } from '@/components/marketing/faq-section';
import { SegmentsSection } from '@/components/marketing/segments-section';
import { WhyGastrux } from '@/components/marketing/why-gastrux';
import { ClarityScript } from '@/components/analytics/clarity-script';

const heroBenefits = [
  'Sai do caderno em 10 minutos',
  'Custo (CMV) e margem de cada prato',
  'Funciona no celular',
  'Começa grátis, sem cartão',
];

// Product facts only: Gastrux has no customer results to publish yet, so no customer counts, ratings
// or savings figures go here (site claims review, 2026-09-25).
const heroStats = [
  { value: 'R$ 0', label: 'Plano Starter, sem cartão' },
  { value: 'Celular', label: 'E computador, sem instalar' },
  { value: 'Offline', label: 'Comanda e balcão sem internet' },
  { value: 'NFC-e', label: 'Emissão ao fechar a conta*' },
];

function HomePageContent() {
  const { trackCTAClick } = useAnalytics();
  useScrollTracking();
  useTimeTracking('landing-page');

  const heroHeadline = useABTest(AB_TESTS.HERO_HEADLINE);
  const heroPrimaryBtn = useABTest(AB_TESTS.HERO_CTA_PRIMARY);
  const finalCtaHeadline = useABTest(AB_TESTS.FINAL_CTA_HEADLINE);
  const finalCtaBtn = useABTest(AB_TESTS.FINAL_CTA_BUTTON);
  const heroDescription = useABTest(AB_TESTS.HERO_DESCRIPTION);

  const handlePrimaryCtaClick = () => {
    trackCTAClick('hero_get_started', '/auth/signup');
    heroPrimaryBtn.trackConversion();
  };

  const handleFinalCtaClick = () => {
    trackCTAClick('final_get_started', '/auth/signup');
    finalCtaBtn.trackConversion();
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 font-brand">
      <ClarityScript />
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center -ml-2" aria-label="Gastrux, página inicial">
            <GastruxLogo className="h-14" />
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="#features" className="text-slate-600 dark:text-slate-300 hover:text-brand-green">
              Funcionalidades
            </Link>
            <Link href="/#segmentos" className="text-slate-600 dark:text-slate-300 hover:text-brand-green">
              Segmentos
            </Link>
            <Link href="/pricing" className="text-slate-600 dark:text-slate-300 hover:text-brand-green">
              Planos
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/auth/signin" className="hidden sm:block">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link href="/auth/signup" className="hidden sm:block">
              <Button variant="cta" className="gap-1">Começar Grátis</Button>
            </Link>
            <button
              className="md:hidden p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Abrir menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-4 py-4 space-y-3">
            <Link href="#features" className="block text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-green" onClick={() => setMobileMenuOpen(false)}>
              Funcionalidades
            </Link>
            <Link href="/#segmentos" className="block text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-green" onClick={() => setMobileMenuOpen(false)}>
              Segmentos
            </Link>
            <Link href="/pricing" className="block text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-green" onClick={() => setMobileMenuOpen(false)}>
              Planos
            </Link>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex flex-col gap-2">
              <Link href="/auth/signin" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" className="w-full">Entrar</Button>
              </Link>
              <Link href="/auth/signup" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="cta" className="w-full">Começar Grátis</Button>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 sm:pt-28 pb-16 px-4 sm:px-6 bg-gradient-to-b from-brand-paper via-white to-white dark:from-slate-800 dark:via-slate-900 dark:to-slate-900">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-brand-light/20 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-brand-light/20 rounded-full blur-3xl" />
        </div>
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm mb-6 backdrop-blur">
            <Sparkles className="w-3.5 h-3.5 text-brand-green" aria-hidden />
            <span>Custo de cada prato, estoque, comanda e caixa num lugar só</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-medium text-brand-ink dark:text-slate-100 mb-6 leading-tight tracking-tighter">
            <span className="text-brand-ink dark:text-slate-100">
              {heroHeadline.isLoaded
                ? heroHeadline.content
                : 'Troque o caderno pelo controle de verdade'}
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 mb-8 leading-relaxed max-w-3xl mx-auto">
            {heroDescription.isLoaded
              ? heroDescription.content
              : 'Você sabe quanto custa cada prato que serve? Com a Gastrux, você descobre em 10 minutos e nunca mais precisa de caderno, planilha ou calculadora.'}
          </p>

          {/* Hero benefits quick-list */}
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 mb-8">
            {heroBenefits.map((b) => (
              <li key={b} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                <Check className="w-4 h-4 text-emerald-500" />
                {b}
              </li>
            ))}
          </ul>

          <div className="flex justify-center">
            <Link href="/auth/signup" onClick={handlePrimaryCtaClick}>
              <Button size="lg" variant="cta" className="w-full sm:w-auto gap-2 shadow-lg shadow-brand-green/20">
                {heroPrimaryBtn.isLoaded ? heroPrimaryBtn.content : 'Trocar o Caderno Agora'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-5 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Sem cartão • Sem contrato • Se não gostar, volta pro caderno
          </p>

          {/* Product facts - right under the fold, before the visitor scrolls past */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-10 pt-8 border-t border-slate-200 dark:border-slate-700">
            {heroStats.map((s) => (
              <div key={s.label}>
                <div className="text-2xl sm:text-3xl font-bold text-brand-green">
                  {s.value}
                </div>
                <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            * NFC-e em todos os planos, com certificado digital e dados fiscais preenchidos pelo seu contador.
          </p>
        </div>
      </section>

      <FeaturesShowcase />

      <HowItWorks />

      <TrustSection />

      <SegmentsSection />

      <WhyGastrux />

      <FAQSection />

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 bg-brand-ink">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight mb-6">
            {finalCtaHeadline.isLoaded
              ? finalCtaHeadline.content
              : 'Seu restaurante merece mais que um caderno'}
          </h2>
          <p className="text-lg mb-8 text-brand-light max-w-2xl mx-auto">
            Começa grátis em 10 minutos. Se não gostar, volta pro caderno, sem custo e sem burocracia.
          </p>
          <div className="flex justify-center">
            <Link href="/auth/signup" onClick={handleFinalCtaClick}>
              <Button size="lg" variant="cta" className="gap-2 shadow-xl bg-brand-light text-brand-ink hover:bg-white">
                {finalCtaBtn.isLoaded ? finalCtaBtn.content : 'Criar Conta Grátis'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <p className="text-sm text-brand-light mt-6">Sem cartão • Sem contrato • Grátis para sempre no Starter</p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
