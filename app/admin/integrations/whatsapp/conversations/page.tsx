'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import {
  MessageSquare,
  Loader2,
  User,
  ShoppingBag,
  ChevronRight,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface Conversation {
  id: string;
  phoneNumber: string;
  customerName: string | null;
  profileName: string | null;
  state: string;
  cartTotal: string | number;
  lastMessageAt: string;
  orderSessionId: string | null;
  _count: { messages: number };
  orderSession?: { id: string; status: string } | null;
}

interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  content: string;
  createdAt: string;
}

const stateLabels: Record<string, { label: string; color: string }> = {
  GREETING: { label: 'Início', color: 'bg-gray-100 text-gray-700' },
  MENU_BROWSING: { label: 'Navegando', color: 'bg-blue-100 text-blue-700' },
  CATEGORY_SELECTED: { label: 'Categoria', color: 'bg-blue-100 text-blue-700' },
  ITEM_SELECTED: { label: 'Item selecionado', color: 'bg-blue-100 text-blue-700' },
  CART_REVIEW: { label: 'Carrinho', color: 'bg-amber-100 text-amber-700' },
  ORDER_TYPE: { label: 'Tipo pedido', color: 'bg-amber-100 text-amber-700' },
  COLLECTING_INFO: { label: 'Coletando dados', color: 'bg-amber-100 text-amber-700' },
  CONFIRMING: { label: 'Confirmando', color: 'bg-violet-100 text-violet-700' },
  COMPLETED: { label: 'Finalizada', color: 'bg-green-100 text-green-700' },
  HUMAN_HANDOFF: { label: 'Humano', color: 'bg-rose-100 text-rose-700' },
  IDLE: { label: 'Inativa', color: 'bg-gray-100 text-gray-500' },
};

export default function WhatsAppConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [filter, setFilter] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const qs = filter ? `?state=${filter}` : '';
      const res = await fetch(`/api/admin/whatsapp/conversations${qs}`);
      if (res.ok) {
        const d = await res.json();
        setConversations(d.conversations || []);
      }
    } catch {
      toast.error('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  const openConversation = async (c: Conversation) => {
    setSelected(c);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/admin/whatsapp/conversations/${c.id}`);
      if (res.ok) {
        const d = await res.json();
        setMessages(d.conversation.messages || []);
      }
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
              <MessageSquare className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
              Conversas WhatsApp
            </h1>
            <p className="text-sm text-gray-600 mt-1">Histórico de atendimentos do bot</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {['', 'GREETING', 'MENU_BROWSING', 'CART_REVIEW', 'CONFIRMING', 'COMPLETED', 'HUMAN_HANDOFF'].map(
            (s) => (
              <Button
                key={s || 'all'}
                size="sm"
                variant={filter === s ? 'default' : 'outline'}
                onClick={() => setFilter(s)}
              >
                {s === '' ? 'Todas' : stateLabels[s]?.label || s}
              </Button>
            ),
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        ) : conversations.length === 0 ? (
          <Card className="p-12 text-center border-gray-200">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma conversa encontrada.</p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {conversations.map((c) => {
              const st = stateLabels[c.state] || { label: c.state, color: 'bg-gray-100' };
              return (
                <Card
                  key={c.id}
                  className="p-4 border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => openConversation(c)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="p-2 bg-green-100 rounded-full flex-shrink-0">
                        <User className="h-5 w-5 text-green-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">
                            {c.customerName || c.profileName || c.phoneNumber}
                          </p>
                          <Badge className={st.color + ' text-xs'}>{st.label}</Badge>
                          {c.orderSessionId && (
                            <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700">
                              <ShoppingBag className="h-3 w-3 mr-1" /> Pedido
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.phoneNumber} · {c._count.messages} mensagens ·{' '}
                          {new Date(c.lastMessageAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {Number(c.cartTotal) > 0 && (
                        <span className="text-sm font-medium text-gray-700">
                          {fmtBRL(Number(c.cartTotal))}
                        </span>
                      )}
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detail drawer (inline modal) */}
        {selected && (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setSelected(null)}
          >
            <Card
              className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col bg-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div>
                  <p className="font-semibold">
                    {selected.customerName || selected.profileName || selected.phoneNumber}
                  </p>
                  <p className="text-xs text-gray-500">{selected.phoneNumber}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-green-600" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Sem mensagens</p>
                ) : (
                  <div className="space-y-2">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${
                          m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                            m.direction === 'OUTBOUND'
                              ? 'bg-green-600 text-white'
                              : 'bg-white border border-gray-200'
                          }`}
                        >
                          <p>{m.content}</p>
                          <p
                            className={`text-[10px] mt-1 ${
                              m.direction === 'OUTBOUND' ? 'text-green-100' : 'text-gray-400'
                            }`}
                          >
                            {new Date(m.createdAt).toLocaleTimeString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
