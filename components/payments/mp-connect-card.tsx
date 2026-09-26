'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, Wallet } from 'lucide-react';

interface ConnectStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  mpUserId: string | null;
  liveMode: boolean | null;
  connectedAt: string | null;
}

// Result codes set by GET /api/pagamentos/mp/connect/callback.
const RESULT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Mercado Pago conectado! Seus clientes já podem pagar com PIX online.' },
  denied: { ok: false, text: 'Você cancelou a autorização no Mercado Pago.' },
  invalid_state: { ok: false, text: 'A sessão de conexão expirou. Tente conectar novamente.' },
  unauthorized: { ok: false, text: 'Apenas o dono ou administrador pode conectar o Mercado Pago.' },
  error: { ok: false, text: 'Não foi possível concluir a conexão. Tente novamente.' },
};

export function MpConnectCard() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pagamentos/mp/connect');
      if (res.ok) setStatus(await res.json());
      else toast.error('Não foi possível carregar o status do Mercado Pago');
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const result = new URLSearchParams(window.location.search).get('mp');
    const message = result ? RESULT_MESSAGES[result] : undefined;
    if (message) {
      if (message.ok) toast.success(message.text);
      else toast.error(message.text);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [load]);

  const connect = () => {
    setBusy(true);
    window.location.href = '/api/pagamentos/mp/connect/start';
  };

  const disconnect = async () => {
    if (!window.confirm('Desconectar o Mercado Pago? Seus clientes deixarão de ver o PIX online.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/pagamentos/mp/connect', { method: 'DELETE' });
      if (res.ok) {
        toast.success('Mercado Pago desconectado');
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Não foi possível desconectar');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </Card>
    );
  }

  if (!status?.configured) {
    return (
      <Card className="p-6">
        <p className="text-sm text-gray-600">
          A conexão com o Mercado Pago ainda não está disponível. Fale com o suporte do Gastrux.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Wallet className="h-6 w-6 text-sky-600 mt-0.5" />
        <div>
          <h2 className="text-lg font-semibold">Mercado Pago</h2>
          <p className="text-sm text-gray-600">
            Conecte a sua conta para receber os pagamentos PIX e de cartão dos seus clientes direto nela.
            O Gastrux não cobra taxa sobre esses pagamentos.
          </p>
        </div>
      </div>

      {status.connected && (
        <div className="flex items-center gap-2 text-green-700 text-sm">
          <CheckCircle2 className="h-4 w-4" />
          Conectado{status.mpUserId ? ` (conta ${status.mpUserId})` : ''}
          {status.liveMode === false ? ' · modo de teste' : ''}
        </div>
      )}

      {status.needsReconnect && (
        <div className="flex items-start gap-2 text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>
            A conexão expirou ou foi revogada. Enquanto isso, o PIX online está indisponível para os seus clientes.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!status.connected && (
          <Button onClick={connect} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {status.needsReconnect ? 'Reconectar Mercado Pago' : 'Conectar Mercado Pago'}
          </Button>
        )}
        {(status.connected || status.needsReconnect) && (
          <Button variant="outline" onClick={disconnect} disabled={busy}>
            Desconectar
          </Button>
        )}
      </div>

      {status.connected && (
        <p className="text-xs text-gray-500">
          Desconectar aqui apenas remove o acesso guardado pelo Gastrux. Para revogar a autorização
          por completo, remova o aplicativo nas configurações da sua conta do Mercado Pago.
        </p>
      )}
    </Card>
  );
}
