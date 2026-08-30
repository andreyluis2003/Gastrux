'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@/components/ui';
import { toast } from 'sonner';
import { Star } from 'lucide-react';

export default function FeedbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('user_id');
  const emailType = searchParams.get('email_type') || 'day7';
  const helpful = searchParams.get('helpful');

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!userId) {
      toast.error('User ID não encontrado');
      return;
    }

    if (rating === 0) {
      toast.error('Por favor, selecione uma avaliação');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/email/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailType: emailType as any,
          rating,
          helpful: helpful ? helpful === 'true' : undefined,
          comment: comment || undefined,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        toast.success('Feedback enviado com sucesso!');
        setTimeout(() => router.push('/dashboard'), 2000);
      } else {
        toast.error('Erro ao enviar feedback');
      }
    } catch (error) {
      toast.error('Erro ao enviar feedback');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="text-4xl mb-4">Obrigado!</div>
          <p className="text-gray-600 mb-4">
            Seu feedback foi recebido e nos ajuda a melhorar nossos emails.
          </p>
          <Button onClick={() => router.push('/dashboard')} className="w-full">
            Voltar ao Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-2">Seu Feedback</h1>
        <p className="text-gray-600 mb-6">
          Nos ajude a melhorar compartilhando sua opinião sobre este e-mail.
        </p>

        {/* Rating */}
        <div className="mb-6">
          <p className="font-semibold mb-3">Como você avaliaria este e-mail?</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className="text-3xl transition-transform hover:scale-110"
              >
                {star <= rating ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div className="mb-6">
          <label className="block font-semibold mb-2">
            Comentario (opcional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Compartilhe seus pensamentos..."
            className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-blue-500 resize-none h-24"
          />
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={loading || rating === 0}
          className="w-full"
        >
          {loading ? 'Enviando...' : 'Enviar Feedback'}
        </Button>
      </Card>
    </div>
  );
}
