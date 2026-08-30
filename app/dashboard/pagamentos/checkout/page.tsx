// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  QrCode,
  Copy,
  CheckCircle,
  Clock,
  Loader2,
  ArrowLeft,
  RefreshCw,
  CreditCard,
} from 'lucide-react';

interface PixPayment {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expirationDate: string;
  amount: number;
  description: string;
  status: string;
}

export default function PixCheckoutPage() {
  const [step, setStep] = useState<'form' | 'qrcode' | 'success'>('form');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [payerName, setPayerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(1800);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const createPixPayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Informe um valor válido');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/pagamentos/mp/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          description: description || 'Pagamento PIX',
          payerEmail: payerEmail || undefined,
          payerName: payerName || undefined,
          externalReference: `checkout-${Date.now()}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar PIX');
      }

      setPixPayment(data);
      setStep('qrcode');
      setTimeLeft(1800);
      startPolling(data.paymentId);
      toast.success('QR Code PIX gerado com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao gerar PIX');
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = useCallback(async (paymentId: string) => {
    try {
      const response = await fetch(`/api/pagamentos/mp/pix?paymentId=${paymentId}`);
      const data = await response.json();

      if (data.status === 'approved') {
        setStep('success');
        if (pollingInterval) clearInterval(pollingInterval);
        toast.success('Pagamento confirmado!');
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    }
  }, [pollingInterval]);

  const startPolling = (paymentId: string) => {
    const interval = setInterval(() => {
      checkPaymentStatus(paymentId);
    }, 5000);
    setPollingInterval(interval);
  };

  useEffect(() => {
    if (step === 'qrcode' && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (timeLeft <= 0 && pollingInterval) {
      clearInterval(pollingInterval);
    }
  }, [step, timeLeft, pollingInterval]);

  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [pollingInterval]);

  const copyQrCode = () => {
    if (pixPayment?.qrCode) {
      navigator.clipboard.writeText(pixPayment.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Código PIX copiado!');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBRL = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const resetCheckout = () => {
    setStep('form');
    setAmount('');
    setDescription('');
    setPayerEmail('');
    setPayerName('');
    setPixPayment(null);
    setTimeLeft(1800);
    if (pollingInterval) clearInterval(pollingInterval);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <BackButton href="/dashboard/pagamentos" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Checkout PIX
            </h1>
            <p className="text-sm text-gray-500">
              Gere um QR Code para recebimento via PIX
            </p>
          </div>
        </div>

        {step === 'form' && (
          <Card className="p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
                <QrCode className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Novo Pagamento PIX</h2>
                <p className="text-sm text-gray-500">
                  Preencha os dados do pagamento
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Valor *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    R$
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Descrição
                </label>
                <Input
                  placeholder="Ex: Pedido #1234"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  E-mail do Pagador
                </label>
                <Input
                  type="email"
                  placeholder="cliente@email.com"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Nome do Pagador
                </label>
                <Input
                  placeholder="João Silva"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                />
              </div>

              <Button
                onClick={createPixPayment}
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando QR Code...
                  </>
                ) : (
                  <>
                    <QrCode className="mr-2 h-4 w-4" />
                    Gerar QR Code PIX
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {step === 'qrcode' && pixPayment && (
          <Card className="p-6">
            <div className="mb-4 text-center">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-700">
                <Clock className="h-4 w-4" />
                Expira em {formatTime(timeLeft)}
              </div>
              <h2 className="text-lg font-semibold">
                Escaneie o QR Code
              </h2>
              <p className="text-sm text-gray-500">
                Use o app do seu banco para pagar
              </p>
            </div>

            <div className="mb-4 flex justify-center">
              {pixPayment.qrCodeBase64 ? (
                <img
                  src={`data:image/png;base64,${pixPayment.qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="h-56 w-56 rounded-lg border"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-lg border bg-gray-100">
                  <QrCode className="h-16 w-16 text-gray-400" />
                </div>
              )}
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-3">
              <p className="mb-1 text-xs text-gray-500">Código PIX</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs">
                  {pixPayment.qrCode}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyQrCode}
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="mb-4 space-y-2 rounded-lg bg-blue-50 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Valor:</span>
                <span className="font-semibold">
                  {formatBRL(pixPayment.amount)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Descrição:</span>
                <span className="truncate max-w-[200px]">
                  {pixPayment.description}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={resetCheckout}
                className="flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              {pixPayment.ticketUrl && (
                <Button
                  variant="outline"
                  onClick={() => window.open(pixPayment.ticketUrl, '_blank')}
                  className="flex-1"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Ver Boleto
                </Button>
              )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Aguardando pagamento...
            </div>
          </Card>
        )}

        {step === 'success' && (
          <Card className="p-6 text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-10 w-10 text-emerald-600" />
              </div>
            </div>

            <h2 className="mb-2 text-xl font-semibold text-emerald-700">
              Pagamento Confirmado!
            </h2>
            <p className="mb-4 text-gray-600">
              O pagamento via PIX foi recebido com sucesso.
            </p>

            {pixPayment && (
              <div className="mb-6 space-y-2 rounded-lg bg-emerald-50 p-4 text-left">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">ID do Pagamento:</span>
                  <span className="font-mono">{pixPayment.paymentId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Valor:</span>
                  <span className="font-semibold">
                    {formatBRL(pixPayment.amount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Descrição:</span>
                  <span>{pixPayment.description}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={resetCheckout}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <QrCode className="mr-2 h-4 w-4" />
                Novo Pagamento
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
