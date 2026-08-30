'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Bot, ThumbsUp, ThumbsDown, Sparkles, MessageCircle } from 'lucide-react';

const CHATBOT_URL = 'https://apps.abacus.ai/chatllm/?appId=106ddf9f30&hideTopBar=2';

export default function AISupportPage() {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [sessionId] = useState(() => `web_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  const sendFeedback = async (thumbsUp: boolean) => {
    setFeedback(thumbsUp ? 'up' : 'down');
    try {
      // Log a synthetic interaction so we know the user gave feedback on the session
      await fetch('/api/ai-support/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          question: '[feedback de sessão]',
          answer: '[avaliação geral]',
          thumbsUp,
          rating: thumbsUp ? 5 : 2,
          resolvedIssue: thumbsUp,
        }),
      });
      toast.success(thumbsUp ? 'Obrigado pelo feedback!' : 'Obrigado, vamos melhorar!');
    } catch {
      toast.error('Erro ao enviar feedback');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="flex items-center gap-2">
            <Bot className="h-7 w-7 text-blue-600" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Suporte com IA</h1>
              <p className="text-sm text-slate-600">Tire dúvidas sobre o Gastrux 24/7</p>
            </div>
          </div>
        </div>

        <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-100">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-slate-700">
              <p className="font-semibold mb-1">IA treinada na documentação oficial</p>
              <p>Pergunte sobre: cadastro de insumos, receitas, CMV, DRE, delivery, NFC-e, Pix, Stripe, Mercado Pago, multi-unidade, alertas, e muito mais.</p>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <iframe
            src={CHATBOT_URL}
            className="w-full border-0"
            style={{ height: '800px' }}
            allow="clipboard-write"
            title="Gastrux Suporte IA"
          />
        </Card>

        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <MessageCircle className="h-4 w-4" />
              <span>A IA resolveu sua dúvida?</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={feedback === 'up' ? 'default' : 'outline'}
                onClick={() => sendFeedback(true)}
                disabled={feedback !== null}
                className={feedback === 'up' ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                <ThumbsUp className="h-4 w-4 mr-2" /> Sim
              </Button>
              <Button
                size="sm"
                variant={feedback === 'down' ? 'default' : 'outline'}
                onClick={() => sendFeedback(false)}
                disabled={feedback !== null}
                className={feedback === 'down' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                <ThumbsDown className="h-4 w-4 mr-2" /> Não
              </Button>
              <Button size="sm" variant="ghost" onClick={() => (window.location.href = '/suporte')}>
                Falar com humano
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
