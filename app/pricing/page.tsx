// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { CheckCircle2, X, Zap, ArrowRight, ChefHat, ShieldCheck, HelpCircle, RefreshCw, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { STRIPE_PRICING_TIERS } from '@/lib/stripe-config';
import { TestimonialsCarousel } from '@/components/marketing/testimonials-carousel';
import { FAQSection } from '@/components/marketing/faq-section';
import { GatewayChoiceDialog } from '@/components/billing/gateway-choice-dialog';
import { cn } from '@/lib/utils';

const FEATURES_COMPARISON = [
  { category: 'Transações', name: 'Transações Diárias' },
  { category: 'Dados', name: 'Ingredientes' },
  { category: 'Dados', name: 'Receitas' },
  { category: 'Usuários', name: 'Usuários Simultâneos' },
  { category: 'POS', name: 'Sistema PDV' },
  { category: 'POS', name: 'Relatórios de Vendas' },
  { category: 'Estoque', name: 'Gerenciamento de Estoque' },
  { category: 'Estoque', name: 'Alertas de Baixa Quantidade' },
  { category: 'Produção', name: 'Planejamento de Produção' },
  { category: 'Produção', name: 'Previsão de Demanda (ML)' },
  { category: 'Analytics', name: 'Dashboard Analítico' },
  { category: 'Analytics', name: 'Relatórios Executivos' },
  { category: 'Integrações', name: 'Integração iFood/Rappi/Uber' },
  { category: 'Integrações', name: 'Multi-loja' },
  { category: 'Suporte', name: 'Suporte Email' },
  { category: 'Suporte', name: 'Suporte Prioritário' },
  { category: 'Premium', name: 'Nota Fiscal Eletrônica (NF-e)' },
  { category: 'Premium', name: 'API customizada' },
];

const getTierFeatureValue = (tierId: string, featureName: string) => {
  const tier = STRIPE_PRICING_TIERS[tierId.toUpperCase()] || STRIPE_PRICING_TIERS[tierId];
  if (!tier) return false;

  const featureMap: Record<string, any> = {
    'Transações Diárias': tier.limits.dailyTransactions === 999999 ? '∞' : `${tier.limits.dailyTransactions}/dia`,
    'Ingredientes': tier.limits.ingredients === 999999 ? '∞' : `${tier.limits.ingredients}`,
    'Receitas': tier.limits.recipes === 999999 ? '∞' : `${tier.limits.recipes}`,
    'Usuários Simultâneos': tier.limits.users === 999999 ? '∞' : tier.limits.users,
    'Sistema PDV': tierId !== 'starter',
    'Relatórios de Vendas': tierId !== 'starter',
    'Gerenciamento de Estoque': true,
    'Alertas de Baixa Quantidade': true,
    'Planejamento de Produção': tierId !== 'starter',
    'Previsão de Demanda (ML)': ['pro', 'business', 'enterprise'].includes(tierId),
    'Dashboard Analítico': tierId !== 'starter',
    'Relatórios Executivos': ['business', 'enterprise'].includes(tierId),
    'Integração iFood/Rappi/Uber':
      tier.limits.deliveryIntegrations > 0
        ? (tier.limits.deliveryIntegrations === 999999 ? 'Ilimitado' : `${tier.limits.deliveryIntegrations} apps`)
        : false,
    'Multi-loja':
      tier.limits.locations && tier.limits.locations > 0
        ? (tier.limits.locations === 999999 ? 'Ilimitado' : `${tier.limits.locations} lojas`)
        : false,
    'Suporte Email': true,
    'Suporte Prioritário': ['business', 'enterprise'].includes(tierId),
    'Nota Fiscal Eletrônica (NF-e)': tierId === 'enterprise',
    'API customizada': tierId === 'enterprise',
  };

  return featureMap[featureName] ?? false;
};

export default function PricingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [mercadoPagoEnabled, setMercadoPagoEnabled] = useState(false);
  const [gatewayDialogTier, setGatewayDialogTier] = useState<{ id: string; name: string } | null>(null);

  const tiers = Object.values(STRIPE_PRICING_TIERS);

  useEffect(() => {
    fetch('/api/billing/gateways')
      .then((res) => res.json())
      .then((data) => setMercadoPagoEnabled(!!data.mercadoPago))
      .catch(() => setMercadoPagoEnabled(false));
  }, []);

  const startStripeCheckout = async (tierId: string) => {
    setLoading(tierId);
    try {
      const response = await fetch('/api/billing/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId, billing }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error('Erro ao criar sessão de checkout');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Erro ao processar checkout');
    } finally {
      setLoading(null);
    }
  };

  const handleUpgrade = async (tier: { id: string; name: string }) => {
    const tierId = tier.id;

    if (!session?.user?.email) {
      toast.info('Faça login ou crie sua conta para continuar');
      router.push('/auth/signup?redirect=/pricing');
      return;
    }

    if (tierId === 'starter') {
      toast.success('Você já tem acesso ao plano Starter. Bem-vindo!');
      router.push('/dashboard');
      return;
    }

    if (tierId === 'enterprise') {
      toast.info('Um consultor vai falar com você para montar o plano Enterprise');
      router.push('/suporte/novo?tipo=enterprise');
      return;
    }

    if (mercadoPagoEnabled) {
      setGatewayDialogTier(tier);
      return;
    }

    await startStripeCheckout(tierId);
  };

  const annualSavings = (tier: any) => {
    if (!tier.priceMonthly || !tier.priceAnnual) return 0;
    const monthlyTotal = tier.priceMonthly * 12;
    const saved = monthlyTotal - tier.priceAnnual;
    return Math.round((saved / monthlyTotal) * 100);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-slate-900 dark:text-slate-100">
            <ChefHat className="w-6 h-6 text-blue-600" />
            Gastrux
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/auth/signin" className="hidden sm:block">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link href="/auth/signup">
              <Button>Começar Grátis</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-12 px-4 sm:px-6 bg-gradient-to-b from-blue-50 via-white to-white dark:from-slate-800 dark:via-slate-900 dark:to-slate-900">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-semibold tracking-wide uppercase mb-3">
            Planos simples e transparentes
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Escolha o plano certo. Cresce com você.
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-8">
            Comece gratís no Starter. Upgrade quando precisar. Sem letras miúdas, sem fidelização.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setBilling('monthly')}
              className={cn(
                'px-5 py-2 text-sm font-semibold rounded-full transition',
                billing === 'monthly'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={cn(
                'px-5 py-2 text-sm font-semibold rounded-full transition flex items-center gap-2',
                billing === 'annual'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              )}
            >
              Anual
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                -15%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {tiers.map((tier) => {
              const isPopular = tier.id === 'business';
              const isCustom = tier.priceMonthly === null;
              const priceToShow =
                billing === 'annual' && tier.priceAnnual !== null
                  ? Math.round(tier.priceAnnual / 12)
                  : tier.priceMonthly;
              const totalAnnual = tier.priceAnnual;
              const savings = annualSavings(tier);

              return (
                <div
                  key={tier.id}
                  className={cn(
                    'relative bg-white dark:bg-slate-900 rounded-2xl border transition-all overflow-hidden',
                    isPopular
                      ? 'border-blue-500 shadow-2xl ring-2 ring-blue-500 lg:scale-105'
                      : 'border-slate-200 dark:border-slate-700 hover:shadow-xl'
                  )}
                >
                  {isPopular && (
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-blue-500 to-violet-500 text-white text-xs font-semibold text-center py-1.5 tracking-wider uppercase">
                      ⭐ Mais escolhido
                    </div>
                  )}

                  <div className={cn('p-6 flex flex-col h-full', isPopular && 'pt-10')}>
                    <div className="mb-5">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">{tier.name}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 min-h-[2.5rem]">{tier.description}</p>
                    </div>

                    {/* Price */}
                    <div className="mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
                      {isCustom ? (
                        <div>
                          <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                            Personalizado
                          </span>
                          <p className="text-xs text-slate-500 mt-2">
                            Entre em contato para uma cotação
                          </p>
                        </div>
                      ) : tier.priceMonthly === 0 ? (
                        <div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-5xl font-bold text-slate-900 dark:text-slate-100">Grátis</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">Para sempre. Sem cartão.</p>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-xl text-slate-600 dark:text-slate-400">R$</span>
                            <span className="text-5xl font-bold text-slate-900 dark:text-slate-100">
                              {priceToShow}
                            </span>
                            <span className="text-sm text-slate-600 dark:text-slate-400">/mês</span>
                          </div>
                          {billing === 'annual' && tier.priceAnnual !== null && savings > 0 && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-2">
                              R$ {totalAnnual}/ano — economize {savings}%
                            </p>
                          )}
                          {billing === 'monthly' && (
                            <p className="text-xs text-slate-500 mt-2">
                              Cobrado mensalmente. Cancele quando quiser.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* CTA */}
                    <Button
                      onClick={() => handleUpgrade(tier)}
                      disabled={loading === tier.id}
                      className={cn(
                        'w-full mb-6',
                        isPopular && 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white'
                      )}
                      variant={isPopular ? 'default' : tier.id === 'starter' ? 'default' : 'outline'}
                    >
                      {loading === tier.id ? (
                        'Processando...'
                      ) : tier.id === 'starter' ? (
                        <>Começar Grátis<ArrowRight className="w-4 h-4 ml-2" /></>
                      ) : isCustom ? (
                        <>Falar com vendas<ArrowRight className="w-4 h-4 ml-2" /></>
                      ) : (
                        <>Começar {billing === 'annual' ? 'plano anual' : '30 dias grátis'}<ArrowRight className="w-4 h-4 ml-2" /></>
                      )}
                    </Button>

                    {/* Key Features */}
                    <div className="space-y-2.5 flex-1">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                        Inclui
                      </p>
                      {tier.features.map((feature: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <span>Dados seguros (AWS)</span>
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-emerald-500" />
              <span>Cancele quando quiser</span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
              <span>4,8/5 em 500+ restaurantes</span>
            </div>
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-500" />
              <span>Suporte em português</span>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Toggle */}
      <section className="py-8 px-4 sm:px-6 bg-slate-50 dark:bg-slate-800/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center justify-center gap-2 mx-auto"
            >
              {showComparison ? 'Ocultar' : 'Ver'} comparação completa de recursos
              <ArrowRight className={cn('w-4 h-4 transition', showComparison && 'rotate-90')} />
            </button>
          </div>

          {showComparison && (
            <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-5 py-4 text-left text-slate-700 dark:text-slate-300 font-semibold min-w-[220px]">
                      Recurso
                    </th>
                    {tiers.map((tier: any) => (
                      <th
                        key={tier.id}
                        className={cn(
                          'px-5 py-4 text-center font-semibold min-w-[140px]',
                          tier.id === 'business'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-700 dark:text-slate-300'
                        )}
                      >
                        {tier.name}
                        {tier.id === 'business' && (
                          <span className="block text-xs font-normal text-blue-500 mt-0.5">Mais escolhido</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURES_COMPARISON.map((feature, idx) => {
                    const showCategory =
                      idx === 0 || FEATURES_COMPARISON[idx - 1].category !== feature.category;
                    return (
                      <>
                        {showCategory && (
                          <tr key={`cat-${idx}`} className="bg-slate-100/60 dark:bg-slate-800/30">
                            <td
                              colSpan={tiers.length + 1}
                              className="px-5 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                            >
                              {feature.category}
                            </td>
                          </tr>
                        )}
                        <tr
                          key={idx}
                          className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/20"
                        >
                          <td className="px-5 py-3.5 text-slate-800 dark:text-slate-200 font-medium">
                            {feature.name}
                          </td>
                          {tiers.map((tier: any) => {
                            const value = getTierFeatureValue(tier.id, feature.name);
                            return (
                              <td
                                key={tier.id}
                                className={cn(
                                  'px-5 py-3.5 text-center',
                                  tier.id === 'business' && 'bg-blue-50/40 dark:bg-blue-950/20'
                                )}
                              >
                                {typeof value === 'boolean' ? (
                                  value ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                                  ) : (
                                    <X className="w-4 h-4 text-slate-300 dark:text-slate-600 mx-auto" />
                                  )
                                ) : (
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {value}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Testimonials */}
      <TestimonialsCarousel />

      {/* FAQ */}
      <FAQSection />

      {/* Final CTA */}
      <section className="py-16 px-4 sm:px-6 bg-gradient-to-r from-blue-600 to-violet-600">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ainda tem dúvidas?
          </h2>
          <p className="text-base sm:text-lg mb-8 text-blue-100">
            Comece gratuitamente hoje. Se não servir, é só cancelar.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup">
              <Button size="lg" variant="secondary" className="gap-2">
                Começar Grátis
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/suporte/novo">
              <Button size="lg" variant="outline" className="gap-2 bg-transparent border-white text-white hover:bg-white hover:text-blue-700">
                Falar com vendas
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {gatewayDialogTier && (
        <GatewayChoiceDialog
          open={!!gatewayDialogTier}
          onOpenChange={(open) => { if (!open) setGatewayDialogTier(null); }}
          tierId={gatewayDialogTier.id}
          tierName={gatewayDialogTier.name}
          billing={billing}
          mercadoPagoEnabled={mercadoPagoEnabled}
        />
      )}
    </div>
  );
}
