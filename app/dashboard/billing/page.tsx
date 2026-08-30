'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { CreditCard, Calendar, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatBRL } from '@/lib/formatters';
import { STRIPE_PRICING_TIERS } from '@/lib/stripe-config';
import { useI18n } from '@/lib/i18n';

interface SubscriptionStatus {
  subscriptionTier: string;
  subscriptionStatus: string;
  billingCycleStart?: string;
  billingCycleEnd?: string;
  trialEndsAt?: string;
}

export default function BillingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    if (!session?.user?.email) return;

    const fetchSubscription = async () => {
      try {
        const response = await fetch('/api/billing/subscription-status');
        const data = await response.json();
        setSubscription(data);
      } catch (error) {
        console.error('Error:', error);
        toast.error('Erro ao carregar assinatura');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [session]);

  const currentTier = subscription
    ? Object.values(STRIPE_PRICING_TIERS).find(
        t => t.id === subscription.subscriptionTier
      )
    : STRIPE_PRICING_TIERS.STARTER;

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'past_due':
        return 'bg-red-100 text-red-800';
      case 'canceled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      active: t('billing.status.active'),
      past_due: t('billing.status.pastDue'),
      canceled: t('billing.status.canceled'),
      trialing: t('billing.status.trialing'),
    };
    return labels[status] || status;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <BackButton />
          <h1 className="text-3xl font-bold mt-4 mb-2">{t('billing.title')}</h1>
          <p className="text-slate-600">
            {t('billing.subtitle')}
          </p>
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1, 2].map(i => (
              <Card key={i} className="h-48 animate-pulse bg-slate-200" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Plan Card */}
            <Card className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">{currentTier?.name} Plan</h2>
                  <p className="text-slate-600 mt-1">{currentTier?.description}</p>
                </div>
                <span
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${getStatusBadgeColor(
                    subscription?.subscriptionStatus || 'inactive'
                  )}`}
                >
                  {getStatusLabel(subscription?.subscriptionStatus || 'inactive')}
                </span>
              </div>

              {/* Plan Details Grid */}
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-sm text-slate-600">{t('billing.monthlyPrice')}</p>
                    <p className="font-semibold">
                      {currentTier?.priceMonthly
                        ? `R$${currentTier.priceMonthly}`
                        : 'Contato'}
                    </p>
                  </div>
                </div>

                {subscription?.billingCycleEnd && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="text-sm text-slate-600">{t('billing.nextBilling')}</p>
                      <p className="font-semibold">
                        {formatDate(new Date(subscription.billingCycleEnd))}
                      </p>
                    </div>
                  </div>
                )}

                {subscription?.trialEndsAt && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-orange-500" />
                    <div>
                      <p className="text-sm text-slate-600">{t('billing.trialEnds')}</p>
                      <p className="font-semibold">
                        {formatDate(new Date(subscription.trialEndsAt))}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Plan Features */}
              <div className="mb-6">
                <h3 className="font-semibold mb-3">{t('billing.features')}</h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {currentTier?.features.slice(0, 6).map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-6 border-t">
                <Button variant="outline" onClick={() => router.push('/conta/cobranca')}>{t('billing.manage')}</Button>
              </div>
            </Card>

            {/* Upgrade Card */}
            {subscription?.subscriptionTier !== 'enterprise' && (
              <Card className="p-6 bg-blue-50 border-blue-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-blue-900">
                      {t('billing.upgrade')}
                    </h3>
                    <p className="text-blue-700 mt-1">
                      {t('billing.upgradeDesc')}
                    </p>
                  </div>
                  <Button onClick={() => window.location.href = '/pricing'}>
                    {t('billing.viewPlans')}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
