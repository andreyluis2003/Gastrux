'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Crown, ArrowRight, X } from 'lucide-react';

interface TierInfo {
  tier: string;
  status: string;
  trialEndsAt?: string;
  features: Record<string, boolean>;
}

const TIER_NAMES: Record<string, string> = {
  starter: 'Starter (Grátis)',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
};

export function UpgradeBanner() {
  const router = useRouter();
  const [tier, setTier] = useState<TierInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/tier/check')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setTier(d))
      .catch(() => {});
  }, []);

  if (!tier || dismissed) return null;
  if (tier.tier !== 'starter') return null;

  const trialDays = tier.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(tier.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <Card className="mx-4 sm:mx-6 mt-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 relative">
      <button onClick={() => setDismissed(true)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-3">
        <Crown className="w-8 h-8 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">
            Plano atual: {TIER_NAMES[tier.tier] || tier.tier}
            {trialDays !== null && trialDays > 0 && (
              <span className="ml-2 text-sm text-amber-600">({trialDays} dias de trial restantes)</span>
            )}
          </p>
          <p className="text-sm text-gray-600">Faça upgrade para desbloquear KDS, CRM, Fidelidade, Multi-Loja e mais.</p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => router.push('/pricing')}>
          Upgrade <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </Card>
  );
}
