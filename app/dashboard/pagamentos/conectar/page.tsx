'use client';

import { BackButton } from '@/components/ui/back-button';
import { MpConnectCard } from '@/components/payments/mp-connect-card';

export default function ConectarMercadoPagoPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <BackButton href="/dashboard/pagamentos" label="Voltar aos Pagamentos" />
        <h1 className="text-2xl font-bold">Receber pagamentos online</h1>
        <MpConnectCard />
      </div>
    </div>
  );
}
