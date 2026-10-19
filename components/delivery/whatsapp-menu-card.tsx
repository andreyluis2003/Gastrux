'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Copy, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { awayMessage, greetingMessage, quickReplyMessage, QUICK_REPLY_SHORTCUT } from '@/lib/delivery/whatsapp-menu';

/**
 * "Cardápio automático no WhatsApp" (2026-10-18, WhatsApp option A): ready messages for the WhatsApp Business app's
 * greeting, away message and quick reply, each with the delivery menu link, plus the steps on the phone.
 */
function MessageBox({ label, help, value, onChange }: { label: string; help: string; value: string; onChange: (v: string) => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Mensagem copiada');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie.');
    }
  }
  return (
    <div className="space-y-1">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{help}</p>
        </div>
        <Button size="sm" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <><CheckCircle className="h-4 w-4 mr-1 text-green-600" /> Copiada</> : <><Copy className="h-4 w-4 mr-1" /> Copiar</>}
        </Button>
      </div>
      <textarea
        className="w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function WhatsAppMenuCard({ restaurantName, url }: { restaurantName: string; url: string }) {
  const [greeting, setGreeting] = useState('');
  const [away, setAway] = useState('');
  const [quick, setQuick] = useState('');
  useEffect(() => {
    setGreeting(greetingMessage(restaurantName, url));
    setAway(awayMessage(restaurantName, url));
    setQuick(quickReplyMessage(url));
  }, [restaurantName, url]);

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-green-100 flex items-center justify-center">
          <MessageCircle className="h-6 w-6 text-green-700" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Cardápio automático no WhatsApp</h2>
          <p className="text-sm text-muted-foreground">O WhatsApp Business do restaurante responde sozinho com o link do cardápio.</p>
        </div>
      </div>

      <MessageBox label="Mensagem de saudação" help="Vai sozinha quando um cliente manda a primeira mensagem." value={greeting} onChange={setGreeting} />
      <MessageBox label="Mensagem de ausência" help="Vai sozinha fora do horário de atendimento." value={away} onChange={setAway} />
      <MessageBox label={`Resposta rápida /${QUICK_REPLY_SHORTCUT}`} help="O atendente digita /cardapio na conversa para mandar o link." value={quick} onChange={setQuick} />

      <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
        <p className="font-semibold">Como ligar no celular (app WhatsApp Business)</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Abra o WhatsApp Business e toque em <b>Ferramentas comerciais</b> (no iPhone, em Configurações).</li>
          <li><b>Mensagem de saudação</b>: ative, toque na mensagem, apague a que está lá e cole a de cima. Em Destinatários, escolha <b>Todos</b>. Salve.</li>
          <li><b>Mensagem de ausência</b>: ative, cole a mensagem de ausência e em Horário escolha <b>Fora do horário comercial</b> (o horário fica no Perfil comercial). Salve.</li>
          <li><b>Respostas rápidas</b>: toque em +, cole a resposta rápida e use o atalho <b>{QUICK_REPLY_SHORTCUT}</b>. Salve.</li>
          <li>No <b>Perfil comercial</b>, coloque o link do cardápio no campo Site.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Regra do WhatsApp: a saudação só vai no primeiro contato do cliente ou depois de 14 dias sem conversa. Nas outras vezes, o atendente manda pelo atalho /{QUICK_REPLY_SHORTCUT}.
          O Gastrux não lê nem responde as conversas desse aplicativo.
        </p>
      </div>
    </Card>
  );
}
