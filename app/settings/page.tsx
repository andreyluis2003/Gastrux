'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui';
import { CreditCard, Gift, LogOut, User, Calendar, Zap, Crown, ChevronRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/formatters';

interface SubscriptionData {
  subscriptionTier: string;
  subscriptionStatus: string;
  trialEndsAt?: string;
  billingCycleEnd?: string;
}

const tierLabels: Record<string, string> = {
  starter: 'Starter',
  pro: 'Profissional',
  enterprise: 'Enterprise',
};

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  trialing: 'Período de Teste',
  trial_ended: 'Trial Encerrado',
  past_due: 'Pagamento Pendente',
  canceled: 'Cancelado',
  inactive: 'Inativo',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  trialing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  trial_ended: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  past_due: 'bg-red-500/20 text-red-400 border-red-500/30',
  canceled: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  inactive: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession() || {};
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  useEffect(() => {
    if (!session?.user?.email) return;
    const fetchSub = async () => {
      try {
        const res = await fetch('/api/billing/subscription-status');
        if (res.ok) {
          const data = await res.json();
          setSubscription(data);
        }
      } catch (e) {
        console.error('Error fetching subscription:', e);
      } finally {
        setLoadingSub(false);
      }
    };
    fetchSub();
  }, [session]);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push('/auth/signin');
  };

  const tier = subscription?.subscriptionTier || 'starter';
  const status = subscription?.subscriptionStatus || 'inactive';

  const settings = [
    {
      icon: Gift,
      title: 'Programa de Referência',
      description: 'Indique amigos e ganhe créditos',
      href: '/settings/referral',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: User,
      title: 'Meu Perfil',
      description: 'Editar informações pessoais',
      href: '/conta',
      color: 'from-blue-500 to-cyan-500',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-900 pt-20 px-4 sm:px-6 lg:px-8 pb-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <BackButton />
          <h1 className="text-3xl font-bold mt-4 text-white">Configurações</h1>
          <p className="text-slate-400 mt-2">Gerencie sua conta e preferências</p>
        </div>

        {/* Subscription Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-yellow-500" />
            Assinatura
          </h2>

          <Link href="/dashboard/billing">
            <Card variant="glass-dark-interactive" className="relative overflow-hidden group">
              {/* Gradient accent */}
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-orange-500/5 group-hover:from-yellow-500/10 group-hover:to-orange-500/10 transition-all" />
              
              <div className="relative p-6 sm:p-8">
                {loadingSub ? (
                  <div className="flex items-center gap-3 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Carregando assinatura...</span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 text-white">
                          <Crown className="w-7 h-7" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white">
                            Plano {tierLabels[tier] || tier}
                          </h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border mt-1 ${statusColors[status] || statusColors.inactive}`}>
                            {statusLabels[status] || status}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors hidden sm:block" />
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {subscription?.trialEndsAt && (
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-orange-400" />
                          <div>
                            <p className="text-xs text-slate-500">Trial até</p>
                            <p className="text-sm font-medium text-slate-300">
                              {formatDate(new Date(subscription.trialEndsAt))}
                            </p>
                          </div>
                        </div>
                      )}

                      {subscription?.billingCycleEnd && (
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-green-400" />
                          <div>
                            <p className="text-xs text-slate-500">Próxima cobrança</p>
                            <p className="text-sm font-medium text-slate-300">
                              {formatDate(new Date(subscription.billingCycleEnd))}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* CTA for trial_ended or inactive */}
                    {(status === 'trial_ended' || status === 'inactive' || status === 'canceled') && (
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <p className="text-sm text-orange-400 font-medium">
                          ⚡ Faça upgrade para continuar usando todos os recursos
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-slate-500 mt-4">
                      Clique para gerenciar plano e faturamento →
                    </p>
                  </>
                )}
              </div>
            </Card>
          </Link>
        </div>

        {/* Other Settings Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {settings.map((setting, idx) => {
            const IconComponent = setting.icon;
            return (
              <Link href={setting.href} key={idx}>
                <Card variant="glass-dark-interactive" className="h-full hover:border-blue-500/50 transition-colors cursor-pointer overflow-hidden group relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${setting.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
                  <div className="relative p-6 sm:p-8">
                    <div className={`inline-flex items-center justify-center w-14 h-14 rounded-lg bg-gradient-to-br ${setting.color} text-white mb-4`}>
                      <IconComponent className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold mb-2 text-white">{setting.title}</h3>
                    <p className="text-sm sm:text-base text-slate-400">{setting.description}</p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Logout Button */}
        <Card variant="glass-dark" className="p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold mb-2 text-white">Sair da Conta</h3>
              <p className="text-slate-400">Desconectar desta sessão</p>
            </div>
            <Button
              onClick={handleLogout}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
