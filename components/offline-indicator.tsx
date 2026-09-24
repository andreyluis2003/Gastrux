'use client';

import { WifiOff, CloudUpload, AlertTriangle } from 'lucide-react';
import { useOutbox } from '@/components/offline/outbox-provider';

/**
 * Honest offline banner (owner decision 2026-09-24, offline option (a)): says what keeps working on
 * this device, what does not, and what is waiting to be sent. It used to say "App working offline"
 * while every change made offline was lost.
 */
export function OfflineIndicator() {
  const { online, entries, outbox } = useOutbox();
  const pending = entries.filter((e) => e.status === 'pending');
  const failed = entries.filter((e) => e.status === 'failed');

  if (online && pending.length === 0 && failed.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 text-white text-sm shadow-md" role="status" aria-live="polite">
      {!online && (
        <div className="bg-red-600 px-4 py-2 flex flex-wrap items-center gap-2 justify-center text-center">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            <strong>Sem internet.</strong> Comanda, venda balcão e sangria continuam neste aparelho e serão enviadas
            quando a internet voltar. PIX, delivery, relatórios e cadastros ficam indisponíveis.
            {pending.length > 0 && <strong> {pending.length} aguardando envio.</strong>}
          </span>
        </div>
      )}
      {online && pending.length > 0 && (
        <div className="bg-amber-600 px-4 py-2 flex items-center gap-2 justify-center">
          <CloudUpload className="w-4 h-4 animate-pulse" />
          <span>Enviando {pending.length} {pending.length === 1 ? 'operação feita' : 'operações feitas'} sem internet...</span>
        </div>
      )}
      {failed.length > 0 && (
        <div className="bg-red-800 px-4 py-2 space-y-1">
          {failed.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center gap-2 justify-center">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Não foi possível enviar: <strong>{entry.label}</strong> ({entry.lastError}). Refaça pela tela, se ainda for preciso.
              </span>
              <button
                type="button"
                className="underline font-semibold"
                onClick={() => void outbox?.discard(entry.id)}
              >
                Descartar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
