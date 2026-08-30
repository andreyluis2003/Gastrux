'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { CheckCircle2, MessageSquare, Star, Bug, Lightbulb, Heart, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

type FeedbackType = 'GENERAL' | 'NPS' | 'CSAT' | 'BUG' | 'IDEA';

const typeOptions: { value: FeedbackType; label: string; icon: any; color: string }[] = [
  { value: 'GENERAL', label: 'Comentario geral', icon: MessageSquare, color: 'blue' },
  { value: 'NPS', label: 'Avaliacao (NPS)', icon: Star, color: 'amber' },
  { value: 'CSAT', label: 'Satisfacao', icon: Heart, color: 'pink' },
  { value: 'BUG', label: 'Reportar bug', icon: Bug, color: 'rose' },
  { value: 'IDEA', label: 'Sugerir ideia', icon: Lightbulb, color: 'violet' },
];

export default function FeedbackSharePage() {
  const router = useRouter();
  const { data: session } = useSession() || {};
  const [type, setType] = useState<FeedbackType>('GENERAL');
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if ((type === 'NPS' || type === 'CSAT') && score == null) {
      toast.error('Selecione uma nota');
      return;
    }
    if (!comment.trim() && type !== 'NPS' && type !== 'CSAT') {
      toast.error('Escreva um comentario');
      return;
    }
    try {
      setLoading(true);
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          score: score != null ? score : undefined,
          comment: comment || undefined,
          email: (!session && email) ? email : undefined,
          page: '/feedback/share',
        }),
      });
      if (!r.ok) throw new Error('Falha');
      setSubmitted(true);
    } catch (e) {
      toast.error('Erro ao enviar');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Obrigado!</h1>
          <p className="text-gray-600 mb-6">
            Recebemos seu feedback. Toda sugestao nos ajuda a construir um produto melhor.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/roadmap"
              className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
            >
              Ver roadmap publico
            </Link>
            <button
              onClick={() => {
                setSubmitted(false);
                setType('GENERAL');
                setScore(null);
                setComment('');
              }}
              className="rounded-lg border border-gray-200 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Enviar outro
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50 p-4">
      <div className="max-w-2xl mx-auto pt-10 pb-16">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-xs font-semibold mb-3">
            <MessageSquare className="h-3 w-3" /> Feedback
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            Ajude a construir o produto
          </h1>
          <p className="text-gray-600">
            Sua opinião vale muito. Compartilhe o que você achou.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {/* Type selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">Tipo de feedback</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {typeOptions.map((opt) => {
                const Icon = opt.icon;
                const active = type === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setType(opt.value);
                      setScore(null);
                    }}
                    className={`p-3 rounded-lg border text-left transition ${
                      active
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`h-5 w-5 mb-1 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                    <div className="text-xs font-semibold text-gray-700">{opt.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {type === 'NPS' && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                O quanto você recomendaria?
              </label>
              <div className="grid grid-cols-11 gap-1">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setScore(n)}
                    className={`h-10 rounded text-sm font-semibold transition ${
                      score === n
                        ? n <= 6
                          ? 'bg-rose-500 text-white'
                          : n <= 8
                          ? 'bg-amber-500 text-white'
                          : 'bg-emerald-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>Nao recomendaria</span>
                <span>Recomendaria muito</span>
              </div>
            </div>
          )}

          {type === 'CSAT' && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Qual seu nivel de satisfacao?
              </label>
              <div className="flex gap-2 justify-center">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setScore(n)}
                    className="text-4xl transition-transform hover:scale-110"
                  >
                    {score != null && n <= score ? '★' : '☆'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Comentario {(type === 'NPS' || type === 'CSAT') && <span className="font-normal text-gray-400">(opcional)</span>}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                type === 'BUG'
                  ? 'Descreva o erro, o que esperava e o que aconteceu'
                  : type === 'IDEA'
                  ? 'Conte sua ideia em detalhes'
                  : 'Compartilhe o que achou'
              }
              className="w-full border border-gray-200 rounded-lg p-3 resize-none h-32 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {!session && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-xs text-gray-400 mt-1">Para contato em caso de follow-up</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? 'Enviando...' : 'Enviar feedback'}
          </button>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <Link
              href="/roadmap"
              className="flex items-center justify-between text-sm text-gray-600 hover:text-blue-600 group"
            >
              <span>Veja o que estamos construindo</span>
              <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
