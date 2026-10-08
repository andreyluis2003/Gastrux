'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useOutbox } from '@/components/offline/outbox-provider';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { entryRecipeId, groupByCategory, isUnsent, unsentCount, type MenuEntry } from '@/lib/vender/rules';

export interface ComandaLine {
  id: string;
  recipeId: string;
  addedAt?: string;
  /** When the kitchen got this line (null = new) */
  sentAt?: string | null;
  pending?: boolean;
  quantity: number;
  price: string | number;
  specialInstructions?: string | null;
  recipe: { name: string };
  modifiers?: Array<{ modifierId?: string; priceAdjustment: string | number; modifier?: { name: string } }>;
}
export interface ComandaSession {
  id: string;
  status?: string;
  sentToKitchenAt?: string | null;
  openedAt?: string;
  customerName?: string | null;
  tableNumber?: number | null;
  table?: { number: number; section?: { name: string } } | null;
  user?: { name: string | null } | null;
  items: ComandaLine[];
}
export interface Modifier { id: string; name: string; category?: string | null; priceAdjustment: number }
export interface LineDetails { quantity: number; modifierIds: string[]; notes: string }

const errorOf = async (res: Response, fallback: string) => (await res.json().catch(() => ({}))).error || fallback;

/**
 * State and actions of one comanda (spec 2026-10-07, 4.2). Every change goes through the device
 * outbox, as the old comanda screen did: offline it waits on this device and is sent once, in order.
 */
export function useComanda(sessionId: string) {
  const { send, pendingFor, online } = useOutbox();
  const [session, setSession] = useState<ComandaSession | null>(null);
  const [menu, setMenu] = useState<MenuEntry[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [staleSince, setStaleSince] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/comanda/sessions/${sessionId}`);
      if (res.ok) {
        setSession(await res.json());
        setStaleSince(res.headers.get('x-gastrux-cache') === 'stale' ? res.headers.get('x-gastrux-cached-at') : null);
      } else if (res.status === 503) {
        toast.error('Sem internet e esta comanda não está guardada neste aparelho.');
      }
    } catch {
      toast.error('Erro ao carregar a comanda');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
    fetch('/api/cardapio/itens').then((r) => (r.ok ? r.json() : [])).then((items) => setMenu(items || [])).catch(() => {});
    fetch('/api/modifiers').then((r) => (r.ok ? r.json() : {})).then((d: any) => setModifiers(d.modifiers || [])).catch(() => {});
  }, [refresh]);

  // A change made offline reached the server: show the comanda as the server has it now
  useEffect(() => {
    const onSent = (event: Event) => { if ((event as CustomEvent).detail?.scope === sessionId) refresh(); };
    window.addEventListener('gastrux:outbox-sent', onSent);
    return () => window.removeEventListener('gastrux:outbox-sent', onSent);
  }, [sessionId, refresh]);

  const mutate = async (
    method: 'POST' | 'PUT' | 'DELETE', url: string, body: unknown, label: string, display?: Record<string, unknown>,
  ): Promise<Response | null> => {
    const result = await send({ method, url, body, label, scope: sessionId, queueable: true, display });
    if (result.queued) {
      toast.info(`Sem internet: "${label}" ficou guardado neste aparelho e será enviado quando a conexão voltar.`);
      return null;
    }
    return result.response;
  };

  // What this device still has to send for this comanda (made offline)
  const pendingOps = pendingFor(sessionId);
  const pendingRemovals = new Set(pendingOps.filter((e) => e.method === 'DELETE').map((e) => e.url.split('/').pop()));
  const pendingLines: ComandaLine[] = pendingOps
    .filter((e) => e.method === 'POST' && e.url.endsWith('/items'))
    .map((e) => ({
      id: e.id,
      recipeId: String((e.display as any)?.recipeId ?? ''),
      pending: true,
      quantity: Number((e.display as any)?.quantity ?? 1),
      price: Number((e.display as any)?.unitPrice ?? 0),
      recipe: { name: String((e.display as any)?.name ?? 'Item') },
      modifiers: ((e.display as any)?.modifiers ?? []) as ComandaLine['modifiers'],
      specialInstructions: ((e.display as any)?.notes as string) || null,
    }));
  const lines: ComandaLine[] = [...(session?.items ?? []).filter((i) => !pendingRemovals.has(i.id)), ...pendingLines];
  const closePending = pendingOps.some((e) => e.method === 'PUT' && (e.body as any)?.status === 'CLOSED');
  const isClosed = session?.status === 'CLOSED' || session?.status === 'CANCELLED' || closePending;
  const totalCents = lines.reduce((s, l) => s + lineTotalCents(l.price, l.quantity, (l.modifiers ?? []).map((m) => m.priceAdjustment)), 0);
  const newCount = unsentCount(lines);
  const groups = useMemo(() => groupByCategory(menu), [menu]);

  function postLine(entry: MenuEntry, d: LineDetails, merge = false): Promise<Response | null> {
    const chosen = modifiers.filter((m) => d.modifierIds.includes(m.id));
    return mutate(
      'POST',
      `/api/comanda/sessions/${sessionId}/items`,
      { menuItemId: entry.id, recipeId: entryRecipeId(entry), quantity: d.quantity, modifierIds: d.modifierIds, specialInstructions: d.notes.trim() || null, merge },
      `${d.quantity}x ${entry.name}`,
      {
        name: entry.name, recipeId: entryRecipeId(entry), quantity: d.quantity, unitPrice: Number(entry.price), notes: d.notes.trim(),
        modifiers: chosen.map((m) => ({ priceAdjustment: m.priceAdjustment, modifier: { name: m.name } })),
      },
    );
  }

  /** Undo of a tap: one unit back on that line (the server removes the line at the last unit). A line
   *  the kitchen got in the meantime is refused by the server: it follows the normal removal (a manager,
   *  with a reason), never a silent one. Relative, so it never wipes the taps made after it. */
  async function undo(itemId: string, name: string) {
    const res = await mutate('PUT', `/api/comanda/sessions/${sessionId}/items/${itemId}`, { quantityDelta: -1 }, `Desfazer ${name}`);
    if (res && res.status === 409) toast.warning('A cozinha já recebeu este item: para tirar, toque nele e use "Remover com motivo".');
    else if (res && !res.ok) toast.error(await errorOf(res, 'Não foi possível desfazer'));
    await refresh();
  }

  /** One tap = one unit (spec 4.2). The server decides whether it goes on the same new plain line
   *  (under the comanda lock), so quick taps and other devices never lose a unit nor duplicate a line. */
  async function quickAdd(entry: MenuEntry) {
    if (isClosed) return;
    const res = await postLine(entry, { quantity: 1, modifierIds: [], notes: '' }, true);
    if (res && !res.ok) { toast.error(await errorOf(res, 'Erro ao lançar')); return; }
    const line = res ? await res.json().catch(() => null) : null;
    await refresh();
    toast.success(`${entry.name} +1`, {
      duration: 5000,
      ...(line?.id ? { action: { label: 'Desfazer', onClick: () => undo(line.id, entry.name) } } : {}),
    });
  }

  async function addWithDetails(entry: MenuEntry, d: LineDetails): Promise<boolean> {
    const res = await postLine(entry, d);
    if (res && !res.ok) { toast.error(await errorOf(res, 'Erro ao lançar')); return false; }
    await refresh();
    return true;
  }

  async function saveLine(line: ComandaLine, d: LineDetails): Promise<boolean> {
    const res = await mutate(
      'PUT',
      `/api/comanda/sessions/${sessionId}/items/${line.id}`,
      { quantity: d.quantity, modifierIds: d.modifierIds, specialInstructions: d.notes.trim() || null },
      `Alterar ${line.recipe.name}`,
    );
    if (res && !res.ok) { toast.error(await errorOf(res, 'Erro ao salvar')); return false; }
    await refresh();
    return true;
  }

  // An item the kitchen already has is a cancellation: a manager, with a reason (rule of the API)
  async function removeLine(line: ComandaLine) {
    let reason: string | undefined;
    if (!isUnsent(line)) {
      const asked = window.prompt('A cozinha já recebeu este item (exige gerente). Motivo do cancelamento:');
      if (!asked || !asked.trim()) return;
      reason = asked.trim();
    }
    const res = await mutate('DELETE', `/api/comanda/sessions/${sessionId}/items/${line.id}`, reason ? { reason } : {}, `Remover ${line.recipe.name}`);
    if (res && !res.ok) { toast.error(await errorOf(res, 'Erro ao remover')); return; }
    if (res) toast.success('Item removido');
    await refresh();
  }

  async function sendToKitchen(): Promise<boolean> {
    if (newCount === 0) return false;
    const res = await mutate('POST', `/api/comanda/sessions/${sessionId}/send-to-kitchen`, {}, 'Enviar para a cozinha');
    if (!res) {
      toast.warning('A cozinha só recebe este pedido quando a internet voltar: avise a cozinha agora.', { duration: 10000 });
      return false;
    }
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Erro ao enviar'); return false; }
    toast.success(`Enviado para a cozinha${data.order?.orderNumber ? ` (pedido ${data.order.orderNumber})` : ''}`);
    await refresh();
    return true;
  }

  return { session, menu, groups, modifiers, loading, staleSince, online, lines, isClosed, totalCents, newCount, quickAdd, addWithDetails, saveLine, removeLine, sendToKitchen, refresh, mutate };
}
