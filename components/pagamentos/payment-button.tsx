'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';
import { toast } from 'sonner';

interface PaymentButtonProps {
  orderId: string;
  amount: number;
  customerEmail?: string;
  customerName?: string;
  onSuccess?: () => void;
}

export function PaymentButton({
  orderId,
  amount,
  customerEmail,
  customerName,
  onSuccess,
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handlePayment() {
    if (!process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY) {
      toast.error('Mercado Pago não está configurado');
      return;
    }

    setLoading(true);
    try {
      // Create preference via API
      const response = await fetch('/api/pagamentos/criar-preferencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          amount,
          customerEmail,
          customerName,
          items: [
            {
              name: `Pedido ${orderId}`,
              quantity: 1,
              price: amount,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create payment preference');
      }

      const data = await response.json();
      
      // Redirect to Mercado Pago checkout
      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao processar pagamento');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handlePayment}
      disabled={loading}
      className="gap-2"
    >
      <CreditCard className="w-4 h-4" />
      {loading ? 'Processando...' : 'Pagar com Mercado Pago'}
    </Button>
  );
}
