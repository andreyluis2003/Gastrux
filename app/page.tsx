'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChefHat, ArrowRight, Check, Star, ShieldCheck, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnalytics } from '@/hooks/use-analytics';
import { useScrollTracking } from '@/hooks/use-scroll-tracking';
import { useTimeTracking } from '@/hooks/use-time-tracking';
import { useABTest } from '@/hooks/use-ab-test';
import { AB_TESTS } from '@/lib/ab-testing';
import { MetricStrip } from '@/components/marketing/metric-strip';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { FeaturesShowcase } from '@/components/marketing/features-showcase';
import { TestimonialsCarousel } from '@/components/marketing/testimonials-carousel';
import { FAQSection } from '@/components/marketing/faq-section';
import { SegmentsSection } from '@/components/marketing/segments-section';
import { WhyGastrux } from '@/components/marketing/why-gastrux';

const heroBenefits = [
  'Sai do caderno em 10 minutos',
  'Veja seu lucro real todo dia',
  'Funciona no celular',
  'Começa grátis, sem cartão',
];

function HomePageContent() {
  const { trackCTAClick } = useAnalytics();
  useScrollTracking();
  useTimeTracking('landing-page');

  const heroHeadline = useABTest(AB_TESTS.HERO_HEADLINE);
  const heroPrimaryBtn = useABTest(AB_TESTS.HERO_CTA_PRIMARY);
  const heroSecondaryBtn = useABTest(AB_TESTS.HERO_CTA_SECONDARY);
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
    <div className="min-h-screen bg-white dark:bg-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-slate-900 dark:text-slate-100">
            <ChefHat className="w-6 h-6 text-blue-600" />
            Gastrux
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="#features" className="text-slate-600 dark:text-slate-300 hover:text-blue-600">
              Funcionalidades
            </Link>
            <Link href="/casos-de-sucesso" className="text-slate-600 dark:text-slate-300 hover:text-blue-600">
              Casos de sucesso
            </Link>
            <Link href="/#segmentos" className="text-slate-600 dark:text-slate-300 hover:text-blue-600">
              Segmentos
            </Link>
            <Link href="/pricing" className="text-slate-600 dark:text-slate-300 hover:text-blue-600">
              Planos
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/auth/signin" className="hidden sm:block">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link href="/auth/signup" className="hidden sm:block">
              <Button className="gap-1">Começar Grátis</Button>
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
            <Link href="#features" className="block text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600" onClick={() => setMobileMenuOpen(false)}>
              Funcionalidades
            </Link>
            <Link href="/casos-de-sucesso" className="block text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600" onClick={() => setMobileMenuOpen(false)}>
              Casos de sucesso
            </Link>
            <Link href="/#segmentos" className="block text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600" onClick={() => setMobileMenuOpen(false)}>
              Segmentos
            </Link>
            <Link href="/pricing" className="block text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600" onClick={() => setMobileMenuOpen(false)}>
              Planos
            </Link>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex flex-col gap-2">
              <Link href="/auth/signin" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" className="w-full">Entrar</Button>
              </Link>
              <Link href="/auth/signup" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full">Começar Grátis</Button>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 sm:pt-28 pb-16 px-4 sm:px-6 bg-gradient-to-b from-blue-50 via-white to-white dark:from-slate-800 dark:via-slate-900 dark:to-slate-900">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-blue-300/20 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-violet-300/20 rounded-full blur-3xl" />
        </div>
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm mb-6 backdrop-blur">
            <span className="flex" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              ))}
            </span>
            <span>+500 donos de restaurante já trocaram o caderno</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-slate-100 mb-6 leading-tight tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
              {heroHeadline.isLoaded
                ? heroHeadline.content
                : 'Troque o caderno pelo controle de verdade'}
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 mb-8 leading-relaxed max-w-3xl mx-auto">
            {heroDescription.isLoaded
              ? heroDescription.content
              : 'Você sabe quanto custa cada prato que serve? Com a Gastrux, em 10 minutos você descobre — e nunca mais precisa de caderno, planilha ou calculadora.'}
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

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup" onClick={handlePrimaryCtaClick}>
              <Button size="lg" className="w-full sm:w-auto gap-2 shadow-lg shadow-blue-600/20">
                {heroPrimaryBtn.isLoaded ? heroPrimaryBtn.content : 'Trocar o Caderno Agora'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="#features" onClick={() => trackCTAClick('hero_view_features', '#features')}>
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                {heroSecondaryBtn.isLoaded ? heroSecondaryBtn.content : 'Ver Como Funciona'}
              </Button>
            </Link>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-5 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Sem cartão • Sem contrato • Se não gostar, volta pro caderno
          </p>
        </div>
      </section>

      <MetricStrip />

      <FeaturesShowcase />

      <HowItWorks />

      <TestimonialsCarousel />

      <SegmentsSection />

      {/* ROI Snapshot */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white">
        <div className="max-w-5xl mx-auto text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold tracking-wide uppercase mb-4">
            ROI médio em 45 dias
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            No caderno, você não vê o dinheiro sumindo. Aqui, você vê.
          </h2>
          <p className="text-base sm:text-lg text-slate-300 max-w-3xl mx-auto mb-10">
            Quem controla na mão perde entre 8% e 18% do faturamento sem perceber — em desperdício, preço errado e compra a mais. Com a Gastrux, você enxerga cada centavo em menos de 2 meses.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
            {[
              { v: 'R$ 3.200', l: 'Economia média/mês' },
              { v: '21h', l: 'Horas salvas/semana' },
              { v: '22%', l: 'Menos desperdício' },
              { v: '+18%', l: 'Margem de contribuição' },
            ].map((m, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-2xl sm:text-3xl font-bold text-white">{m.v}</div>
                <div className="text-sm text-slate-300 mt-1">{m.l}</div>
              </div>
            ))}
          </div>
          <Link href="/auth/signup" onClick={() => trackCTAClick('roi_cta', '/auth/signup')}>
            <Button size="lg" variant="secondary" className="gap-2">
              Calcular meu ROI na prática
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      <WhyGastrux />

      <FAQSection />

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-r from-blue-600 to-violet-600">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            {finalCtaHeadline.isLoaded
              ? finalCtaHeadline.content
              : 'Seu restaurante merece mais que um caderno'}
          </h2>
          <p className="text-lg mb-8 text-blue-100 max-w-2xl mx-auto">
            Começa grátis em 10 minutos. Se não gostar, volta pro caderno — sem custo, sem burocracia.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup" onClick={handleFinalCtaClick}>
              <Button size="lg" variant="secondary" className="gap-2 shadow-xl">
                {finalCtaBtn.isLoaded ? finalCtaBtn.content : 'Criar Conta Grátis'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/pricing" onClick={() => trackCTAClick('final_view_pricing', '/pricing')}>
              <Button size="lg" variant="outline" className="gap-2 bg-transparent border-white text-white hover:bg-white hover:text-blue-700">
                Ver Planos
              </Button>
            </Link>
          </div>
          <p className="text-sm text-blue-100 mt-6">+500 donos já largaram o caderno • 4,8/5 estrelas • Grátis para sempre no Starter</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6 border-t border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <Link href="/" className="flex items-center gap-2 font-bold text-xl text-white mb-3">
                <ChefHat className="w-6 h-6 text-blue-400" />
                Gastrux
              </Link>
              <p className="text-sm leading-relaxed">
                A calculadora inteligente do seu restaurante. Sai do caderno, enxerga seu lucro real e toma decisão com segurança.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">Produto</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="#features" className="hover:text-white">Funcionalidades</Link></li>
                <li><Link href="/pricing" className="hover:text-white">Planos</Link></li>
                <li><Link href="/casos-de-sucesso" className="hover:text-white">Casos de sucesso</Link></li>
                <li><Link href="/#segmentos" className="hover:text-white">Segmentos</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">Suporte</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/ajuda" className="hover:text-white">Central de Ajuda</Link></li>
                <li><Link href="/suporte" className="hover:text-white">Abrir chamado</Link></li>
                <li><Link href="/auth/signin" className="hover:text-white">Entrar</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-6 text-center text-sm">
            <p>&copy; 2026 Gastrux. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
