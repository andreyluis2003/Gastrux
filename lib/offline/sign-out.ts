'use client';

import { signOut, type SignOutParams } from 'next-auth/react';
import { indexedDbStore } from './idb-store';

/**
 * Logout that does not leave the next person on this device the previous one's data, nor silently
 * drops sales made offline (bad-day scenario 1, O2):
 * - while changes made offline are still waiting to be sent, the operator is warned (market practice:
 *   a POS does not close the shift with unsent sales) and may stay to send them;
 * - the service worker is asked to clear every cache (API answers, pages);
 * - leaving anyway discards the waiting changes, which would otherwise be sent later under the
 *   next person's login.
 */
export async function signOutSafely(params?: SignOutParams<boolean>) {
  const store = indexedDbStore();
  const waiting = (await store.all().catch(() => [])).filter((e) => e.status === 'pending');
  if (waiting.length > 0) {
    const leave = window.confirm(
      `Há ${waiting.length} ${waiting.length === 1 ? 'operação feita' : 'operações feitas'} sem internet ainda não ${waiting.length === 1 ? 'enviada' : 'enviadas'} ` +
        '(itens, vendas, sangrias). Conecte-se à internet e aguarde o envio antes de sair.\n\n' +
        'Sair mesmo assim e DESCARTAR essas operações?'
    );
    if (!leave) return;
  }
  await store.clear?.().catch(() => null);
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHE' });
  await signOut(params);
}
