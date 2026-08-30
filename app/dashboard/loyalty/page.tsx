'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Gift, Zap, Award, TrendingUp } from 'lucide-react';

interface LoyaltyProgram {
  id: string;
  name: string;
  description?: string;
  pointsPerReal: number;
  minPointsToRedeem: number;
  pointsExpiryMonths: number;
  active: boolean;
  rewards: any[];
  _count: { customerAccounts: number };
}

export default function LoyaltyPage() {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/loyalty/programs');
        if (!response.ok) throw new Error('Failed to fetch programs');

        const data = await response.json();
        setPrograms(data);
      } catch (error) {
        console.error('Error:', error);
        toast.error('Erro ao carregar programas de fidelização');
      } finally {
        setLoading(false);
      }
    };

    fetchPrograms();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:space-y-6 sm:p-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <BackButton />
          <h1 className="text-xl font-bold sm:text-3xl">Programa de Fidelização</h1>
          <p className="text-sm text-gray-600">Gerencie pontos, recompensas e clientes VIP</p>
        </div>
      </div>

      {/* Programs Overview */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-gray-200" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">Nenhum programa de fidelização encontrado</p>
        </Card>
      ) : (
        programs.map((program) => (
          <Card key={program.id} className="border-l-4 border-l-purple-500 p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900">{program.name}</h2>
                <p className="mt-1 text-gray-600">{program.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/dashboard/loyalty/milestones"
                  className="text-sm font-medium text-amber-600 hover:text-amber-700 inline-flex items-center gap-1"
                >
                  <Award className="h-4 w-4" /> Marcos
                </a>
                <Award className="h-8 w-8 text-purple-600" />
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 p-4">
                <p className="text-sm text-blue-600">Pontos por Real</p>
                <p className="text-2xl font-bold text-blue-900">{Number(program.pointsPerReal)}</p>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-green-50 to-green-100 p-4">
                <p className="text-sm text-green-600">Mín. para Resgatar</p>
                <p className="text-2xl font-bold text-green-900">{program.minPointsToRedeem}</p>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-orange-50 to-orange-100 p-4">
                <p className="text-sm text-orange-600">Validade dos Pontos</p>
                <p className="text-2xl font-bold text-orange-900">{program.pointsExpiryMonths}m</p>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 p-4">
                <p className="text-sm text-purple-600">Clientes Ativos</p>
                <p className="text-2xl font-bold text-purple-900">{program._count.customerAccounts}</p>
              </div>
            </div>

            {/* Rewards */}
            {program.rewards.length > 0 && (
              <div className="mt-6 border-t pt-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <Gift className="h-5 w-5" />
                  Recompensas Ativas
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {program.rewards.map((reward) => (
                    <div
                      key={reward.id}
                      className="flex items-start justify-between rounded-lg border border-gray-200 bg-white p-3"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{reward.name}</p>
                        <p className="text-sm text-gray-600">{reward.description}</p>
                      </div>
                      <div className="ml-2 flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 font-bold text-yellow-800">
                        <Zap className="h-4 w-4" />
                        {reward.pointsCost}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))
      )}

      {/* Stats Section */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Clientes</p>
              <p className="text-2xl font-bold">
                {programs.reduce((sum, p) => sum + p._count.customerAccounts, 0)}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Recompensas</p>
              <p className="text-2xl font-bold">
                {programs.reduce((sum, p) => sum + p.rewards.length, 0)}
              </p>
            </div>
            <Gift className="h-8 w-8 text-purple-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Programas Ativos</p>
              <p className="text-2xl font-bold">{programs.filter((p) => p.active).length}</p>
            </div>
            <Award className="h-8 w-8 text-green-600" />
          </div>
        </Card>
      </div>
    </div>
  );
}
