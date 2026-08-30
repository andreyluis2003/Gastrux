'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { MessageCircle, X, Star, Send, CheckCircle2, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Tab = 'nps' | 'comment' | 'idea';

export function FeedbackWidget() {
  const { data: session, status } = useSession() || {};
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('nps');
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaDesc, setIdeaDesc] = useState('');
  const [category, setCategory] = useState('GERAL');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Hide widget on admin or auth routes
  const isHidden =
    !pathname ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signin') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const d = localStorage.getItem('feedback_widget_dismissed_until');
    if (d) {
      const until = parseInt(d, 10);
      if (Date.now() < until) setDismissed(true);
    }
  }, []);

  if (isHidden || dismissed || status !== 'authenticated') return null;

  const reset = () => {
    setTab('nps');
    setNpsScore(null);
    setComment('');
    setIdeaTitle('');
    setIdeaDesc('');
    setCategory('GERAL');
    setSubmitted(false);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(reset, 300);
  };

  const remindLater = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'feedback_widget_dismissed_until',
        String(Date.now() + 7 * 24 * 60 * 60 * 1000)
      );
    }
    setDismissed(true);
    setOpen(false);
  };

  const submitNps = async () => {
    if (npsScore == null) {
      toast.error('Selecione uma nota de 0 a 10');
      return;
    }
    try {
      setLoading(true);
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'NPS',
          score: npsScore,
          comment: comment || undefined,
          page: pathname,
        }),
      });
      if (!r.ok) throw new Error('Falha');
      setSubmitted(true);
      toast.success('Obrigado pelo seu feedback!');
    } catch (e) {
      toast.error('Erro ao enviar');
    } finally {
      setLoading(false);
    }
  };

  const submitComment = async () => {
    if (!comment.trim()) {
      toast.error('Escreva um comentario');
      return;
    }
    try {
      setLoading(true);
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'GENERAL',
          comment,
          page: pathname,
        }),
      });
      if (!r.ok) throw new Error('Falha');
      setSubmitted(true);
      toast.success('Feedback recebido!');
    } catch (e) {
      toast.error('Erro ao enviar');
    } finally {
      setLoading(false);
    }
  };

  const submitIdea = async () => {
    if (!ideaTitle.trim() || ideaTitle.trim().length < 5) {
      toast.error('Titulo muito curto');
      return;
    }
    try {
      setLoading(true);
      const r = await fetch('/api/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: ideaTitle,
          description: ideaDesc,
          category,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Falha');
      }
      setSubmitted(true);
      toast.success('Ideia registrada! Veja no roadmap.');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao enviar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Enviar feedback"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all hover:scale-105"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[92vw] max-w-md rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-3 text-white">
            <div className="font-semibold text-sm">Seu feedback importa</div>
            <button
              onClick={handleClose}
              className="text-white/80 hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {submitted ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500 mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Obrigado!</h3>
              <p className="text-sm text-gray-600 mb-5">
                Suas sugestoes nos ajudam a construir algo melhor.
              </p>
              <button
                onClick={handleClose}
                className="rounded-lg bg-blue-500 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-600"
              >
                Fechar
              </button>
            </div>
          ) : (
            <>
              <div className="flex border-b border-gray-100">
                {[
                  { k: 'nps' as Tab, label: 'Nota' },
                  { k: 'comment' as Tab, label: 'Comentario' },
                  { k: 'idea' as Tab, label: 'Ideia' },
                ].map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setTab(t.k)}
                    className={cn(
                      'flex-1 py-3 text-xs font-medium transition-colors',
                      tab === t.k
                        ? 'text-blue-600 border-b-2 border-blue-500'
                        : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {tab === 'nps' && (
                  <div>
                    <p className="text-sm text-gray-700 mb-4">
                      O quanto você recomendaria este sistema para um colega?
                    </p>
                    <div className="grid grid-cols-11 gap-1 mb-4">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <button
                          key={n}
                          onClick={() => setNpsScore(n)}
                          className={cn(
                            'h-8 rounded text-xs font-semibold transition',
                            npsScore === n
                              ? n <= 6
                                ? 'bg-rose-500 text-white'
                                : n <= 8
                                ? 'bg-amber-500 text-white'
                                : 'bg-emerald-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500 mb-3">
                      <span>Nao recomendo</span>
                      <span>Recomendo totalmente</span>
                    </div>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Conte o motivo (opcional)"
                      className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none h-16 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={submitNps}
                        disabled={loading || npsScore == null}
                        className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" /> {loading ? 'Enviando...' : 'Enviar'}
                      </button>
                      <button
                        onClick={remindLater}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        Depois
                      </button>
                    </div>
                  </div>
                )}

                {tab === 'comment' && (
                  <div>
                    <p className="text-sm text-gray-700 mb-3">
                      Compartilhe elogios, criticas ou duvidas.
                    </p>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Descreva o que está funcionando bem, ou o que não está."
                      className="w-full text-sm border border-gray-200 rounded-lg p-3 resize-none h-32 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <button
                      onClick={submitComment}
                      disabled={loading || !comment.trim()}
                      className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" /> {loading ? 'Enviando...' : 'Enviar comentario'}
                    </button>
                  </div>
                )}

                {tab === 'idea' && (
                  <div>
                    <p className="text-sm text-gray-700 mb-3 flex items-center gap-1">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      Sugira uma nova feature ou melhoria.
                    </p>
                    <input
                      value={ideaTitle}
                      onChange={(e) => setIdeaTitle(e.target.value)}
                      placeholder="Titulo da ideia"
                      className="w-full text-sm border border-gray-200 rounded-lg p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <textarea
                      value={ideaDesc}
                      onChange={(e) => setIdeaDesc(e.target.value)}
                      placeholder="Descreva como essa melhoria ajudaria o seu dia a dia"
                      className="w-full text-sm border border-gray-200 rounded-lg p-2 mb-2 resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg p-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="GERAL">Geral</option>
                      <option value="PEDIDOS">Pedidos</option>
                      <option value="ESTOQUE">Estoque</option>
                      <option value="FINANCEIRO">Financeiro</option>
                      <option value="COZINHA">Cozinha</option>
                      <option value="CLIENTES">Clientes</option>
                      <option value="RELATORIOS">Relatorios</option>
                      <option value="INTEGRACOES">Integracoes</option>
                      <option value="MOBILE">Mobile</option>
                    </select>
                    <button
                      onClick={submitIdea}
                      disabled={loading || !ideaTitle.trim()}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" /> {loading ? 'Enviando...' : 'Registrar no roadmap'}
                    </button>
                    <p className="mt-2 text-[10px] text-gray-400 text-center">
                      Sua sugestao aparece publicamente em /roadmap para votacao.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
