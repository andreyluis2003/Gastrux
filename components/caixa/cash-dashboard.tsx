'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/formatters';
import { DollarSign, TrendingDown, Check, AlertCircle } from 'lucide-react';

export interface CashRegister {
  id: string;
  name: string;
  openingBalance: number;
  expectedBalance: number;
  actualBalance: number;
  active: boolean;
  openedAt: string | null;
  closedAt: string | null;
}

export function CashDashboard() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRegisters();
  }, []);

  async function fetchRegisters() {
    try {
      const response = await fetch('/api/caixa');
      if (response.ok) {
        const data = await response.json();
        setRegisters(data);
      }
    } catch (error) {
      console.error('Error fetching cash registers:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Carregando...</div>;
  }

  const activeRegister = registers.find(r => r.active);
  const totalCash = registers.reduce((sum, r) => sum + parseFloat(r.expectedBalance.toString()), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total em Caixa</p>
              <p className="text-2xl font-bold">{formatBRL(totalCash)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-600" />
          </div>
        </Card>

        {activeRegister && (
          <>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo Esperado</p>
                  <p className="text-2xl font-bold">{formatBRL(parseFloat(activeRegister.expectedBalance.toString()))}</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Diferença</p>
                  <p className="text-2xl font-bold">
                    {formatBRL(
                      parseFloat(activeRegister.actualBalance.toString()) -
                      parseFloat(activeRegister.expectedBalance.toString())
                    )}
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Active Register */}
      {activeRegister ? (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Caixa Aberto: {activeRegister.name}</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>Saldo de Abertura:</span>
              <span>{formatBRL(parseFloat(activeRegister.openingBalance.toString()))}</span>
            </div>
            <div className="flex justify-between">
              <span>Saldo Esperado:</span>
              <span>{formatBRL(parseFloat(activeRegister.expectedBalance.toString()))}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-3">
              <span>Saldo Contado:</span>
              <span>{formatBRL(parseFloat(activeRegister.actualBalance.toString()))}</span>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">Nenhum caixa aberto no momento</p>
        </Card>
      )}

      {/* Recent Registers */}
      <div>
        <h3 className="font-semibold mb-4">Histórico de Caixas</h3>
        <div className="space-y-2">
          {registers.map(register => (
            <Card key={register.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium">{register.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {register.active ? 'Em Aberto' : 'Fechado'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatBRL(parseFloat(register.expectedBalance.toString()))}</p>
                  {register.active && <Check className="w-5 h-5 text-green-600 ml-auto" />}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
