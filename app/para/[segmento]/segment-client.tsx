'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChefHat, ArrowRight, Check, ShieldCheck, Beer, BarChart3, Package, Utensils, TrendingUp, Users, Brain, Truck, Smartphone, Clock, DollarSign, Layers, Zap, Star, Globe, ShoppingCart, Heart, Shield, Target, Percent, Award, CalendarDays, PieChart, Boxes, ThermometerSun, IceCream, Cake, Store, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segment, SEGMENTS } from '@/lib/marketing/segments';
import { FAQSection } from '@/components/marketing/faq-section';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3, Package, Utensils, TrendingUp, Users, Brain, Truck, Smartphone, Clock,
  DollarSign, Layers, Zap, Star, Globe, ShoppingCart, Heart, Shield, Target, Percent,
  Award, CalendarDays, PieChart, Boxes, ThermometerSun, IceCream, Cake, Store, Beer,
};

function LeadCaptureSection({ segment, segmentName }: { segment: string; segmentName: string }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email && !phone) return;
    setSending(true);
    try {
      await fetch('/api/marketing/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'SEGMENT_PAGE',
          sourceDetail: `/para/${segment}`,
          email: email || undefined,
          phoneNumber: phone || undefined,
          name: name || undefined,
          segment,
        }),
      });
      setSent(true);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <section className="py-16 px-4 sm:px-6 bg-blue-50 dark:bg-slate-900">
        <div className="max-w-xl mx-auto text-center">
          <div className="w-14 h-14 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Pronto!</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Entraremos em contato em breve com uma demonstração personalizada para {segmentName}.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 px-4 sm:px-6 bg-blue-50 dark:bg-slate-900">
      <div className="max-w-xl mx-auto text-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Quer uma demonstração gratuita?
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Deixe seu contato e mostraremos como o Gastrux pode transformar sua {segmentName}.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Seu nome"
            className="w-full h-11 rounded-lg border border-slate-300 dark:border-slate-600 px-4 text-sm bg-white dark:bg-slate-800"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="Seu e-mail"
              className="h-11 rounded-lg border border-slate-300 dark:border-slate-600 px-4 text-sm bg-white dark:bg-slate-800"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <input
              type="tel"
              placeholder="WhatsApp (opcional)"
              className="h-11 rounded-lg border border-slate-300 dark:border-slate-600 px-4 text-sm bg-white dark:bg-slate-800"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full gap-2" disabled={sending || (!email && !phone)}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Quero uma Demonstração
          </Button>
          <p className="text-[11px] text-slate-400">Sem compromisso. Sem spam.</p>
        </form>
      </div>
    </section>
  );
}

export function SegmentPageClient({ segment }: { segment: Segment }) {
  const related = SEGMENTS.filter((s) => s.slug !== segment.slug).slice(0, 4);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-slate-900 dark:text-slate-100">
            <ChefHat className="w-6 h-6 text-blue-600" />
            Gastrux
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/#features" className="text-slate-600 dark:text-slate-300 hover:text-blue-600">Funcionalidades</Link>
            <Link href="/#segmentos" className="text-slate-600 dark:text-slate-300 hover:text-blue-600">Segmentos</Link>
            <Link href="/pricing" className="text-slate-600 dark:text-slate-300 hover:text-blue-600">Planos</Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/auth/signin" className="hidden sm:block">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link href="/auth/signup">
              <Button className="gap-1">Começar Grátis</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className={`pt-28 pb-16 px-4 sm:px-6 bg-gradient-to-br ${segment.color} text-white relative overflow-hidden`}>
        <div className="absolute inset-0 bg-black/30" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <span className="text-5xl mb-4 block">{segment.emoji}</span>
          <h1 className="text-3xl sm:text-5xl font-bold mb-5 leading-tight">{segment.heroHeadline}</h1>
          <p className="text-base sm:text-lg text-white max-w-2xl mx-auto mb-8">{segment.heroDescription}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup">
              <Button size="lg" className="w-full sm:w-auto bg-white text-slate-900 hover:bg-white/90 gap-2">
                Testar Grátis por 7 dias <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" className="w-full sm:w-auto bg-white/20 border border-white/40 text-white hover:bg-white/30 backdrop-blur-sm">
                Ver Planos
              </Button>
            </Link>
          </div>
          <p className="text-sm text-white/90 mt-4 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            Sem cartão • Cancele quando quiser
          </p>
        </div>
      </section>

      {/* Pain Points */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-center mb-3">
            Você se identifica com esses problemas?
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-center mb-10 max-w-2xl mx-auto">
            Se qualquer um deles faz parte da sua rotina, a Gastrux foi feita pra você.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {segment.painPoints.map((pp, i) => (
              <div key={i} className="flex gap-3 items-start bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl p-4">
                <span className="text-red-500 text-lg mt-0.5">✗</span>
                <p className="text-slate-700 dark:text-slate-200">{pp}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-4 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-center mb-3">
            Como a Gastrux resolve
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-center mb-10 max-w-2xl mx-auto">
            Funcionalidades específicas para {segment.shortName.toLowerCase()}.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {segment.benefits.map((b, i) => {
              const Icon = ICON_MAP[b.icon] || Star;
              return (
                <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{b.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{b.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-center mb-10">
            Resultados reais de quem usa
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {segment.stats.map((s, i) => (
              <div key={i} className="text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{s.value}</div>
                <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-16 px-4 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <Star className="w-8 h-8 text-yellow-500 mx-auto mb-4" />
          <blockquote className="text-xl sm:text-2xl font-medium text-slate-900 dark:text-white mb-6 italic leading-relaxed">
            &ldquo;{segment.testimonial.quote}&rdquo;
          </blockquote>
          <p className="font-semibold text-slate-900 dark:text-white">{segment.testimonial.author}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{segment.testimonial.role}</p>
        </div>
      </section>

      {/* Lead Capture Form */}
      <LeadCaptureSection segment={segment.slug} segmentName={segment.shortName} />

      <FAQSection />

      {/* Final CTA */}
      <section className={`py-20 px-4 sm:px-6 bg-gradient-to-br ${segment.color} text-white relative overflow-hidden`}>
        <div className="absolute inset-0 bg-black/30" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">{segment.cta.headline}</h2>
          <p className="text-base sm:text-lg text-white mb-8 max-w-xl mx-auto">{segment.cta.description}</p>
          <Link href="/auth/signup">
            <Button size="lg" className="bg-white text-slate-900 hover:bg-white/90 gap-2">
              Começar Agora — É Grátis <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Related segments */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-8">
            Veja também
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/para/${r.slug}`}
                className="group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center hover:shadow-lg hover:border-blue-300 transition-all"
              >
                <span className="text-2xl block mb-2">{r.emoji}</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{r.shortName}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-10 px-4 sm:px-6 border-t border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-white font-bold">
            <ChefHat className="w-5 h-5 text-blue-500" /> Gastrux
          </Link>
          <div className="flex gap-6 text-sm">
            <Link href="/#segmentos" className="hover:text-white">Segmentos</Link>
            <Link href="/pricing" className="hover:text-white">Planos</Link>
            <Link href="/casos-de-sucesso" className="hover:text-white">Casos de sucesso</Link>
          </div>
          <p className="text-xs">&copy; 2026 Gastrux. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
