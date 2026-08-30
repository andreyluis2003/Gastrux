'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Gift, Zap, TrendingUp, Award, CheckCircle } from 'lucide-react';

interface LoyaltyAccount {
  id: string;
  customerId: string;
  currentPoints: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  tier: string;
  joinedAt: string;
  program: {
    id: string;
    name: string;
    minPointsToRedeem: number;
    rewards: any[];
  };
  transactions: any[];
}

export default function CustomerLoyaltyPage() {
  const params = useParams();
  const customerId = params.id as string;
  const [accounts, setAccounts] = useState<LoyaltyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState<any>(null);
  const [showRedeemConfirm, setShowRedeemConfirm] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/loyalty/accounts/${customerId}`);
        if (!response.ok) throw new Error('Failed to fetch loyalty accounts');

        const data = await response.json();
        setAccounts(data);
      } catch (error) {
        console.error('Error:', error);
        toast.error('Erro ao carregar contas de fidelização');
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, [customerId]);

  const handleRedeem = async () => {
    if (!selectedReward || accounts.length === 0) return;

    try {
      setRedeeming(true);
      const response = await fetch('/api/loyalty/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          accountId: accounts[0].id,
          rewardId: selectedReward.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      toast.success("Recompensa resgatada com sucesso!");
      setShowRedeemConfirm(false);
      setSelectedReward(null);

      // Refetch accounts
      const accountsResponse = await fetch(`/api/loyalty/accounts/${customerId}`);
      const updatedAccounts = await accountsResponse.json();
      setAccounts(updatedAccounts);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
        <BackButton />
        <div className="mt-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-24 animate-pulse bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:space-y-6 sm:p-6">
      <div className="mb-8">
        <BackButton />
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Minha Fidelização</h1>
        <p className="text-sm text-gray-600">Pontos, recompensas e histórico</p>
      </div>

      {accounts.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">Nenhuma conta de fidelização encontrada</p>
        </Card>
      ) : (
        accounts.map((account) => (
          <div key={account.id} className="space-y-6">
            {/* Points Overview */}
            <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50 to-purple-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Saldo de Pontos</p>
                  <p className="text-4xl font-bold text-purple-900">{account.currentPoints}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    Tier: <span className="font-semibold">{account.tier}</span>
                  </p>
                </div>
                <Zap className="h-16 w-16 text-purple-600" />
              </div>

              <div className="mt-4 grid gap-2 border-t border-purple-200 pt-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-gray-600">Total Acumulado</p>
                  <p className="text-lg font-bold">{account.totalPointsEarned}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Total Resgatado</p>
                  <p className="text-lg font-bold">{account.totalPointsRedeemed}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Desde</p>
                  <p className="text-lg font-bold">{new Date(account.joinedAt).toLocaleDateString()}</p>
                </div>
              </div>
            </Card>

            {/* Available Rewards */}
            {account.program.rewards.length > 0 && (
              <Card className="p-6">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                  <Gift className="h-5 w-5" />
                  Recompensas Disponíveis
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {account.program.rewards.map((reward) => {
                    const canRedeem = account.currentPoints >= reward.pointsCost;
                    return (
                      <div
                        key={reward.id}
                        className={`flex flex-col rounded-lg border p-4 transition-all ${
                          canRedeem
                            ? 'border-purple-200 bg-purple-50 hover:shadow-md'
                            : 'border-gray-200 bg-gray-50 opacity-60'
                        }`}
                      >
                        <h3 className="font-semibold text-gray-900">{reward.name}</h3>
                        <p className="mt-1 text-sm text-gray-600">{reward.description}</p>
                        <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                          <div className="flex items-center gap-1 font-bold text-yellow-700">
                            <Zap className="h-4 w-4" />
                            {reward.pointsCost}
                          </div>
                          <Button
                            onClick={() => {
                              setSelectedReward(reward);
                              setShowRedeemConfirm(true);
                            }}
                            disabled={!canRedeem}
                            size="sm"
                            variant={canRedeem ? 'default' : 'outline'}
                          >
                            Resgatar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Transaction History */}
            {account.transactions.length > 0 && (
              <Card className="p-6">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                  <TrendingUp className="h-5 w-5" />
                  Histórico de Transações
                </h2>
                <div className="space-y-3">
                  {account.transactions.map((trans) => (
                    <div key={trans.id} className="flex items-center justify-between border-b border-gray-200 pb-3">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{trans.reason}</p>
                        <p className="text-xs text-gray-500">{new Date(trans.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className={`font-bold ${
                        trans.type === 'EARNING' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {trans.type === 'EARNING' ? '+' : '-'}{trans.amount}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        ))
      )}

      {/* Redeem Confirmation Modal */}
      {showRedeemConfirm && selectedReward && accounts.length > 0 && (
        <Card className="fixed bottom-4 left-4 right-4 border-2 border-purple-500 p-6 sm:left-auto sm:right-auto sm:w-96">
          <h2 className="text-xl font-bold">Confirmar Resgate</h2>
          <p className="mt-2 text-gray-600">Deseja resgatar</p>
          <p className="text-lg font-semibold text-purple-600">{selectedReward.name}</p>
          <p className="mt-2 text-gray-600">por <span className="font-bold">{selectedReward.pointsCost}</span> pontos?</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleRedeem} disabled={redeeming} className="flex-1">
              {redeeming ? 'Processando...' : 'Confirmar'}
            </Button>
            <Button
              onClick={() => {
                setShowRedeemConfirm(false);
                setSelectedReward(null);
              }}
              variant="outline"
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
