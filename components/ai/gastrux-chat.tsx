'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { MessageCircle, X, Send, Sparkles, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function GastruxChat() {
  const { data: session } = useSession() || {};
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  if (!session?.user) return null;

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai-insights/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          history: messages.slice(-6),
        }),
      });

      const data = await res.json();
      if (data.answer) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, não consegui processar sua pergunta. Tente novamente.' }]);
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
                <p className="text-xs text-muted-foreground mt-1">Pergunte sobre vendas, CMV, cardápio, estoque...</p>
                <div className="mt-4 space-y-2 w-full">
                  {[
                    'Qual meu CMV atual?',
                    'Quais pratos mais vendem?',
                    'Como reduzir meu custo?',
                  ].map((suggestion) => (
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
              <div
                key={i}
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'ml-auto bg-primary text-primary-foreground rounded-br-md'
                    : 'mr-auto bg-muted text-foreground rounded-bl-md',
                )}
              >
                {msg.content}
              </div>
            ))}

            {loading && (
              <div className="mr-auto bg-muted rounded-2xl rounded-bl-md px-3 py-2 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Analisando dados...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte algo sobre seu restaurante..."
                className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-[80px] min-h-[40px]"
                rows={1}
                disabled={loading}
              />
              <Button
                size="icon"
                className="h-10 w-10 rounded-xl shrink-0"
                onClick={handleSend}
                disabled={!input.trim() || loading}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          'fixed bottom-20 right-4 z-[59] w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105',
          isOpen
            ? 'bg-muted text-muted-foreground'
            : 'bg-primary text-primary-foreground',
          'md:bottom-4 md:right-20',
        )}
        title="Pergunte ao Gastrux"
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>
    </>
  );
}
