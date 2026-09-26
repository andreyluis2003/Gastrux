'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createOutbox, type Outbox, type OutboxEntry } from '@/lib/offline/outbox';
import { indexedDbStore } from '@/lib/offline/idb-store';

/**
 * One outbox per browser tab (lib/offline/outbox.ts), kept in IndexedDB. It is sent again when the
 * app opens, when the browser says the connection is back, and every 20 s while something waits.
 * A change that reached the server fires the window event "gastrux:outbox-sent" (detail: the entry)
 * so the screen that made it can refresh.
 */
interface OutboxContextValue {
  outbox: Outbox | null;
  entries: OutboxEntry[];
  online: boolean;
}

const OutboxContext = createContext<OutboxContextValue>({ outbox: null, entries: [], online: true });

let singleton: Outbox | null = null;
function getOutbox(): Outbox {
  if (!singleton) {
    singleton = createOutbox({
      store: indexedDbStore(),
      onSent: (entry) => window.dispatchEvent(new CustomEvent('gastrux:outbox-sent', { detail: entry })),
    });
  }
  return singleton;
}

export function OutboxProvider({ children }: { children: ReactNode }) {
  const [outbox, setOutbox] = useState<Outbox | null>(null);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const box = getOutbox();
    setOutbox(box);
    setOnline(navigator.onLine);
    const unsubscribe = box.subscribe(setEntries);
    const flush = () => void box.flush().catch((error) => console.error('[outbox] flush failed:', error));
    const goOnline = () => {
      setOnline(true);
      flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    flush();
    const timer = setInterval(async () => {
      if ((await box.entries()).some((e) => e.status === 'pending')) flush();
    }, 20_000);
    return () => {
      unsubscribe();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(timer);
    };
  }, []);

  const value = useMemo(() => ({ outbox, entries, online }), [outbox, entries, online]);
  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox() {
  const ctx = useContext(OutboxContext);
  return {
    ...ctx,
    /** Changes of one screen (e.g. a comanda id) still waiting to be sent. */
    pendingFor: (scope: string) => ctx.entries.filter((e) => e.scope === scope && e.status === 'pending'),
    send: (request: Parameters<Outbox['send']>[0]) => {
      if (!ctx.outbox) throw new Error('Outbox not ready');
      return ctx.outbox.send(request);
    },
  };
}
