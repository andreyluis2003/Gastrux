'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { showsAssistant } from '@/lib/navigation/app-nav';
import { useSession } from 'next-auth/react';
import { MessageCircle, X, Send, Sparkles, Loader2, Trash2, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fileToBase64, resizeImage } from '@/lib/ai/resize-image';

interface DraftLink { id: string; kind: string; resumo: string }

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Shown under an error answer (limit reached, detailed analysis outside the plan) */
  link?: string;
  /** Drafts the AI made: "Revisar e confirmar" (spec 2026-10-17 ia-implantacao §4.3) */
  drafts?: DraftLink[];
  /** "2 fotos" / "1 PDF" sent with the question */
  files?: string;
}

interface PendingFile { type: 'image' | 'pdf'; mediaType: string; data: string; name: string }
interface Onboarding { active: boolean; done: number; total: number; next: { label: string; href: string } | null; free: { used: number; limit: number } | null }

const SUGGESTIONS: Array<[string, string[]]> = [
  ['/contagem-do-dia', ['Qual espeto mais faltou esta semana?', 'Quantos espetos de frango vendi ontem?', 'Como fecho a contagem?']],
  ['/caixa', ['Quanto vendi hoje no caixa?', 'Quais despesas saíram hoje?', 'Como faço uma sangria?']],
  ['/vender', ['Quais mesas estão abertas há mais tempo?', 'Quanto tem em aberto nas mesas?', 'Como transfiro itens entre mesas?']],
  ['/dashboard/financeiro', ['Como está meu resultado este mês?', 'Quanto gastei de energia no mês passado?', 'Qual meu CMV em setembro?']],
  ['/etiquetas', ['O que vence hoje?', 'Como imprimo uma etiqueta?', 'Validades estão no meu plano?']],
  ['/receitas', ['Qual a margem do meu item mais vendido?', 'Como cadastro uma ficha técnica?', 'Quais insumos estão abaixo do mínimo?']],
];
const DEFAULT_SUGGESTIONS = ['Quanto vendi ontem?', 'Quais itens mais vendem este mês?', 'O que tem no meu plano?'];
const ONBOARDING_SUGGESTIONS = ['Importar meu cardápio por foto', 'Criar minhas mesas', 'Cadastrar minha equipe'];
const suggestionsFor = (path: string) => SUGGESTIONS.find(([p]) => path.startsWith(p))?.[1] ?? DEFAULT_SUGGESTIONS;
const MAX_IMAGES = 4;

/** The AI marks key numbers with **bold**: show them bold instead of the asterisks */
const withBold = (text: string) =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));

const filesLabel = (files: PendingFile[]) => {
  const images = files.filter((f) => f.type === 'image').length;
  if (images) return images === 1 ? '1 foto' : `${images} fotos`;
  return files.length ? '1 PDF' : '';
};

export function GastruxChat() {
  const { data: session } = useSession() || {};
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number | null } | null>(null);
  const [free, setFree] = useState<{ used: number; limit: number } | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  // Only owner and manager get the onboarding endpoint (200): they are the ones who may attach files
  const [canAttach, setCanAttach] = useState(false);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sentFiles, setSentFiles] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const hasUser = !!session?.user;
  useEffect(() => {
    if (!hasUser) return;
    let cancelled = false;
    fetch('/api/ai/onboarding', { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        setCanAttach(true);
        setOnboarding(await res.json());
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hasUser]);

  // "Fazer com a IA" in Primeiros passos: open the chat with the request filled in, not sent
  useEffect(() => {
    const onAsk = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text ?? '';
      setIsOpen(true);
      setInput(text);
    };
    window.addEventListener('gastrux:ask', onAsk);
    return () => window.removeEventListener('gastrux:ask', onAsk);
  }, []);

  // Public marketing pages have no restaurant data to ask about
  if (!session?.user || !showsAssistant(pathname)) return null;

  const addFiles = async (list: FileList | null) => {
    setFileError(null);
    if (!list?.length) return;
    const picked = Array.from(list);
    const pdfs = picked.filter((f) => f.type === 'application/pdf');
    const images = picked.filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type));
    if (pdfs.length + images.length !== picked.length) { setFileError('Envie fotos (JPG, PNG ou WebP) ou um PDF.'); return; }
    const hasImages = files.some((f) => f.type === 'image') || images.length > 0;
    const hasPdf = files.some((f) => f.type === 'pdf') || pdfs.length > 0;
    if ((hasImages && hasPdf) || pdfs.length > 1 || files.filter((f) => f.type === 'image').length + images.length > MAX_IMAGES) {
      setFileError('Envie até 4 fotos ou 1 PDF.');
      return;
    }
    try {
      const out: PendingFile[] = [];
      for (const f of images) { const r = await resizeImage(f); out.push({ type: 'image', mediaType: r.mediaType, data: r.data, name: f.name }); }
      for (const f of pdfs) {
        if (f.size > 5 * 1024 * 1024) { setFileError('PDF grande demais (até 5 MB).'); return; }
        out.push({ type: 'pdf', mediaType: 'application/pdf', data: await fileToBase64(f), name: f.name });
      }
      setFiles((prev) => [...prev, ...out]);
    } catch {
      setFileError('Não consegui abrir o arquivo. Tente outra foto.');
    }
  };

  const handleSend = async () => {
    const typed = input.trim();
    if ((!typed && !files.length) || loading || notConfigured) return;
    const question = typed || 'Leia o cardápio anexado e monte o rascunho.';
    const sending = files;

    const userMsg: ChatMessage = { role: 'user', content: question, files: filesLabel(sending) || undefined };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setFiles([]);
    setFileError(null);
    setSentFiles(sending.length > 0);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          history: messages.slice(-6).map(({ role, content }) => ({ role, content })),
          detailed,
          attachments: sending.map(({ type, mediaType, data }) => ({ type, mediaType, data })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (typeof data.used === 'number') setUsage({ used: data.used, limit: data.limit ?? null });
      if ('free' in data) setFree(data.free ?? null);
      if (res.ok && data.answer) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer, drafts: data.drafts?.length ? data.drafts : undefined }]);
      } else if (res.status === 503 && data.notConfigured) {
        setNotConfigured(true);
        setMessages(prev => [...prev, { role: 'assistant', content: 'A IA ainda não foi configurada.' }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.error || 'Desculpe, não consegui processar sua pergunta. Tente novamente.',
          link: (res.status === 429 || res.status === 403) ? data.upgradeUrl : undefined,
        }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erro de conexão. Verifique sua internet e tente novamente.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const freeShown = free ?? (usage ? null : onboarding?.free ?? null);
  const showOnboarding = !!onboarding?.active;

  return (
    <>
      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-[60] w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[70vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <div>
                <h3 className="font-semibold text-sm">Pergunte ao Gastrux</h3>
                <p className="text-xs opacity-80">IA com dados reais do seu restaurante</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={clearChat}
                  title="Limpar conversa"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <Sparkles className="w-10 h-10 text-primary/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Olá! Sou o assistente Gastrux.</p>
                {showOnboarding && onboarding ? (
                  <div className="mt-3 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
                    Faltam {onboarding.total - onboarding.done} de {onboarding.total} para começar
                    {onboarding.next && (
                      <>: próxima, <Link href={onboarding.next.href} className="font-medium underline">{onboarding.next.label}</Link></>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Pergunte sobre vendas, caixa, estoque ou como usar o sistema.</p>
                )}
                <div className="mt-4 space-y-2 w-full">
                  {(showOnboarding ? ONBOARDING_SUGGESTIONS : suggestionsFor(pathname)).map((suggestion) => (
                    <button
                      key={suggestion}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors"
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                    >
                      💡 {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn('max-w-[85%] space-y-2', msg.role === 'user' ? 'ml-auto' : 'mr-auto')}>
                <div
                  className={cn(
                    'rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md',
                  )}
                >
                  {msg.files && <span className="block text-xs opacity-80 mb-1">📎 {msg.files}</span>}
                  {msg.role === 'assistant' ? withBold(msg.content) : msg.content}
                  {msg.link && (
                    <a href={msg.link} className="block mt-1 text-xs font-medium text-primary underline">
                      Ver planos
                    </a>
                  )}
                </div>
                {msg.drafts?.map((d) => (
                  <Link
                    key={d.id}
                    href={`/implantacao/revisar/${d.id}`}
                    onClick={() => setIsOpen(false)}
                    className="block rounded-xl bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Revisar e confirmar: {d.resumo}
                  </Link>
                ))}
              </div>
            ))}

            {loading && (
              <div className="mr-auto bg-muted rounded-2xl rounded-bl-md px-3 py-2 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">{sentFiles ? 'Lendo o cardápio... (pode levar até 1 minuto)' : 'Analisando dados...'}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            {(files.length > 0 || fileError) && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                    {f.type === 'pdf' ? <FileText className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                    <span className="max-w-[120px] truncate">{f.name}</span>
                    <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} title="Tirar" className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {fileError && <span className="text-xs text-red-600">{fileError}</span>}
              </div>
            )}
            <div className="flex items-end gap-2">
              {canAttach && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-xl shrink-0"
                    onClick={() => fileRef.current?.click()}
                    disabled={loading || notConfigured}
                    title="Anexar fotos ou PDF do cardápio"
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                </>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={notConfigured ? 'A IA ainda não foi configurada.' : 'Pergunte algo sobre seu restaurante...'}
                className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-[80px] min-h-[40px]"
                rows={1}
                disabled={loading || notConfigured}
              />
              <Button
                size="icon"
                className="h-10 w-10 rounded-xl shrink-0"
                onClick={handleSend}
                disabled={(!input.trim() && !files.length) || loading || notConfigured}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={detailed}
                  onChange={(e) => setDetailed(e.target.checked)}
                  disabled={loading || notConfigured}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Análise detalhada
              </label>
              {freeShown ? (
                <span>Implantação: {freeShown.used} de {freeShown.limit} perguntas grátis</span>
              ) : usage && (
                <span>
                  {usage.limit === null ? 'Perguntas ilimitadas' : `${usage.used} de ${usage.limit} perguntas este mês`}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          // The only floating button: feedback moved into the menu (components/app-shell)
          'fixed bottom-4 right-4 z-[59] w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105',
          isOpen
            ? 'bg-muted text-muted-foreground'
            : 'bg-primary text-primary-foreground',
        )}
        title="Pergunte ao Gastrux"
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        {showOnboarding && !isOpen && (
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-white" aria-label="Implantação em andamento" />
        )}
      </button>
    </>
  );
}
