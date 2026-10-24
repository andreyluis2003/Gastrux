/**
 * The status the Gastrux order API shows (plan 2026-10-23 api-de-pedidos): one word in Portuguese, from the order as
 * it came (ExternalOrder) and its kitchen order. The kitchen's COMPLETED is the sale done: delivered or picked up.
 */
export type PublicOrderStatus = 'aguardando_aceite' | 'aceito' | 'em_preparo' | 'pronto' | 'saiu_para_entrega' | 'entregue' | 'cancelado';

export function publicStatus(external: string, kitchen: string | null): PublicOrderStatus {
  if (external === 'CANCELLED' || external === 'REJECTED' || kitchen === 'CANCELLED') return 'cancelado';
  if (external === 'PENDING') return 'aguardando_aceite';
  if (external === 'DELIVERED' || kitchen === 'COMPLETED') return 'entregue';
  if (external === 'PICKED_UP') return 'saiu_para_entrega';
  if (kitchen === 'READY' || external === 'READY') return 'pronto';
  if (kitchen === 'PREPARING' || external === 'PREPARING') return 'em_preparo';
  return 'aceito';
}
