// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { DollarSign, Loader2, TrendingUp } from 'lucide-react';

interface Commission {
  id: string;
  period: string;
  totalSales: number;
  commissionEarned: number;
  bonusEarned: number;
  totalEarned: number;
  status: string;
  staffMember: { user: { name: string } };
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Aprovada', color: 'bg-blue-100 text-blue-700' },
  PAID: { label: 'Paga', color: 'bg-green-100 text-green-700' },
  PARTIALLY_PAID: { label: 'Parcial', color: 'bg-orange-100 text-orange-700' },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-100 text-red-700' },
};

const fmtBRL = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/staff/commissions');
        const data = await res.json();
        setCommissions(data.commissions || []);
      } catch { toast.error('Erro ao carregar comissões'); }
      finally { setLoading(false); }
    })();
  }, []);

  const totalPending = commissions.filter(c => c.status === 'PENDING').reduce((a, c) => a + Number(c.totalEarned || 0), 0);
  const totalPaid = commissions.filter(c => c.status === 'PAID').reduce((a, c) => a + Number(c.totalEarned || 0), 0);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <BackButton />
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2 mt-1">
          <DollarSign className="h-7 w-7 text-green-600" />
          Comissões
        </h1>
        <p className="text-sm text-gray-500 mt-1">Acompanhe as comissões da equipe</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-xs text-gray-500">Pendente</p>
          <p className="text-2xl font-bold text-yellow-600">{fmtBRL(totalPending)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Total Pago</p>
          <p className="text-2xl font-bold text-green-600">{fmtBRL(totalPaid)}</p>
        </Card>
      </div>

      {commissions.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          <TrendingUp className="h-10 w-10 mx-auto mb-2 text-gray-300" />
          <p>Nenhuma comissão registrada</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {commissions.map(c => {
            const st = STATUS_MAP[c.status] || STATUS_MAP.PENDING;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{c.staffMember?.user?.name || 'Sem nome'}</h3>
                    <p className="text-sm text-gray-500">Período: {new Date(c.period).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Vendas: {fmtBRL(c.totalSales)}</p>
                      <p className="font-bold text-lg">{fmtBRL(c.totalEarned)}</p>
                    </div>
                    <Badge className={st.color}>{st.label}</Badge>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
