'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  Building2, CheckCircle2, XCircle, Clock, ArrowRight,
  Loader2, CreditCard, QrCode, ExternalLink
} from 'lucide-react';

interface StripeConnectStatus {
  connected: boolean;
  accountId?: string;
  status?: string;
  detailsSubmitted?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  requirements?: any;
}

export default function BillingConnectPage() {
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingAccount, setCreatingAccount] = useState(false);

  useEffect(() => {
    fetchStripeStatus();
  }, []);

  const fetchStripeStatus = async () => {
    try {
      const res = await fetch('/api/pagamentos/stripe/connect');
      const data = await res.json();
      setStripeStatus(data);
    } catch (err) {
      toast.error('Erro ao verificar status do Stripe Connect');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStripeAccount = async () => {
    setCreatingAccount(true);
    try {
      const res = await fetch('/api/pagamentos/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else {
        toast.success('Conta Stripe Connect já está configurada');
        fetchStripeStatus();
      }
    } catch (err) {
      toast.error('Erro ao criar conta Stripe Connect');
    } finally {
      setCreatingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BackButton href="/dashboard/billing" />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Configurar Gateways</h1>
            <p className="text-sm text-gray-500">
              Conecte seus gateways de pagamento para receber vendas
            </p>
          </div>
        </div>

        {/* Mercado Pago */}
        <Card className="p-6 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <QrCode className="w-8 h-8 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Mercado Pago</h2>
                <span className="px-2 py-0.5 bg-blue-200 text-blue-800 text-xs rounded-full font-medium">
                  Prioridade Máxima
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Aceite PIX, Cartão, Boleto e Mercado Pago Wallet.
                Configure suas credenciais de produção no painel.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md">PIX</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md">Cartão</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md">Boleto</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md">Wallet</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-green-700">Ativo</span>
            </div>
          </div>
        </Card>

        {/* Stripe Connect */}
        <Card className="p-6 border-purple-200 bg-gradient-to-br from-purple-50 to-white">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <CreditCard className="w-8 h-8 text-purple-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Stripe Connect</h2>
                <span className="px-2 py-0.5 bg-purple-200 text-purple-800 text-xs rounded-full font-medium">
                  Clientes Maiores
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Receba pagamentos via Stripe com conta Express.
                Ideal para operações com volume alto ou internacional.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-md">Cartão</span>
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-md">PIX</span>
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-md">Transfer</span>
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-md">Multi-moeda</span>
              </div>
            </div>
            <div>
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              ) : stripeStatus?.connected ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-medium text-green-700">Conectado</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">Não conectado</span>
                </div>
              )}
            </div>
          </div>

          {/* Stripe Account Details */}
          {stripeStatus?.connected && (
            <div className="mt-4 pt-4 border-t border-purple-100">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white rounded-lg border">
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="text-sm font-medium capitalize">{stripeStatus.status}</p>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <p className="text-xs text-gray-500">Dados Enviados</p>
                  <p className="text-sm font-medium">
                    {stripeStatus.detailsSubmitted ? 'Sim' : 'Pendente'}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <p className="text-xs text-gray-500">Cobranças</p>
                  <p className="text-sm font-medium">
                    {stripeStatus.chargesEnabled ? 'Ativo' : 'Bloqueado'}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <p className="text-xs text-gray-500">Saques</p>
                  <p className="text-sm font-medium">
                    {stripeStatus.payoutsEnabled ? 'Ativo' : 'Bloqueado'}
                  </p>
                </div>
              </div>
              {(!stripeStatus.detailsSubmitted || !stripeStatus.chargesEnabled) && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Onboarding incompleto. Complete seus dados para ativar cobranças.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={handleCreateStripeAccount}
                    disabled={creatingAccount}
                  >
                    {creatingAccount ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ExternalLink className="w-4 h-4 mr-2" />
                    )}
                    Continuar Onboarding
                  </Button>
                </div>
              )}
            </div>
          )}

          {!stripeStatus?.connected && !loading && (
            <div className="mt-4 pt-4 border-t border-purple-100">
              <Button
                onClick={handleCreateStripeAccount}
                disabled={creatingAccount}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {creatingAccount ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Building2 className="w-4 h-4 mr-2" />
                )}
                Conectar Conta Stripe
              </Button>
            </div>
          )}
        </Card>

        {/* Settlement Info */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Conciliação e Saques</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <QrCode className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium">Mercado Pago</p>
                  <p className="text-xs text-gray-500">Saques automáticos para conta bancária</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium">Stripe Connect</p>
                  <p className="text-xs text-gray-500">Payouts diários automáticos</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
