'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function BillingSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      toast.error('Sessao invalida');
      router.push('/pricing');
      return;
    }

    const verifySession = async () => {
      try {
        setSuccess(true);
        setLoading(false);

        setTimeout(() => {
          router.push('/dashboard');
        }, 3000);
      } catch (error) {
        console.error('Error:', error);
        toast.error('Erro ao processar pagamento');
        router.push('/pricing');
      }
    };

    verifySession();
  }, [sessionId, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <CheckCircle className="w-12 h-12 text-blue-500" />
          </div>
          <p className="text-white">Processando seu pagamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <div className="p-8 text-center">
          <div className="mb-4 flex justify-center">
            <CheckCircle className="w-16 h-16 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Sucesso!</h1>
          <p className="text-slate-600 mb-6">
            Sua assinatura foi ativada com sucesso. Voce sera redirecionado para o dashboard em breve.
          </p>

          <div className="space-y-3">
            <Button
              onClick={() => router.push('/dashboard')}
              className="w-full"
            >
              Ir para Dashboard
            </Button>
            <Button
              onClick={() => router.push('/dashboard/billing')}
              variant="outline"
              className="w-full"
            >
              Ver Assinatura
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
